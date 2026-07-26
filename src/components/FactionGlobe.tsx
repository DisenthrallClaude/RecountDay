/**
 * FactionGlobe.tsx —— 势力分布 · 像素星球
 * ============================================================================
 * 用一颗可自由旋转的点阵星球承载 22 个势力据点，取代原来的星盘式分类图。
 *
 * 为什么用 canvas 而不是 DOM/SVG：
 *   球面上有近万个点，每帧都要重新投影、做深度排序与光照。
 *   若用 DOM 节点，光是布局与合成就撑不到 60fps；canvas 逐帧重绘
 *   反而是最省的做法，也天然适合"像素颗粒"的质感。
 *
 * 渲染顺序：点云 → 经纬网 → 大圆连线 → 光栅化分级 → 轨道环 → 大气抖动 → 据点。
 * 所有点先写进一张低分辨率的深度/亮度缓冲（cell 网格），最后按亮度分 5 档
 * 批量 fillRect，从而把上万次绘制压缩成 5 次状态切换。
 * ============================================================================
 */

import { useCallback, useEffect, useRef } from "react";
import { FACTIONS } from "../data/factions";
import { FACTION_LINKS, FACTION_SITES, isLand } from "../data/factionGeo";

type V3 = [number, number, number];
type P = { x: number; y: number; z: number; land: boolean; seed: number; speed: number };

const DEG = Math.PI / 180;
const POINT_COUNT = 8600;

/** 星球主色：暖金（陆）与冷灰（海），与整体黑金调一致 */
const INK_LAND = "244,232,200";
const INK_SEA = "150,146,132";
const INK_MARK = "255,240,196";

function buildPoints(): P[] {
  const pts: P[] = [];
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < POINT_COUNT; i++) {
    const y = 1 - (i / (POINT_COUNT - 1)) * 2;
    const r = Math.sqrt(Math.max(0, 1 - y * y));
    const theta = golden * i;
    const x = Math.cos(theta) * r;
    const z = Math.sin(theta) * r;
    const lat = Math.asin(y) / DEG;
    const lon = Math.atan2(z, x) / DEG;
    const land = isLand(lat, lon);
    // 海洋点抽稀一半：陆地轮廓因此更清晰，同时省一半计算
    if (!land && i % 2 === 1) continue;
    pts.push({ x, y, z, land, seed: Math.random(), speed: 0.15 + Math.random() * 0.85 });
  }
  return pts;
}

function sph(lat: number, lon: number): V3 {
  const la = lat * DEG;
  const lo = lon * DEG;
  return [Math.cos(la) * Math.cos(lo), Math.sin(la), Math.cos(la) * Math.sin(lo)];
}

function slerp(a: V3, b: V3, t: number): V3 {
  let d = a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  d = Math.max(-1, Math.min(1, d));
  const o = Math.acos(d);
  if (o < 1e-5) return a;
  const s = Math.sin(o);
  const k1 = Math.sin((1 - t) * o) / s;
  const k2 = Math.sin(t * o) / s;
  return [a[0] * k1 + b[0] * k2, a[1] * k1 + b[1] * k2, a[2] * k1 + b[2] * k2];
}

function shortAngle(a: number) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

export interface GlobeProps {
  selectedId: number | null;
  hoveredId: number | null;
  autoRotate: boolean;
  onSelect: (id: number) => void;
  onHover: (id: number | null) => void;
  /** 每个据点在屏幕上的位置，供外层渲染 HTML 标签 */
  onProject?: (pts: { id: number; x: number; y: number; vis: boolean }[]) => void;
  /**
   * 镜头遥测。约每 6 帧上报一次 —— 逐帧上报会把外层的读数变成噪声，
   * 也白白多出 60 次/秒的 setState。
   */
  onTelemetry?: (t: { lat: number; lon: number; zoom: number; fps: number }) => void;
  /** 是否绘制选中据点的大圆连线 */
  showLinks?: boolean;
  reduce?: boolean;
}

export default function FactionGlobe({
  selectedId,
  hoveredId,
  autoRotate,
  onSelect,
  onHover,
  onProject,
  onTelemetry,
  showLinks = true,
  reduce = false,
}: GlobeProps) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const points = useRef<P[]>([]);
  const projected = useRef<{ id: number; x: number; y: number; vis: boolean }[]>([]);

  // 所有高频状态放 ref，避免每帧 setState 触发 React 重渲染
  const st = useRef({
    rotY: -0.55,
    rotX: 0.3,
    velY: 0,
    velX: 0,
    zoom: 1,
    zoomTarget: 1,
    targetY: null as number | null,
    targetX: null as number | null,
    dragging: false,
    moved: false,
    lastX: 0,
    lastY: 0,
    pointerX: -9999,
    pointerY: -9999,
    hovered: null as number | null,
    selected: null as number | null,
    intro: 0,
    auto: true,
    links: true,
    linkT: 0,
    ripple: -1,
  });

  useEffect(() => {
    points.current = buildPoints();
  }, []);

  useEffect(() => { st.current.auto = autoRotate; }, [autoRotate]);
  useEffect(() => { st.current.links = showLinks; }, [showLinks]);
  useEffect(() => { st.current.hovered = hoveredId; }, [hoveredId]);

  // 选中据点：把它转到正面并轻微推近
  useEffect(() => {
    const s = st.current;
    s.selected = selectedId;
    s.linkT = 0;
    s.ripple = 0;
    const site = FACTION_SITES.find((x) => x.id === selectedId);
    if (site) {
      s.targetY = site.lon * DEG - Math.PI / 2;
      s.targetX = site.lat * DEG;
      s.zoomTarget = 1.2;
    } else {
      s.zoomTarget = 1;
    }
  }, [selectedId]);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    const s = st.current;
    s.dragging = true;
    s.moved = false;
    s.lastX = e.clientX;
    s.lastY = e.clientY;
    s.targetY = null;
    s.targetX = null;
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  }, []);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    const s = st.current;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    s.pointerX = e.clientX - rect.left;
    s.pointerY = e.clientY - rect.top;
    if (!s.dragging) return;
    const dx = e.clientX - s.lastX;
    const dy = e.clientY - s.lastY;
    if (Math.abs(dx) + Math.abs(dy) > 3) s.moved = true;
    s.lastX = e.clientX;
    s.lastY = e.clientY;
    s.rotY += dx * 0.0062;
    s.rotX = Math.max(-1.32, Math.min(1.32, s.rotX + dy * 0.0052));
    s.velY = dx * 0.0062;
    s.velX = dy * 0.0052;
  }, []);

  const endDrag = useCallback(() => { st.current.dragging = false; }, []);

  const onWheel = useCallback((e: React.WheelEvent) => {
    const s = st.current;
    s.zoomTarget = Math.max(0.72, Math.min(2.0, s.zoomTarget - e.deltaY * 0.0011));
  }, []);

  const onClick = useCallback(() => {
    // 拖动结束的那一下不应被当成点击
    if (st.current.moved) return;
    if (st.current.hovered != null) onSelect(st.current.hovered);
  }, [onSelect]);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const wrap = wrapRef.current!;
    const ctx = canvas.getContext("2d", { alpha: true })!;
    let raf = 0;
    let W = 0, H = 0, dpr = 1, cell = 3, gw = 0, gh = 0;
    const tele = { frames: 0, fps: 60 };
    let depth = new Float32Array(0);
    let lumL = new Float32Array(0); // 陆地亮度
    let lumS = new Float32Array(0); // 海洋亮度

    const resize = () => {
      dpr = Math.min(2, window.devicePixelRatio || 1);
      const r = wrap.getBoundingClientRect();
      W = Math.max(1, Math.floor(r.width * dpr));
      H = Math.max(1, Math.floor(r.height * dpr));
      canvas.width = W;
      canvas.height = H;
      canvas.style.width = `${r.width}px`;
      canvas.style.height = `${r.height}px`;
      cell = Math.max(2, Math.round(2.9 * dpr));
      gw = Math.ceil(W / cell) + 1;
      gh = Math.ceil(H / cell) + 1;
      depth = new Float32Array(gw * gh);
      lumL = new Float32Array(gw * gh);
      lumS = new Float32Array(gw * gh);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(wrap);

    const LEVELS = [0.14, 0.3, 0.5, 0.72, 1];
    const bucketsL: number[][] = [[], [], [], [], []];
    const bucketsS: number[][] = [[], [], [], [], []];
    let last = performance.now();

    const frame = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const t = now / 1000;
      const s = st.current;

      s.intro = Math.min(1, s.intro + dt * (reduce ? 2 : 0.5));
      const intro = 1 - Math.pow(1 - s.intro, 3);
      s.linkT = Math.min(1, s.linkT + dt * 0.85);
      if (s.ripple >= 0) {
        s.ripple += dt;
        if (s.ripple > 1.5) s.ripple = -1;
      }

      // 镜头：优先追向目标据点，否则惯性 + 自转
      if (s.targetY !== null && s.targetX !== null) {
        s.rotY += shortAngle(s.targetY - s.rotY) * Math.min(1, dt * 3);
        s.rotX += (s.targetX - s.rotX) * Math.min(1, dt * 3);
        if (Math.abs(shortAngle(s.targetY - s.rotY)) < 0.004 && Math.abs(s.targetX - s.rotX) < 0.004) {
          s.targetY = null;
          s.targetX = null;
        }
      } else if (!s.dragging) {
        s.velY *= 0.93;
        s.velX *= 0.9;
        s.rotY += s.velY + (s.auto && !reduce ? 0.055 : 0) * dt;
        s.rotX = Math.max(-1.32, Math.min(1.32, s.rotX + s.velX));
        s.rotX += (0.18 - s.rotX) * dt * 0.22;
      }
      s.zoom += (s.zoomTarget - s.zoom) * Math.min(1, dt * 4);

      const narrow = W / dpr < 820;
      const cx = W / 2;
      const cy = H * (narrow ? 0.42 : 0.5);
      const R = Math.min(W, H) * (narrow ? 0.4 : 0.35) * s.zoom * (0.72 + 0.28 * intro);

      ctx.clearRect(0, 0, W, H);
      depth.fill(0);
      lumL.fill(0);
      lumS.fill(0);

      const cyR = Math.cos(s.rotY), syR = Math.sin(s.rotY);
      const cxR = Math.cos(s.rotX), sxR = Math.sin(s.rotX);

      const rot = (v: V3): V3 => {
        const x1 = v[0] * cyR + v[2] * syR;
        const z1 = -v[0] * syR + v[2] * cyR;
        const y2 = v[1] * cxR - z1 * sxR;
        const z2 = v[1] * sxR + z1 * cxR;
        return [x1, y2, z2];
      };

      // 一道缓慢上下扫过的"叙事潮汐"，让静止的球面也有呼吸
      const band = Math.sin(t * 0.34) * 0.95;

      const put = (gx: number, gy: number, z: number, l: number, land: boolean) => {
        if (gx < 0 || gy < 0 || gx >= gw || gy >= gh) return;
        const idx = gy * gw + gx;
        const buf = land ? lumL : lumS;
        if (z > depth[idx]) {
          depth[idx] = z;
          // 新的更近的点覆盖：清掉另一层，避免海陆亮度互相污染
          (land ? lumS : lumL)[idx] = 0;
          buf[idx] = l;
        } else if (buf[idx] < l && z > depth[idx] - 0.06) {
          buf[idx] = l;
        }
      };

      // ── 点云 ──
      const pts = points.current;
      for (let i = 0; i < pts.length; i++) {
        const p = pts[i];
        const x1 = p.x * cyR + p.z * syR;
        const z1 = -p.x * syR + p.z * cyR;
        const y2 = p.y * cxR - z1 * sxR;
        const z2 = p.y * sxR + z1 * cxR;
        if (z2 <= 0.02) continue;
        const sxp = cx + x1 * R;
        const syp = cy - y2 * R;
        if (sxp < 0 || syp < 0 || sxp >= W || syp >= H) continue;

        const facing = Math.pow(z2, 0.55);
        let l = p.land ? 0.36 + facing * 0.6 : 0.1 + facing * 0.14;
        // 斜上方主光
        const lightDot = x1 * -0.42 + y2 * 0.5 + z2 * 0.75;
        l *= 0.62 + 0.5 * Math.max(0, lightDot);

        // 潮汐扫描带
        const d1 = (y2 - band) * (y2 - band);
        l += Math.exp(-d1 / 0.0016) * (p.land ? 0.45 : 0.3);
        // 零星闪烁，像纸面上未干的墨点
        const f = (t * p.speed + p.seed) % 1;
        if (f < 0.04) l += p.land ? 0.5 : 0.28;

        // 选中据点扩散出的涟漪
        if (s.ripple >= 0 && s.selected != null) {
          const site = FACTION_SITES.find((m) => m.id === s.selected);
          if (site) {
            const c = sph(site.lat, site.lon);
            const dot = p.x * c[0] + p.y * c[1] + p.z * c[2];
            const ang = Math.acos(Math.max(-1, Math.min(1, dot)));
            const w = s.ripple * 3.2;
            l += Math.exp(-Math.pow(ang - w, 2) / 0.006) * 0.95 * (1 - s.ripple / 1.5);
          }
        }

        l *= intro;
        if (l <= 0.05) continue;
        put((sxp / cell) | 0, (syp / cell) | 0, z2, l, p.land);
      }

      // ── 经纬网（很淡，只用来确认这是个球） ──
      for (let lat = -60; lat <= 60; lat += 30) {
        for (let i = 0; i < 150; i++) {
          const lon = (i / 150) * 360 - 180;
          const v = rot(sph(lat, lon));
          if (v[2] <= 0.02) continue;
          put(((cx + v[0] * R * 1.002) / cell) | 0, ((cy - v[1] * R * 1.002) / cell) | 0,
              v[2] + 0.001, (0.1 + v[2] * 0.18) * intro, false);
        }
      }

      // ── 选中据点的大圆连线 ──
      if (s.selected != null && s.links) {
        const src = FACTION_SITES.find((m) => m.id === s.selected);
        const links = FACTION_LINKS[s.selected] ?? [];
        if (src) {
          const a = sph(src.lat, src.lon);
          for (const lid of links) {
            const dst = FACTION_SITES.find((m) => m.id === lid);
            if (!dst) continue;
            const b = sph(dst.lat, dst.lon);
            for (let i = 0; i <= 84; i++) {
              const u = i / 84;
              if (u > s.linkT) break;
              const q = slerp(a, b, u);
              const lift = 1 + Math.sin(u * Math.PI) * 0.13;
              const v = rot([q[0] * lift, q[1] * lift, q[2] * lift]);
              if (v[2] <= 0.02) continue;
              const head = Math.exp(-Math.pow(u - (s.linkT % 1), 2) / 0.0012);
              const pulse = Math.exp(-Math.pow((((u - t * 0.26) % 1) + 1) % 1, 2) / 0.002);
              put(((cx + v[0] * R) / cell) | 0, ((cy - v[1] * R) / cell) | 0,
                  v[2] + 0.2, (0.4 + head * 0.6 + pulse * 0.7) * intro, true);
            }
          }
        }
      }

      // ── 光栅化：按亮度分 5 档批量绘制 ──
      for (let b = 0; b < 5; b++) { bucketsL[b].length = 0; bucketsS[b].length = 0; }
      const bucketize = (buf: Float32Array, out: number[][]) => {
        for (let y = 0; y < gh; y++) {
          for (let x = 0; x < gw; x++) {
            const l = buf[y * gw + x];
            if (l <= 0.05) continue;
            let b = 0;
            if (l > 0.86) b = 4; else if (l > 0.62) b = 3;
            else if (l > 0.4) b = 2; else if (l > 0.2) b = 1;
            out[b].push(x * cell, y * cell);
          }
        }
      };
      bucketize(lumL, bucketsL);
      bucketize(lumS, bucketsS);

      const sz = cell - (cell > 3 ? 1 : 0);
      for (let b = 0; b < 5; b++) {
        if (bucketsS[b].length) {
          ctx.fillStyle = `rgba(${INK_SEA},${LEVELS[b] * 0.85})`;
          const arr = bucketsS[b];
          for (let i = 0; i < arr.length; i += 2) ctx.fillRect(arr[i], arr[i + 1], sz, sz);
        }
        if (bucketsL[b].length) {
          ctx.fillStyle = `rgba(${INK_LAND},${LEVELS[b]})`;
          const arr = bucketsL[b];
          for (let i = 0; i < arr.length; i += 2) ctx.fillRect(arr[i], arr[i + 1], sz, sz);
        }
      }

      // ── 轨道环 ──
      const drawRing = (radius: number, tilt: number, phase: number, alpha: number, steps: number) => {
        ctx.fillStyle = `rgba(${INK_LAND},${alpha})`;
        for (let i = 0; i < steps; i++) {
          const a = (i / steps) * Math.PI * 2 + phase;
          const rx = Math.cos(a) * radius;
          const rz = Math.sin(a) * radius;
          const yy = rz * Math.sin(tilt);
          const zz = rz * Math.cos(tilt);
          const px = cx + rx;
          const py = cy - yy;
          if (px < 0 || py < 0 || px >= W || py >= H) continue;
          ctx.globalAlpha = zz > 0 ? 1 : 0.3;
          ctx.fillRect(Math.round(px / cell) * cell, Math.round(py / cell) * cell, sz, sz);
        }
        ctx.globalAlpha = 1;
      };
      drawRing(R * 1.22, 1.12, t * 0.22, 0.4 * intro, 150);
      drawRing(R * 1.42, -0.86, -t * 0.14, 0.2 * intro, 110);

      // ── 大气层抖动 ──
      ctx.fillStyle = `rgba(${INK_LAND},${0.09 * intro})`;
      for (let i = 0; i < 260; i++) {
        if (i % 3 === 0) continue;
        const a = (i / 260) * Math.PI * 2;
        const rr = R * (1.035 + 0.02 * Math.sin(a * 7 + t));
        ctx.fillRect(Math.round((cx + Math.cos(a) * rr) / cell) * cell,
                     Math.round((cy + Math.sin(a) * rr) / cell) * cell, sz, sz);
      }

      // ── 势力据点 ──
      projected.current = [];
      const ms = Math.max(2, Math.round(dpr * 2));
      for (const site of FACTION_SITES) {
        const v = rot(sph(site.lat, site.lon));
        const vis = v[2] > 0.06;
        const sxp = cx + v[0] * R * 1.006;
        const syp = cy - v[1] * R * 1.006;
        projected.current.push({ id: site.id, x: sxp / dpr, y: syp / dpr, vis });
        if (!vis) continue;

        const isSel = s.selected === site.id;
        const isHov = s.hovered === site.id;
        const linked = s.selected != null && (FACTION_LINKS[s.selected] ?? []).includes(site.id);
        const pulse = 0.5 + 0.5 * Math.sin(t * 2.2 + site.lat);
        const alpha = (isSel ? 1 : isHov ? 0.95 : linked ? 0.8 : 0.36 + 0.28 * pulse)
          * intro * Math.min(1, v[2] * 3);

        const qx = Math.round(sxp / cell) * cell;
        const qy = Math.round(syp / cell) * cell;
        ctx.fillStyle = `rgba(${INK_MARK},${alpha})`;
        ctx.fillRect(qx - ms, qy - ms, ms * 2, ms * 2);

        if (isSel || isHov) {
          const rr = cell * (isSel ? 4 : 3) + (isSel ? Math.sin(t * 3) * cell * 0.6 : 0);
          ctx.fillStyle = `rgba(${INK_MARK},${0.9 * intro})`;
          for (let i = 0; i < 26; i++) {
            if (i % 3 === 0) continue;
            const a = (i / 26) * Math.PI * 2 + t * (isSel ? 0.9 : 0.4);
            ctx.fillRect(Math.round((qx + Math.cos(a) * rr) / cell) * cell,
                         Math.round((qy + Math.sin(a) * rr) / cell) * cell, sz, sz);
          }
          if (isSel) {
            const er = cell * 4 + ((t * 34) % 46);
            ctx.fillStyle = `rgba(${INK_MARK},${Math.max(0, 0.34 - ((t * 34) % 46) / 150)})`;
            for (let i = 0; i < 34; i++) {
              const a = (i / 34) * Math.PI * 2;
              ctx.fillRect(Math.round((qx + Math.cos(a) * er) / cell) * cell,
                           Math.round((qy + Math.sin(a) * er) / cell) * cell, sz, sz);
            }
          }
        }
      }

      onProject?.(projected.current);

      // 镜头遥测：降频上报，顺带算一个平滑后的帧率
      tele.frames++;
      if (tele.frames % 6 === 0) {
        const inst = dt > 0 ? 1 / dt : 60;
        tele.fps = tele.fps * 0.85 + inst * 0.15;
        onTelemetry?.({
          lat: s.rotX / DEG,
          lon: (((-(s.rotY + Math.PI / 2) / DEG + 180) % 360) + 360) % 360 - 180,
          zoom: s.zoom,
          fps: tele.fps,
        });
      }

      // ── 悬停拾取 ──
      if (!s.dragging && s.pointerX > -9000) {
        let best: number | null = null;
        let bestD = 26;
        for (const p of projected.current) {
          if (!p.vis) continue;
          const d = Math.hypot(p.x - s.pointerX, p.y - s.pointerY);
          if (d < bestD) { bestD = d; best = p.id; }
        }
        if (best !== s.hovered) {
          s.hovered = best;
          onHover(best);
        }
      }
      canvas.style.cursor = s.dragging ? "grabbing" : s.hovered != null ? "pointer" : "grab";

      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [onHover, onProject, onTelemetry, reduce]);

  return (
    <div ref={wrapRef} className="relative h-full w-full select-none">
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full touch-none"
        style={{ imageRendering: "pixelated" }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onPointerLeave={() => {
          endDrag();
          st.current.pointerX = -9999;
          st.current.pointerY = -9999;
          if (st.current.hovered != null) {
            st.current.hovered = null;
            onHover(null);
          }
        }}
        onWheel={onWheel}
        onClick={onClick}
      />
    </div>
  );
}

/** 供外层显示"这是哪个势力" */
export function factionName(id: number): string {
  return FACTIONS.find((f) => f.id === id)?.name ?? "";
}

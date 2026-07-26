/**
 * PaperBurn.tsx —— 纸张自焚（从一角点燃 · 烧成灰烬）
 * ============================================================================
 * 火不是"一条线平移"，是**从一个点向外吃**：一张纸被点着的角，是一圈不断
 * 长大、边缘破碎的空洞，火只存在于那圈空洞的边界上。所以整段演出由一个量
 * 驱动 —— 燃烧半径 R(t)。
 *
 *   已烧穿 : dist(p, origin) <  R            → 纸消失
 *   炭化带 : R < dist < R + CHAR             → 焦黑，向外渐变成褐
 *   预热带 : R + CHAR < dist < R + SCORCH    → 纸被烤黄
 *   火焰   : 贴着 R 的那一圈                  → 白炽核心 + 橙焰舌
 *
 * ── 为什么不用 SVG 滤镜 ──────────────────────────────────────────────
 * 上一版用 feTurbulence + feDisplacementMap 把一个正圆打碎成不规则的焦边，
 * 而且给湍流的 baseFrequency 挂了 <animate> 让火焰逐帧变形。效果对，代价
 * 却是灾难性的：浏览器每一帧都要**重新生成整幅分形噪声纹理再做位移映射**，
 * 六个带滤镜的元素就是六份这样的工作，而且全在 CPU 上。实测帧率掉到个位数
 * —— 看起来就是"卡在那个角上一直烧、烧不完"。
 *
 * 这一版把破碎边缘改成**解析求解**：
 *   1. 预生成一张 2D 值噪声场 n(x,y)（一次性，之后只读）。
 *   2. 燃烧边界定义为等值线  dist(p, origin) + A·n(p) = R。
 *   3. 每帧沿 112 条射线用二分法求根，得到 112 个点 → 一条 <path>。
 * 每帧约 900 次噪声采样，不到 0.1ms；滤镜一个都不需要。
 *
 * 更关键的是：炭化环、火焰环**不再各自求解**，而是直接把同一组射线上的
 * 交点沿径向平移 —— 于是它们与洞口的破碎边缘天然严丝合缝。
 * 纸在哪儿消失，焦痕就长在哪儿，火就烧在哪儿。这是真实感的全部来源。
 *
 * 火焰的抖动也不再靠湍流动画，而是给每条射线叠一个随时间变化的径向偏移，
 * 同样是几十次三角函数的事。
 * ============================================================================
 */

import { memo, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useReducedMotion } from "framer-motion";

type Origin = "bottom-right" | "bottom-left" | "top-right" | "top-left";

const ORIGIN_FRAC: Record<Origin, [number, number]> = {
  "bottom-right": [0.96, 0.95],
  "bottom-left": [0.04, 0.95],
  "top-right": [0.96, 0.05],
  "top-left": [0.04, 0.05],
};

/** 边界采样的射线数。76 条在 300px 宽的纸上已经看不出多边形的棱角，
 *  再多只是徒增每帧 clip-path 的重裁成本。 */
const RAYS = 84;
/**
 * 余烬画布的后备分辨率倍率（相对 CSS 像素）。
 * 火与烟没有硬边，0.75 看不出差别，填充量却只有 1x 的一半、2x 屏的八分之一。
 */
const CANVAS_SCALE = 0.75;
/** 火光层向外扩出的边距，渐变必须在这个范围内淡干净 */
const GLOW_PAD = 150;
/** 二分求根的迭代次数 */
const BISECT = 7;

export interface PaperBurnProps {
  /** 点火后置 true，演出自动跑完 */
  active: boolean;
  /** 从哪个角烧起 */
  origin?: Origin;
  /** 从点燃到吃光整张纸的时长（毫秒） */
  durationMs?: number;
  /** 余烬散尽后回调（比 durationMs 略晚） */
  onFinished?: () => void;
  /** 灰烬/余烬粒子数量 */
  density?: number;
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}

/* ────────────────────────────────────────────────────────────
   2D 值噪声：16×16 随机格点 + smoothstep 双线性，叠三个八度。
   格点表只生成一次，之后每次采样都是几次乘加。
   ──────────────────────────────────────────────────────────── */
const GRID = 16;

function makeLattice(seed: number): Float32Array {
  const a = new Float32Array(GRID * GRID);
  let s = seed >>> 0;
  for (let i = 0; i < a.length; i++) {
    // xorshift：确定性、无依赖、够随机
    s ^= s << 13; s >>>= 0;
    s ^= s >> 17;
    s ^= s << 5; s >>>= 0;
    a[i] = (s / 0xffffffff) * 2 - 1;
  }
  return a;
}

function makeNoise(lat: Float32Array) {
  const at = (ix: number, iy: number) => lat[(iy & (GRID - 1)) * GRID + (ix & (GRID - 1))];
  const base = (x: number, y: number) => {
    const ix = Math.floor(x), iy = Math.floor(y);
    let fx = x - ix, fy = y - iy;
    fx = fx * fx * (3 - 2 * fx);
    fy = fy * fy * (3 - 2 * fy);
    const a = at(ix, iy), b = at(ix + 1, iy), c = at(ix, iy + 1), d = at(ix + 1, iy + 1);
    return (a + (b - a) * fx) * (1 - fy) + (c + (d - c) * fx) * fy;
  };
  // 三个八度：低频给大块轮廓，高频给边缘的细碎锯齿
  return (x: number, y: number) =>
    base(x, y) * 0.52 +
    base(x * 2.13 + 5.7, y * 2.13 + 1.9) * 0.26 +
    base(x * 4.37 + 11.3, y * 4.37 + 7.1) * 0.14 +
    base(x * 8.9 + 21.7, y * 8.9 + 13.1) * 0.08;
}

type Particle = {
  fx: number; fy: number;
  kind: "ember" | "ash" | "smoke";
  size: number; rise: number; drift: number; spin: number; dur: number; jitter: number;
};

function rnd(i: number, salt: number) {
  const x = Math.sin(i * 12.9898 + salt * 78.233) * 43758.5453;
  return x - Math.floor(x);
}

function buildParticles(n: number, ox: number, oy: number): Particle[] {
  const out: Particle[] = [];
  for (let i = 0; i < n; i++) {
    const r1 = rnd(i, 1), r2 = rnd(i, 2), r3 = rnd(i, 3), r4 = rnd(i, 4), r5 = rnd(i, 5);
    const ang = r1 * Math.PI * 2;
    const rad = Math.sqrt(r2) * 1.2;
    out.push({
      fx: Math.min(1.04, Math.max(-0.04, ox + Math.cos(ang) * rad)),
      fy: Math.min(1.04, Math.max(-0.04, oy + Math.sin(ang) * rad * 0.85)),
      kind: r3 < 0.44 ? "ember" : r3 < 0.8 ? "ash" : "smoke",
      size: r3 < 0.44 ? 1.4 + r4 * 2.3 : r3 < 0.8 ? 2 + r4 * 3.4 : 10 + r4 * 15,
      rise: r3 < 0.44 ? 80 + r5 * 78 : r3 < 0.8 ? 44 + r5 * 62 : 62 + r5 * 62,
      drift: (r4 - 0.5) * (r3 >= 0.8 ? 56 : 40),
      spin: (r5 - 0.5) * 700,
      dur: r3 < 0.44 ? 0.85 + r3 * 0.6 : r3 < 0.8 ? 1.05 + r3 * 0.8 : 1.5 + r3 * 1,
      jitter: r5 * 0.07,
    });
  }
  return out;
}

/**
 * 火焰色带：由内（洞口）向外，白炽 → 金 → 橙 → 暗红 → 无。
 * off / width 以 CHAR（炭化带宽度）为单位，全部相对同一条燃烧边界。
 * wob 是这一带的抖动幅度 —— 外层甩得远、根部几乎不动，正是真实火焰的样子。
 */
const FLAME_RAMP: ReadonlyArray<{ off: number; width: number; color: string; wob: number }> = [
  { off: 2.6, width: 1.5, color: "rgba(140,32,3,0.15)", wob: 1.6 },
  { off: 1.5, width: 0.95, color: "rgba(198,72,8,0.28)", wob: 1.05 },
  { off: 0.86, width: 0.62, color: "rgba(238,140,30,0.45)", wob: 0.6 },
  { off: 0.44, width: 0.44, color: "rgba(250,192,84,0.62)", wob: 0.34 },
  { off: 0.12, width: 0.34, color: "rgba(255,242,206,0.9)", wob: 0.18 },
  { off: -0.16, width: 0.28, color: "rgba(255,250,232,0.42)", wob: 0.1 },
];

/** 炭化色带：紧贴火线的近黑，向外化成褐、再化回纸色 */
const CHAR_RAMP: ReadonlyArray<{ off: number; width: number; color: string }> = [
  { off: 4.7, width: 2.3, color: "rgba(116,74,32,0.14)" },
  { off: 3.0, width: 1.4, color: "rgba(92,52,18,0.3)" },
  { off: 2.15, width: 0.95, color: "rgba(60,31,10,0.5)" },
  { off: 1.45, width: 0.85, color: "rgba(30,15,5,0.76)" },
  { off: 0.82, width: 0.7, color: "rgba(11,5,2,0.95)" },
];

function PaperBurnInner({
  active,
  origin = "bottom-right",
  durationMs = 1700,
  onFinished,
  density = 46,
  children,
  className = "",
  style,
}: PaperBurnProps) {
  const reduce = !!useReducedMotion();
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });
  const uid = `pb${useId().replace(/:/g, "")}`;
  const [ox, oy] = ORIGIN_FRAC[origin];

  useLayoutEffect(() => {
    const el = hostRef.current;
    if (!el) return;
    const read = () => {
      const r = el.getBoundingClientRect();
      setBox({ w: Math.round(r.width), h: Math.round(r.height) });
    };
    read();
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const W = box.w || 1;
  const H = box.h || 1;
  const cx = ox * W;
  const cy = oy * H;

  const CHAR = Math.max(6, Math.min(16, Math.min(W, H) * 0.042));
  const SCORCH = CHAR * 3.2;
  /** 破碎幅度：边界最多偏离正圆多少像素 */
  const AMP = Math.max(10, Math.min(46, Math.min(W, H) * 0.17));
  /** 噪声的空间尺度：一个"叶瓣"大约多宽 */
  const FEAT = Math.max(40, Math.min(W, H) * 0.42);
  /** 火吃到最远那个角就够了，再补上破碎可能把边界往回拽的那一截 */
  const maxR = Math.hypot(Math.max(cx, W - cx), Math.max(cy, H - cy)) + AMP + CHAR * 4;

  const noise = useMemo(() => {
    let h = 0;
    for (let i = 0; i < uid.length; i++) h = (h * 31 + uid.charCodeAt(i)) >>> 0;
    return makeNoise(makeLattice(h || 12345));
  }, [uid]);

  const particles = useMemo(() => buildParticles(density, ox, oy), [density, ox, oy]);

  /** 余烬画布的外扩量：粒子最高能飘 250px，横向 ±90px */
  const SPARK_PAD_X = 56;
  const SPARK_PAD_Y = 170;
  const SPARK_W = W + SPARK_PAD_X * 2;
  const SPARK_H = H + SPARK_PAD_Y + 30;

  const paperClipRef = useRef<HTMLDivElement | null>(null);
  const glowRef = useRef<HTMLDivElement | null>(null);
  const paperRef = useRef<HTMLDivElement | null>(null);
  const sparkRef = useRef<HTMLCanvasElement | null>(null);

  const ready = box.w > 1;
  const burning = active && ready;

  /* ── 演出主循环 ──
     自己跑 rAF：每帧只做一次射线求解 + 七次 setAttribute，
     不经过 React，也不触发任何布局。 */
  useEffect(() => {
    if (!burning) return;

    // 复用同一组数组，整段演出零分配
    const rays = new Float32Array(RAYS);
    const cosT = new Float32Array(RAYS);
    const sinT = new Float32Array(RAYS);
    for (let i = 0; i < RAYS; i++) {
      const th = (i / RAYS) * Math.PI * 2;
      cosT[i] = Math.cos(th);
      sinT[i] = Math.sin(th);
    }

    /** 沿射线 i 求 dist + A·n = R 的根。n∈[-1,1] 保证根落在 [R-A, R+A]。 */
    const solve = (R: number, A: number) => {
      for (let i = 0; i < RAYS; i++) {
        const dx = cosT[i], dy = sinT[i];
        let lo = Math.max(0, R - A);
        let hi = R + A;
        for (let k = 0; k < BISECT; k++) {
          const mid = (lo + hi) * 0.5;
          const f = mid + A * noise((cx + mid * dx) / FEAT, (cy + mid * dy) / FEAT) - R;
          if (f < 0) lo = mid; else hi = mid;
        }
        rays[i] = (lo + hi) * 0.5;
      }
    };

    /** 把射线交点整体沿径向平移 off，拼成闭合路径。rev=true 时反向缠绕。 */
    const pathAt = (off: number, wobAmp: number, t: number, rev = false) => {
      let d = "";
      for (let k = 0; k < RAYS; k++) {
        const i = rev ? RAYS - 1 - k : k;
        let r = rays[i] + off;
        if (wobAmp > 0) {
          // 火舌抖动：两个不同周期的波叠加，避免看出规律
          r += wobAmp * (Math.sin(i * 0.83 + t * 9.1) * 0.6 + Math.sin(i * 1.97 - t * 13.7) * 0.4);
        }
        if (r < 0) r = 0;
        const x = cx + cosT[i] * r;
        const y = cy + sinT[i] * r;
        d += (k === 0 ? "M" : "L") + x.toFixed(1) + " " + y.toFixed(1);
      }
      return d + "Z";
    };
    // 外框顺时针；洞逆时针 → nonzero 规则下被挖掉
    const frame0 = `M0 0L${W} 0L${W} ${H}L0 ${H}Z`;

    /* ── 余烬画布 ──
       预渲染三张精灵图，之后每帧只做 drawImage：
       余烬（亮、带辉光）、灰片（暗、翻滚）、烟丝（大、虚）。 */
    const cv = sparkRef.current;
    const g = cv ? cv.getContext("2d") : null;
    // 后备缓冲刻意画得比 CSS 尺寸小：描边开销跟像素面积成正比，
    // 而火焰、焦痕、烟本来就是软边，降采样后由浏览器放大反而更柔和。
    // 在 2x 屏上这一项直接省掉四分之三的填充量。
    if (cv && g) {
      cv.width = Math.ceil(SPARK_W * CANVAS_SCALE);
      cv.height = Math.ceil(SPARK_H * CANVAS_SCALE);
      g.scale(CANVAS_SCALE, CANVAS_SCALE);
    }
    const sprite = (size: number, paint: (c: CanvasRenderingContext2D, s: number) => void) => {
      const c = document.createElement("canvas");
      c.width = c.height = size;
      const cc = c.getContext("2d")!;
      paint(cc, size);
      return c;
    };
    const emberImg = sprite(34, (c, n) => {
      const r = n / 2;
      const gr = c.createRadialGradient(r, r, 0, r, r, r);
      gr.addColorStop(0, "rgba(255,248,222,1)");
      gr.addColorStop(0.18, "rgba(255,190,80,0.95)");
      gr.addColorStop(0.42, "rgba(226,96,20,0.5)");
      gr.addColorStop(1, "rgba(200,70,10,0)");
      c.fillStyle = gr;
      c.fillRect(0, 0, n, n);
    });
    const ashImg = sprite(12, (c, n) => {
      c.fillStyle = "#3b332b";
      c.fillRect(n * 0.2, n * 0.28, n * 0.6, n * 0.44);
    });
    const smokeImg = sprite(72, (c, n) => {
      const r = n / 2;
      const gr = c.createRadialGradient(r, r, 0, r, r, r);
      gr.addColorStop(0, "rgba(104,94,84,0.34)");
      gr.addColorStop(0.55, "rgba(66,58,50,0.12)");
      gr.addColorStop(1, "rgba(50,44,38,0)");
      c.fillStyle = gr;
      c.fillRect(0, 0, n, n);
    });

    // 每颗粒子的出发时刻 = 火线扫到它的时刻
    const seeds = particles.map((pt) => {
      const px = pt.fx * W;
      const py = pt.fy * H;
      const dist = Math.hypot(px - cx, py - cy);
      return {
        pt,
        px,
        py,
        delay: Math.min(0.94, Math.max(0, dist / maxR + pt.jitter - 0.03)) * durationMs,
      };
    });

    /** 沿当前射线交点描一条闭合轮廓到 canvas 上（含画布外扩偏移） */
    const traceContour = (off: number, wobAmp: number, t: number) => {
      g!.beginPath();
      for (let i = 0; i < RAYS; i++) {
        let r = rays[i] + off;
        if (wobAmp > 0) {
          r += wobAmp * (Math.sin(i * 0.83 + t * 9.1) * 0.6 + Math.sin(i * 1.97 - t * 13.7) * 0.4);
        }
        if (r < 0) r = 0;
        const x = cx + cosT[i] * r + SPARK_PAD_X;
        const y = cy + sinT[i] * r + SPARK_PAD_Y;
        if (i === 0) g!.moveTo(x, y); else g!.lineTo(x, y);
      }
      g!.closePath();
    };

    const drawFx = (elapsed: number, t: number) => {
      if (!g) return;
      g.clearRect(0, 0, SPARK_W, SPARK_H);
      g.lineJoin = "bevel";

      g.save();
      // 火与焦痕只存在于纸上：画布外扩的那一圈留给余烬
      g.beginPath();
      g.rect(SPARK_PAD_X, SPARK_PAD_Y, W, H);
      g.clip();

      // 炭化：正常合成，把纸面压暗
      {
        g.globalCompositeOperation = "source-over";
        for (const b of CHAR_RAMP) {
          g.strokeStyle = b.color;
          g.lineWidth = CHAR * b.width;
          traceContour(CHAR * b.off, 0, t);
          g.stroke();
        }
      }

      // 火焰：加色合成，越叠越亮
      {
        g.globalCompositeOperation = "lighter";
        for (const b of FLAME_RAMP) {
          g.strokeStyle = b.color;
          g.lineWidth = CHAR * b.width;
          traceContour(CHAR * b.off, CHAR * b.wob, t);
          g.stroke();
        }
      }
      g.restore();
      g.globalCompositeOperation = "lighter";
      g.globalAlpha = 1;
      for (const sd of seeds) {
        const lt = (elapsed - sd.delay) / (sd.pt.dur * 1000);
        if (lt <= 0 || lt >= 1) continue;
        const { pt } = sd;
        // 上升 + 横向摆动；余烬走得快，烟走得慢且越飘越大
        const ease = 1 - Math.pow(1 - lt, 1.7);
        const x = sd.px + pt.drift * ease + SPARK_PAD_X;
        const y = sd.py + pt.rise * -ease + SPARK_PAD_Y;
        let a: number, img: HTMLCanvasElement, size: number;
        if (pt.kind === "ember") {
          a = lt < 0.14 ? lt / 0.14 : lt > 0.7 ? (1 - lt) / 0.3 : 1;
          img = emberImg;
          size = pt.size * (3.4 - lt * 1.4);
        } else if (pt.kind === "ash") {
          a = (lt < 0.18 ? lt / 0.18 : 1 - (lt - 0.18) / 0.82) * 0.92;
          img = ashImg;
          size = pt.size * 1.5;
        } else {
          a = (lt < 0.22 ? lt / 0.22 : 1 - (lt - 0.22) / 0.78) * 0.5;
          img = smokeImg;
          size = pt.size * (1 + lt * 1.6);
        }
        if (a <= 0) continue;
        g.globalAlpha = a;
        if (pt.kind === "ash") {
          // 灰片会翻滚，其余两种是各向同性的，省掉一次矩阵变换
          g.save();
          g.translate(x, y);
          g.rotate((pt.spin * lt * Math.PI) / 180);
          g.drawImage(img, -size / 2, -size / 2, size, size);
          g.restore();
        } else {
          g.drawImage(img, x - size / 2, y - size / 2, size, size);
        }
      }
      g.globalAlpha = 1;
      g.globalCompositeOperation = "source-over";
    };

    let raf = 0;
    let start = 0;
    let done = false;

    const frame = (now: number) => {
      if (!start) start = now;
      const t = (now - start) / durationMs;
      const p = Math.min(1, t);

      // 点火那一下略慢（纸角先阴燃变黑），之后基本匀速推进。
      // 上一版前 16% 的时间只推进 10% 半径，看起来就是"卡在角上不动"。
      const eased = p < 0.14 ? (p / 0.14) * (p / 0.14) * 0.09 : 0.09 + ((p - 0.14) / 0.86) * 0.91;
      const R = eased * maxR;
      const A = Math.min(AMP, Math.max(2, R * 0.85));

      solve(R, A);

      if (paperClipRef.current) {
        paperClipRef.current.style.clipPath = `path("${frame0}${pathAt(0, 0, t, true)}")`;
      }

      if (glowRef.current) {
        const fade = p > 0.82 ? Math.max(0, 1 - (p - 0.82) / 0.18) : Math.min(1, p / 0.1);
        glowRef.current.style.opacity = String(fade);
        const gr = Math.min(R * 0.8 + 50, GLOW_PAD * 1.28);
        glowRef.current.style.background =
          `radial-gradient(circle ${gr.toFixed(0)}px at ${(cx + GLOW_PAD).toFixed(0)}px ${(cy + GLOW_PAD).toFixed(0)}px,` +
          ` rgba(255,164,58,0.22) 0%, rgba(255,104,16,0.08) 34%, transparent 62%)`;
      }
      // 剩下的纸随火线推进微微翘起、离开火源方向
      if (paperRef.current) {
        paperRef.current.style.transform = `translateY(${(-9 * p).toFixed(2)}px) rotate(${(-2.2 * p).toFixed(2)}deg)`;
      }

      drawFx(now - start, t);

      // 火线到头之后余烬还要飘一会儿，循环得比 R 多跑一段
      if (now - start < durationMs + 520) {
        raf = requestAnimationFrame(frame);
      } else if (!done) {
        done = true;
        if (g) g.clearRect(0, 0, SPARK_W, SPARK_H);
      }
    };

    if (reduce) {
      // 关掉动效时不做演出，直接收场
      const t = window.setTimeout(() => onFinished?.(), 260);
      return () => window.clearTimeout(t);
    }

    raf = requestAnimationFrame(frame);
    // 火线到头之后再留一小段让余烬飘完
    const timer = window.setTimeout(() => onFinished?.(), durationMs + 520);
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(timer);
    };
  }, [burning, reduce, durationMs, maxR, AMP, CHAR, SCORCH, FEAT, cx, cy, W, H, noise, onFinished,
      particles, SPARK_W, SPARK_H, SPARK_PAD_X, SPARK_PAD_Y]);

  return (
    <div ref={hostRef} className={`relative ${className}`} style={style}>
      {/* ══ 纸：被火线挖出的洞裁掉 ══ */}
      <div
        ref={paperRef}
        className="relative"
        style={{
          transformOrigin: `${(1 - ox) * 100}% ${(1 - oy) * 100}%`,
          willChange: burning ? "transform" : undefined,
        }}
      >
        <div ref={paperClipRef} style={{ willChange: burning ? "clip-path" : undefined }}>
          {children}
        </div>
      </div>

      {/* 火光：把周围也照亮一点，火才像是有热量的 */}
      {burning && !reduce && (
        <div ref={glowRef} className="pointer-events-none absolute" style={{ inset: -GLOW_PAD, opacity: 0 }} />
      )}

      {/* ══ 余烬 / 灰片 / 烟丝 ══
          画布比纸大一圈：粒子要往上飘出纸面才不会被生硬地切掉。 */}
      {burning && !reduce && (
        <canvas
          ref={sparkRef}
          className="pointer-events-none absolute"
          style={{
            left: -SPARK_PAD_X,
            top: -SPARK_PAD_Y,
            width: SPARK_W,
            height: SPARK_H,
          }}
          aria-hidden
        />
      )}
    </div>
  );
}

export const PaperBurn = memo(PaperBurnInner);
export default PaperBurn;

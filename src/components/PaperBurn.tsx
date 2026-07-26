/**
 * PaperBurn.tsx —— 纸张自焚（从一角点燃 · 烧成灰烬）
 * ============================================================================
 * 旧实现是一条斜向的渐变色带从下往上扫过。问题不在颜色，在物理：
 * 火不是"一条线平移"，火是**从一个点向外吃**。一张纸被点着的角，
 * 是一圈不断长大的、边缘破碎的空洞，火只存在于那圈空洞的边界上。
 *
 * 所以这一版把整个演出重建在一个量上：燃烧半径 R(t)。
 *
 *   已烧穿   : dist(p, origin) <  R          → 纸消失（遮罩挖掉）
 *   炭化带   : R < dist < R + CHAR           → 焦黑，向外渐变成褐
 *   预热带   : R + CHAR < dist < R + SCORCH  → 纸被烤黄
 *   火焰     : 贴着 R 的那一圈               → 白炽核心 + 橙焰舌 + 烟
 *
 * 关键在于**同一条边界**：遮罩的洞、炭化环、火焰环共用一个
 * feTurbulence 位移滤镜（同种子、同频率、同 scale），于是三者的破碎边缘
 * 严丝合缝 —— 纸在哪儿消失，焦痕就长在哪儿，火就烧在哪儿。
 * 这一条是"真实感"的全部来源；换成三套各自独立的噪声会立刻散架。
 *
 * 两个滤镜分工：
 *   #edge  —— 静态湍流。焦痕一旦形成就不该再蠕动，不做动画（也更省）。
 *   #flame —— 动态湍流。火焰每帧都在变形，baseFrequency 循环抖动。
 *
 * 半径不走 React：R 是一个 MotionValue，订阅它之后直接写各个 <circle>
 * 的 r 属性。整段演出（60fps × 3 秒）不产生任何一次重渲染。
 * ============================================================================
 */

import { memo, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useMotionValue, animate, useReducedMotion, motion } from "framer-motion";

type Origin = "bottom-right" | "bottom-left" | "top-right" | "top-left";

const ORIGIN_FRAC: Record<Origin, [number, number]> = {
  "bottom-right": [0.965, 0.955],
  "bottom-left": [0.035, 0.955],
  "top-right": [0.965, 0.045],
  "top-left": [0.035, 0.045],
};

export interface PaperBurnProps {
  /** 点火后置 true，演出自动跑完 */
  active: boolean;
  /** 从哪个角烧起 */
  origin?: Origin;
  /** 火线从点燃到吃掉整张纸的时长（毫秒） */
  durationMs?: number;
  /** 余烬散尽后回调（比 durationMs 略晚） */
  onFinished?: () => void;
  /** 灰烬/余烬粒子数量 */
  density?: number;
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}

type Particle = {
  /** 归一化位置：决定它何时被火线扫到 */
  fx: number;
  fy: number;
  kind: "ember" | "ash" | "smoke";
  size: number;
  rise: number;
  drift: number;
  spin: number;
  dur: number;
  jitter: number;
};

/**
 * 火焰的温度分层。
 *
 * 起初这里用的是一条宽环 + 一个 radialGradient（白炽在圆心、暗红在外缘）。
 * 那是错的：渐变以**火源**为圆心铺满整个 maxR，而火环只占其中很窄的一圈，
 * 于是整条火环取到的几乎是同一个色标 —— 火线小的时候通体惨白，
 * 大的时候通体暗红，完全没有温度层次。
 *
 * 换成四条固定颜色的同心环之后，温度差是靠"环与环的半径差"表达的，
 * 与火线当前有多大无关，任何时刻都成立。
 * off/width 均以 CHAR（炭化带宽度）为单位。
 */
const FLAME_BANDS = [
  // 外层的暗红火舌：最淡、最飘，并且整体上抬 —— 火是往上走的，不是同心的
  { off: 2.1, width: 2.5, color: "rgba(176,42,4,0.3)", blur: 4, coarse: true, dy: -0.8 },
  { off: 1.0, width: 1.5, color: "rgba(255,124,20,0.46)", blur: 2.2, coarse: true, dy: -0.4 },
  // 贴着焦线的两条亮带做得很窄：真实照片里那条炽白的火线只有一两毫米，
  // 宽了就会把外侧的黑色炭化带整个盖住。
  { off: 0.38, width: 0.55, color: "rgba(255,208,110,0.95)", blur: 1, coarse: false, dy: 0 },
  { off: 0.02, width: 0.3, color: "#fff6da", blur: 0.7, coarse: false, dy: 0 },
] as const;

/** 确定性伪随机：同一张纸每次烧都长一个样，不因重渲染乱跳 */
function rnd(i: number, salt: number) {
  const x = Math.sin(i * 12.9898 + salt * 78.233) * 43758.5453;
  return x - Math.floor(x);
}

function buildParticles(n: number, ox: number, oy: number): Particle[] {
  const out: Particle[] = [];
  for (let i = 0; i < n; i++) {
    const r1 = rnd(i, 1), r2 = rnd(i, 2), r3 = rnd(i, 3), r4 = rnd(i, 4), r5 = rnd(i, 5);
    // 以火源为中心做面积均匀撒点：sqrt 让密度不至于全堆在圆心
    const ang = r1 * Math.PI * 2;
    const rad = Math.sqrt(r2) * 1.2;
    const fx = Math.min(1.04, Math.max(-0.04, ox + Math.cos(ang) * rad));
    const fy = Math.min(1.04, Math.max(-0.04, oy + Math.sin(ang) * rad * 0.85));
    const kind: Particle["kind"] = r3 < 0.42 ? "ember" : r3 < 0.78 ? "ash" : "smoke";
    out.push({
      fx,
      fy,
      kind,
      size: kind === "ember" ? 1.4 + r4 * 2.4 : kind === "ash" ? 2 + r4 * 3.6 : 10 + r4 * 16,
      rise: kind === "ember" ? 120 + r5 * 150 : kind === "ash" ? 60 + r5 * 110 : 90 + r5 * 110,
      drift: (r4 - 0.5) * (kind === "smoke" ? 90 : 58),
      spin: (r5 - 0.5) * 760,
      dur: kind === "ember" ? 0.95 + r3 * 0.7 : kind === "ash" ? 1.2 + r3 * 0.9 : 1.7 + r3 * 1.1,
      jitter: r5 * 0.08,
    });
  }
  return out;
}

function PaperBurnInner({
  active,
  origin = "bottom-right",
  durationMs = 2600,
  onFinished,
  density = 78,
  children,
  className = "",
  style,
}: PaperBurnProps) {
  const reduce = !!useReducedMotion();
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });
  // 滤镜/遮罩的 id 必须每个实例唯一，又不能在渲染期调 Math.random()。
  // useId 由 React 保证同一实例稳定、不同实例互异，且 SSR 安全；
  // 冒号在 CSS 选择器与 url(#…) 里会出问题，去掉。
  const uid = `pb${useId().replace(/:/g, "")}`;
  const [ox, oy] = ORIGIN_FRAC[origin];

  // 遮罩用 userSpaceOnUse，必须拿到真实像素尺寸
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

  // 破碎幅度随纸张尺寸缩放：小卡片上 60px 的位移会把整张纸打散
  const edgeScale = Math.max(16, Math.min(58, Math.min(W, H) * 0.19));
  const CHAR = Math.max(7, Math.min(18, Math.min(W, H) * 0.045));
  const SCORCH = CHAR * 3.4;
  // 火只需要吃到最远的那个角，再补上位移可能把边缘往回拽的那一截。
  // 从前给的余量太大，整条时间线有五分之一花在纸已经烧光的空屏上。
  const maxR = Math.hypot(Math.max(cx, W - cx), Math.max(cy, H - cy)) + edgeScale * 0.95 + 14;

  /* ── 唯一的驱动量 ── */
  const R = useMotionValue(0);
  const holeRef = useRef<SVGCircleElement | null>(null);
  const charDeepRef = useRef<SVGCircleElement | null>(null);
  const charMidRef = useRef<SVGCircleElement | null>(null);
  const scorchRef = useRef<SVGCircleElement | null>(null);
  // 火焰按温度分层，每层一个 ref
  const flameRefs = useRef<(SVGCircleElement | null)[]>([]);
  const smokeRef = useRef<SVGCircleElement | null>(null);
  const glowRef = useRef<HTMLDivElement | null>(null);
  const paperRef = useRef<HTMLDivElement | null>(null);

  // 半径 → DOM：绕开 React，逐帧只做几次属性写入
  useEffect(() => {
    const write = (v: number) => {
      holeRef.current?.setAttribute("r", String(v));
      // 炭化带落在两条亮火线之外，才不会被 screen 混合冲掉
      charDeepRef.current?.setAttribute("r", String(v + CHAR * 1.15));
      charMidRef.current?.setAttribute("r", String(v + CHAR * 3));
      scorchRef.current?.setAttribute("r", String(v + SCORCH * 0.95));
      for (let i = 0; i < FLAME_BANDS.length; i++) {
        flameRefs.current[i]?.setAttribute("r", String(v + CHAR * FLAME_BANDS[i].off));
      }
      smokeRef.current?.setAttribute("r", String(v + CHAR * 2.4));
      if (glowRef.current) {
        glowRef.current.style.background =
          `radial-gradient(circle ${v + 60}px at ${cx + 70}px ${cy + 70}px, rgba(255,164,58,0.2) 0%, rgba(255,104,16,0.07) 34%, transparent 62%)`;
      }
      // 剩下的纸随着火线推进微微翘起、离开火源方向
      if (paperRef.current) {
        const k = Math.min(1, v / maxR);
        paperRef.current.style.transform = `translateY(${-10 * k}px) rotate(${-2.4 * k}deg)`;
      }
    };
    write(R.get());
    return R.on("change", write);
  }, [R, CHAR, SCORCH, cx, cy, maxR]);

  useEffect(() => {
    if (!active) return;
    if (reduce) {
      R.set(maxR);
      const t = window.setTimeout(() => onFinished?.(), 300);
      return () => window.clearTimeout(t);
    }
    // 点火那一下慢（纸角先阴燃变黑），随后火势展开，最后一段收得快
    const controls = animate(R, [0, maxR * 0.1, maxR * 0.42, maxR], {
      duration: durationMs / 1000,
      times: [0, 0.16, 0.55, 1],
      ease: ["easeOut", "easeIn", "linear"],
    });
    const t = window.setTimeout(() => onFinished?.(), durationMs + 600);
    return () => {
      controls.stop();
      window.clearTimeout(t);
    };
  }, [active, maxR, durationMs, reduce, R, onFinished]);

  const particles = useMemo(() => buildParticles(density, ox, oy), [density, ox, oy]);
  const ready = box.w > 1;
  const burning = active && ready;

  return (
    <div ref={hostRef} className={`relative ${className}`} style={style}>
      {/* ══ 滤镜与遮罩 ══ */}
      {ready && (
        <svg width="0" height="0" aria-hidden style={{ position: "absolute" }}>
          <defs>
            {/*
              #edge —— 静态。烧穿的洞与炭化环共用。
              低频给出大块的不规则轮廓，高频给出细碎锯齿；
              真实的焦边正是这两种尺度叠在一起。
            */}
            <filter id={`${uid}-edge`} x="-45%" y="-45%" width="190%" height="190%">
              <feTurbulence type="fractalNoise" baseFrequency="0.011 0.014" numOctaves="4" seed="17" result="n" />
              <feDisplacementMap in="SourceGraphic" in2="n" scale={edgeScale} xChannelSelector="R" yChannelSelector="G" />
            </filter>

            {/*
              #flame-coarse / #flame-fine —— 动态湍流，只作用在火焰上。
              外层火舌甩得远、变形大；贴着纸的内层几乎不动 ——
              这正是真实火焰的样子：根部稳定，梢部乱窜。
            */}
            <filter id={`${uid}-flame-coarse`} x="-80%" y="-80%" width="260%" height="260%">
              <feTurbulence type="fractalNoise" baseFrequency="0.011 0.026" numOctaves="3" seed="41" result="f">
                <animate
                  attributeName="baseFrequency"
                  dur="0.58s"
                  values="0.011 0.026; 0.018 0.04; 0.009 0.022; 0.011 0.026"
                  repeatCount="indefinite"
                />
              </feTurbulence>
              <feDisplacementMap in="SourceGraphic" in2="f" scale={edgeScale * 0.8} xChannelSelector="R" yChannelSelector="G" />
            </filter>
            <filter id={`${uid}-flame-fine`} x="-60%" y="-60%" width="220%" height="220%">
              <feTurbulence type="fractalNoise" baseFrequency="0.018 0.038" numOctaves="2" seed="23" result="f2">
                <animate
                  attributeName="baseFrequency"
                  dur="0.34s"
                  values="0.018 0.038; 0.026 0.052; 0.015 0.032; 0.018 0.038"
                  repeatCount="indefinite"
                />
              </feTurbulence>
              <feDisplacementMap in="SourceGraphic" in2="f2" scale={edgeScale * 0.5} xChannelSelector="R" yChannelSelector="G" />
            </filter>

            {/* 火往上走：把火焰整体按"上亮下暗"衰减一次，火才有方向 */}
            <linearGradient id={`${uid}-rise`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#fff" stopOpacity="1" />
              <stop offset="55%" stopColor="#fff" stopOpacity="0.82" />
              <stop offset="100%" stopColor="#fff" stopOpacity="0.42" />
            </linearGradient>
            <mask id={`${uid}-rise-mask`} maskUnits="userSpaceOnUse" x={-W} y={-H} width={W * 3} height={H * 3}>
              <rect x={-W} y={-H} width={W * 3} height={H * 3} fill={`url(#${uid}-rise)`} />
            </mask>

            <filter id={`${uid}-smoke`} x="-90%" y="-90%" width="280%" height="280%">
              <feTurbulence type="fractalNoise" baseFrequency="0.006 0.012" numOctaves="3" seed="5" result="s">
                <animate
                  attributeName="baseFrequency"
                  dur="2.1s"
                  values="0.006 0.012; 0.009 0.018; 0.006 0.012"
                  repeatCount="indefinite"
                />
              </feTurbulence>
              <feDisplacementMap in="SourceGraphic" in2="s" scale={edgeScale * 1.2} xChannelSelector="R" yChannelSelector="G" />
              <feGaussianBlur stdDeviation="11" />
            </filter>

            {/* 纸张遮罩：白＝留，黑＝烧穿 */}
            <mask id={`${uid}-mask`} maskUnits="userSpaceOnUse" x="0" y="0" width={W} height={H}>
              <rect x="0" y="0" width={W} height={H} fill="#fff" />
              <circle ref={holeRef} cx={cx} cy={cy} r={0} fill="#000" style={{ filter: `url(#${uid}-edge)` }} />
            </mask>
          </defs>
        </svg>
      )}

      {/* ══ 纸：被挖洞，并叠上炭化与烤黄 ══ */}
      <div
        ref={paperRef}
        className="relative"
        style={{
          transformOrigin: `${(1 - ox) * 100}% ${(1 - oy) * 100}%`,
          mask: burning ? `url(#${uid}-mask)` : undefined,
          WebkitMask: burning ? `url(#${uid}-mask)` : undefined,
        }}
      >
        {children}

        {/* 炭化 / 预热：三层同心环，multiply 叠在纸上 */}
        {burning && (
          <svg
            className="pointer-events-none absolute inset-0"
            width={W}
            height={H}
            viewBox={`0 0 ${W} ${H}`}
            style={{ mixBlendMode: "multiply" }}
            aria-hidden
          >
            {/* 预热：还没烧到，已被烤成深褐 */}
            <circle
              ref={scorchRef}
              cx={cx} cy={cy} r={0}
              fill="none"
              stroke="rgba(120,74,28,0.5)"
              strokeWidth={SCORCH * 1.4}
              style={{ filter: `url(#${uid}-edge) blur(10px)` }}
            />
            {/* 炭化外圈：褐转黑 */}
            <circle
              ref={charMidRef}
              cx={cx} cy={cy} r={0}
              fill="none"
              stroke="rgba(44,21,6,0.92)"
              strokeWidth={CHAR * 2.9}
              style={{ filter: `url(#${uid}-edge) blur(3.2px)` }}
            />
            {/* 焦边：紧贴火线外侧的一圈近黑，是"纸被烧掉"最直接的证据 */}
            <circle
              ref={charDeepRef}
              cx={cx} cy={cy} r={0}
              fill="none"
              stroke="rgba(8,4,2,0.98)"
              strokeWidth={CHAR * 1.7}
              style={{ filter: `url(#${uid}-edge) blur(1px)` }}
            />
          </svg>
        )}
      </div>

      {/* ══ 火焰层：画在遮罩之外，否则会被同一个洞一起裁掉 ══ */}
      {burning && (
        <svg
          className="pointer-events-none absolute inset-0"
          width={W}
          height={H}
          viewBox={`0 0 ${W} ${H}`}
          style={{ mixBlendMode: "screen" }}
          aria-hidden
        >
          {/* 烟：跑在火线外侧，最先出现、最后散去 */}
          <circle
            ref={smokeRef}
            cx={cx} cy={cy} r={0}
            fill="none"
            stroke="rgba(96,84,74,0.26)"
            strokeWidth={CHAR * 3}
            style={{ filter: `url(#${uid}-smoke)` }}
          />
          {/* 焰舌：由外到内四层，暗红 → 橙 → 金 → 白炽 */}
          <g mask={`url(#${uid}-rise-mask)`}>
            {FLAME_BANDS.map((b, i) => (
              <circle
                key={i}
                ref={(el) => { flameRefs.current[i] = el; }}
                cx={cx} cy={cy} r={0}
                fill="none"
                stroke={b.color}
                strokeWidth={CHAR * b.width}
                style={{
                  filter: `url(#${uid}-flame-${b.coarse ? "coarse" : "fine"}) blur(${b.blur}px)`,
                  transform: b.dy ? `translateY(${b.dy * CHAR}px)` : undefined,
                }}
              >
                {/* 每层用互不相同的周期闪，叠起来就不会是整体一起一暗 */}
                <animate
                  attributeName="opacity"
                  dur={`${0.21 + i * 0.07}s`}
                  values={i === FLAME_BANDS.length - 1 ? "1;0.7;1;0.88;1" : "1;0.84;1;0.92;1"}
                  repeatCount="indefinite"
                />
              </circle>
            ))}
          </g>
        </svg>
      )}

      {/* 火光：把周围也照亮一点，火才像是有热量的 */}
      {burning && !reduce && (
        <motion.div
          ref={glowRef}
          className="pointer-events-none absolute"
          style={{ inset: -70, mixBlendMode: "screen" }}
          initial={{ opacity: 0 }}
          animate={{ opacity: [0, 1, 1, 0] }}
          transition={{ duration: durationMs / 1000 + 0.5, times: [0, 0.12, 0.74, 1], ease: "easeOut" }}
        />
      )}

      {/* ══ 余烬 / 灰片 / 烟丝 ══
          每颗粒子的出发时刻 = 火线扫到它所在位置的时刻，
          所以灰是"从燃烧处升起"，而不是整张纸一起冒烟。 */}
      {burning && !reduce &&
        particles.map((p, i) => {
          const px = p.fx * W;
          const py = p.fy * H;
          const d = Math.hypot(px - cx, py - cy);
          const t = Math.min(0.94, Math.max(0, d / maxR + p.jitter - 0.03));
          const st: React.CSSProperties = {
            left: px,
            top: py,
            width: p.size,
            height: p.size,
            borderRadius: p.kind === "ash" ? "1px" : "50%",
          };
          if (p.kind === "ember") {
            st.background = "radial-gradient(circle, #fff6d8 0%, #ffb43c 42%, #d4501a 100%)";
            st.boxShadow = "0 0 8px rgba(255,152,50,0.95), 0 0 18px rgba(255,108,18,0.5)";
          } else if (p.kind === "ash") {
            st.background = "linear-gradient(140deg, #4e433a 0%, #201c18 100%)";
            st.boxShadow = "0 0 2px rgba(0,0,0,0.65)";
          } else {
            st.background = "radial-gradient(circle, rgba(92,82,74,0.42) 0%, rgba(58,50,44,0.14) 58%, transparent 74%)";
            st.filter = "blur(4px)";
          }
          return (
            <motion.span
              key={i}
              className="pointer-events-none absolute"
              style={st}
              initial={{ opacity: 0, x: 0, y: 0, rotate: 0, scale: 0.4 }}
              animate={{
                opacity: p.kind === "ember" ? [0, 1, 1, 0] : p.kind === "ash" ? [0, 0.92, 0] : [0, 0.5, 0],
                y: -p.rise,
                x: [0, p.drift * 0.35, p.drift],
                rotate: p.kind === "smoke" ? 0 : p.spin,
                scale: p.kind === "smoke" ? [0.4, 1.6, 2.3] : [0.4, 1, 0.2],
              }}
              transition={{
                duration: p.dur,
                delay: (t * durationMs) / 1000,
                ease: p.kind === "ember" ? [0.14, 0.62, 0.4, 1] : "easeOut",
              }}
            />
          );
        })}
    </div>
  );
}

export const PaperBurn = memo(PaperBurnInner);
export default PaperBurn;

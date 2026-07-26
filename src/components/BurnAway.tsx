/**
 * BurnAway.tsx —— 纸张焚毁演出：火焰前沿 + 余烬消散
 * ============================================================================
 * 之前的版本只是一条渐变色带向上扫过，读起来像"发光的进度条"而不是火。
 * 真实的燃纸有三样东西缺一不可：
 *
 *   1. 不规则且抖动的火线。火焰边缘由湍流噪声驱动并持续变形，
 *      而不是一条笔直的水平带。
 *   2. 分层的温度。白炽核心 → 黄 → 橙 → 暗红 → 烟，
 *      不同层各自以不同速度抖动，才有立体的舔舐感。
 *   3. 三类不同的粒子。亮余烬（快、发光、上升）、
 *      灰烬碎片（暗、翻滚、飘落）、烟丝（大、模糊、慢）。
 *      只有单一粒子会显得很假。
 * ============================================================================
 */

import { memo, useMemo } from "react";
import { motion } from "framer-motion";

interface Props {
  /** 是否已点燃 */
  active: boolean;
  /** 整段演出时长（毫秒），与遮罩侵蚀保持一致 */
  durationMs?: number;
  /** 粒子数量档位，低性能可调小 */
  density?: number;
}

type Particle = {
  left: number;
  size: number;
  delay: number;
  driftX: number;
  rise: number;
  rot: number;
  dur: number;
  kind: "ember" | "ash" | "smoke";
};

function buildParticles(density: number): Particle[] {
  const out: Particle[] = [];
  // 用确定性的伪随机，避免每次渲染粒子乱跳
  const rnd = (i: number, salt: number) => {
    const x = Math.sin(i * 12.9898 + salt * 78.233) * 43758.5453;
    return x - Math.floor(x);
  };
  const counts = {
    ember: Math.round(density * 0.45),
    ash: Math.round(density * 0.35),
    smoke: Math.round(density * 0.2),
  };
  let i = 0;
  (Object.keys(counts) as (keyof typeof counts)[]).forEach((kind) => {
    for (let k = 0; k < counts[kind]; k++, i++) {
      const r1 = rnd(i, 1), r2 = rnd(i, 2), r3 = rnd(i, 3), r4 = rnd(i, 4);
      // 起点偏右下：left 分布向右侧倾斜，delay 与 left 负相关
      // （越靠右下越早被烧到）
      const biasedLeft = 3 + Math.pow(r1, 0.62) * 94;
      out.push({
        kind,
        left: biasedLeft,
        // 余烬小而亮，灰烬中等，烟大而虚
        size: kind === "ember" ? 1.5 + r2 * 2.2 : kind === "ash" ? 2 + r2 * 3 : 8 + r2 * 12,
        // 右侧先烧、左侧后烧：delay 随 left 增大而减小
        delay: (1 - biasedLeft / 100) * 0.62 + r3 * 0.22,
        driftX: (r4 - 0.5) * (kind === "smoke" ? 70 : 46),
        rise: kind === "ember" ? 130 + r1 * 120 : kind === "ash" ? 70 + r1 * 90 : 100 + r1 * 90,
        rot: (r2 - 0.5) * 720,
        dur: kind === "ember" ? 0.9 + r3 * 0.6 : kind === "ash" ? 1.1 + r3 * 0.7 : 1.5 + r3 * 0.8,
      });
    }
  });
  return out;
}

function BurnAwayInner({ active, durationMs = 1000, density = 46 }: Props) {
  const particles = useMemo(() => buildParticles(density), [density]);
  const uid = useMemo(() => `burn-${Math.floor(Math.random() * 1e6)}`, []);
  const durS = durationMs / 1000;

  if (!active) return null;

  return (
    <>
      {/* ── 火焰前沿 ──
          三层温度带一起上移，各自以不同的湍流种子和速度抖动，
          叠加出有厚度、会舔舐的火线。 */}
      <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden>
        <defs>
          {/* 主火焰：大尺度湍流做出火舌轮廓 */}
          <filter id={`${uid}-flame`} x="-30%" y="-60%" width="160%" height="220%">
            <feTurbulence type="fractalNoise" baseFrequency="0.016 0.055" numOctaves="3" seed="11" result="t">
              <animate
                attributeName="baseFrequency"
                dur="0.7s"
                values="0.016 0.055; 0.024 0.075; 0.013 0.05; 0.016 0.055"
                repeatCount="indefinite"
              />
            </feTurbulence>
            <feDisplacementMap in="SourceGraphic" in2="t" scale="34" xChannelSelector="R" yChannelSelector="G" />
            <feGaussianBlur stdDeviation="1.4" />
          </filter>
          {/* 白炽核心：更细的噪声、更小的位移 */}
          <filter id={`${uid}-core`} x="-30%" y="-60%" width="160%" height="220%">
            <feTurbulence type="fractalNoise" baseFrequency="0.03 0.09" numOctaves="2" seed="29" result="t2">
              <animate
                attributeName="baseFrequency"
                dur="0.45s"
                values="0.03 0.09; 0.042 0.12; 0.026 0.08; 0.03 0.09"
                repeatCount="indefinite"
              />
            </feTurbulence>
            <feDisplacementMap in="SourceGraphic" in2="t2" scale="16" xChannelSelector="R" yChannelSelector="G" />
            <feGaussianBlur stdDeviation="0.8" />
          </filter>
          {/* 烟：大范围低频扰动 */}
          <filter id={`${uid}-smoke`} x="-50%" y="-80%" width="200%" height="260%">
            <feTurbulence type="fractalNoise" baseFrequency="0.008 0.02" numOctaves="3" seed="5" result="t3">
              <animate
                attributeName="baseFrequency"
                dur="1.6s"
                values="0.008 0.02; 0.012 0.03; 0.008 0.02"
                repeatCount="indefinite"
              />
            </feTurbulence>
            <feDisplacementMap in="SourceGraphic" in2="t3" scale="46" xChannelSelector="R" yChannelSelector="G" />
            <feGaussianBlur stdDeviation="6" />
          </filter>
        </defs>
      </svg>

      {/* ── 三层温度带沿对角线推进 ──
          纸是从右下角被点着的，所以火线是一条斜带，
          从右下往左上啃，而不是一条水平线整齐地往上抬。
          用一个放大到 2.4 倍、旋转 -38° 的长条来实现斜向火线，
          再沿其法线方向平移。 */}
      {[
        { // 烟：跑在火线前面
          h: 108, blur: `url(#${uid}-smoke)`, op: 0.72, dur: durS * 1.08, from: 92, to: -78,
          bg: "linear-gradient(0deg, rgba(40,34,30,0) 0%, rgba(52,44,38,0.48) 45%, rgba(70,60,52,0.3) 78%, transparent 100%)",
          blend: undefined as string | undefined,
        },
        { // 外焰
          h: 66, blur: `url(#${uid}-flame)`, op: 1, dur: durS, from: 96, to: -62,
          bg: "linear-gradient(0deg, rgba(120,20,0,0) 0%, rgba(190,52,6,0.7) 26%, rgba(248,124,20,0.92) 56%, rgba(255,182,64,0.85) 80%, rgba(255,226,150,0.38) 94%, transparent 100%)",
          blend: "screen",
        },
        { // 白炽核心
          h: 26, blur: `url(#${uid}-core)`, op: 1, dur: durS, from: 99, to: -54,
          bg: "linear-gradient(0deg, rgba(255,160,40,0) 0%, rgba(255,214,120,0.9) 45%, rgba(255,250,225,0.98) 78%, rgba(255,255,255,0.68) 92%, transparent 100%)",
          blend: "screen",
        },
      ].map((L, i) => (
        <motion.div
          key={i}
          className="absolute pointer-events-none"
          style={{
            left: "-70%",
            width: "240%",
            height: L.h,
            filter: L.blur,
            background: L.bg,
            mixBlendMode: L.blend as React.CSSProperties["mixBlendMode"],
            opacity: L.op,
            transformOrigin: "50% 50%",
          }}
          initial={{ top: `${L.from}%`, rotate: -38 }}
          animate={{ top: `${L.to}%`, rotate: -38 }}
          transition={{ duration: L.dur, ease: [0.32, 0, 0.62, 1] }}
        />
      ))}

      {/* 火光从右下角亮起，随火线一起移动 */}
      <motion.div
        className="absolute pointer-events-none"
        style={{
          inset: -40,
          background: "radial-gradient(ellipse 60% 55% at 88% 92%, rgba(255,146,38,0.5), transparent 64%)",
          mixBlendMode: "screen",
        }}
        initial={{ opacity: 0 }}
        animate={{ opacity: [0, 1, 0.8, 0] }}
        transition={{ duration: durS * 1.2, times: [0, 0.2, 0.62, 1], ease: "easeOut" }}
      />

      {/* ── 消散粒子 ── */}
      {particles.map((p, i) => {
        const style: React.CSSProperties = {
          left: `${p.left}%`,
          bottom: 6,
          width: p.size,
          height: p.size,
          borderRadius: p.kind === "smoke" ? "50%" : p.kind === "ember" ? "50%" : "1px",
        };
        if (p.kind === "ember") {
          style.background = "radial-gradient(circle, #fff4d0 0%, #ffb03a 45%, #d4531a 100%)";
          style.boxShadow = "0 0 8px rgba(255,150,50,0.95), 0 0 16px rgba(255,110,20,0.5)";
        } else if (p.kind === "ash") {
          style.background = "linear-gradient(140deg, #4a4038 0%, #24201c 100%)";
          style.boxShadow = "0 0 2px rgba(0,0,0,0.6)";
        } else {
          style.background = "radial-gradient(circle, rgba(90,80,72,0.5) 0%, rgba(60,52,46,0.16) 60%, transparent 75%)";
          style.filter = "blur(3px)";
        }
        return (
          <motion.span
            key={i}
            className="absolute pointer-events-none"
            style={style}
            initial={{ opacity: 0, y: 0, x: 0, rotate: 0, scale: 0.5 }}
            animate={{
              opacity: p.kind === "ember" ? [0, 1, 1, 0] : p.kind === "ash" ? [0, 0.95, 0] : [0, 0.55, 0],
              y: -p.rise,
              // 上升过程中横向摆动，模拟热气流
              x: [0, p.driftX * 0.4, p.driftX],
              rotate: p.kind === "smoke" ? 0 : p.rot,
              scale: p.kind === "smoke" ? [0.5, 1.5, 2.1] : [0.5, 1, 0.25],
            }}
            transition={{
              duration: p.dur,
              delay: p.delay,
              ease: p.kind === "ember" ? [0.15, 0.6, 0.4, 1] : "easeOut",
            }}
          />
        );
      })}
    </>
  );
}

export const BurnAway = memo(BurnAwayInner);
export default BurnAway;

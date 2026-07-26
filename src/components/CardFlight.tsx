/**
 * CardFlight.tsx —— 出牌演出：飞行 / 命中 / 收束
 * ============================================================================
 * 相比旧的 CardPlayEffect，这里解决了三个根本问题：
 *
 *  1. 旧版所有牌都飞向屏幕正中央，无论真实目标是谁。
 *     出牌因此永远看不出"谁打了谁"，这是战斗读不懂的主因。
 *     现在牌会真的飞向目标座位，群体牌则从中心向所有目标扩散冲击波。
 *
 *  2. 旧版只有"飞过去 + 淡出"两个动作，没有蓄力、没有命中、没有收束，
 *     所有牌看起来都一样。现在每张牌按 CardEffectConfig 走
 *     起势 → 爆发 → 命中 → 收束 四段编排，并按牌的原型族
 *     （斩击 / 护盾 / 汇聚 / 窃取 / 封印 …）使用不同的运动曲线。
 *
 *  3. 旧版命中处没有任何反馈。现在命中点有冲击环、碎片迸射与残影。
 * ============================================================================
 */

import { memo, useMemo } from "react";
import { motion } from "framer-motion";
import { CARD_IMAGE } from "../data/cards";
import { resolvePerfConfig, type PerfTier, type ResolvedEffectConfig } from "./CardEffectConfig";

/** 四个座位在屏幕上的锚点（百分比） */
export const SEAT_ANCHOR: Record<number, { x: number; y: number }> = {
  0: { x: 50, y: 88 }, // 自己（下）
  1: { x: 91, y: 44 }, // 右
  2: { x: 50, y: 17 }, // 上
  3: { x: 9, y: 44 },  // 左
};

export const BOARD_CENTER = { x: 50, y: 50 };

export function seatPos(seat: number | undefined) {
  if (seat === undefined || !(seat in SEAT_ANCHOR)) return BOARD_CENTER;
  return SEAT_ANCHOR[seat];
}

/** 依原型族给出不同的运动性格 */
function motionProfile(cfg: ResolvedEffectConfig) {
  switch (cfg.archetype) {
    case "strike":
    case "duel":
      // 攻击：先缓后急，命中前骤然加速
      return { ease: [0.35, 0, 0.9, 0.4] as const, arc: -0.55, overshoot: 1.18, spin: 1 };
    case "theft":
      // 窃取：斜切掠过，带回拉感
      return { ease: [0.2, 0.8, 0.3, 1] as const, arc: 0.75, overshoot: 1.05, spin: -0.7 };
    case "seal":
      // 封印：沉重下压
      return { ease: [0.6, 0, 0.4, 1] as const, arc: -0.25, overshoot: 1.0, spin: 0.25 };
    case "restore":
    case "harmony":
      // 恢复：柔和上浮
      return { ease: [0.25, 1, 0.5, 1] as const, arc: -0.9, overshoot: 1.0, spin: 0.15 };
    case "ward":
      return { ease: [0.3, 1, 0.4, 1] as const, arc: -0.4, overshoot: 1.0, spin: 0 };
    case "tide":
    case "storm":
      return { ease: [0.4, 0, 0.2, 1] as const, arc: -0.2, overshoot: 1.25, spin: 1.4 };
    case "timewarp":
      return { ease: [0.5, 0, 0.5, 1] as const, arc: 0.4, overshoot: 1.0, spin: -1.6 };
    case "equip":
      return { ease: [0.2, 1, 0.3, 1] as const, arc: -0.7, overshoot: 1.0, spin: 0.4 };
    default:
      return { ease: [0.3, 0.7, 0.3, 1] as const, arc: -0.45, overshoot: 1.1, spin: 0.6 };
  }
}

interface FlightProps {
  cardKey: string;
  fromSeat: number;
  targetSeats: number[];
  perfTier: PerfTier;
}

/**
 * 一次完整的出牌演出。
 * 由 GameBoard 在 z 轴最上层渲染，pointer-events 全关。
 */
function CardFlightInner({ cardKey, fromSeat, targetSeats, perfTier }: FlightProps) {
  const cfg = useMemo(() => resolvePerfConfig(cardKey, perfTier), [cardKey, perfTier]);
  const prof = useMemo(() => motionProfile(cfg), [cfg]);

  const from = seatPos(fromSeat);
  const isGroup = targetSeats.length > 1;
  const isSelf = targetSeats.length === 0;
  // 单体牌飞向目标；群体牌与自身牌落在中心
  const to = isSelf || isGroup ? BOARD_CENTER : seatPos(targetSeats[0]);

  const windupS = Math.max(0.18, cfg.phases.windup / 1000);
  const travelS = Math.max(0.28, cfg.phases.burst / 1000);
  const impactS = Math.max(0.2, cfg.phases.impact / 1000);
  const settleS = Math.max(0.18, cfg.phases.settle / 1000);

  const cardImg = CARD_IMAGE[cardKey] ?? `images/cards/${cardKey}.jpg`;
  const glow = cfg.glowColor;
  const primary = cfg.primaryColor;
  const accent = cfg.secondaryColor ?? primary;

  // 抛物线中点：垂直于飞行方向抬起，让弧线随出牌方向自然变化
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.max(1, Math.hypot(dx, dy));
  const nx = -dy / len;
  const ny = dx / len;
  const lift = prof.arc * 18;
  const mid = { x: (from.x + to.x) / 2 + nx * lift, y: (from.y + to.y) / 2 + ny * lift };

  // 出牌方向决定初始倾角，让牌看起来"被甩出去"
  const angleDeg = (Math.atan2(dy, dx) * 180) / Math.PI;
  const spinTotal = prof.spin * 180;

  const cardW = 78;
  const cardH = 110;

  const particleCount = cfg.particles.count;
  const showParticles = particleCount > 0;

  return (
    <>
      {/* ── 起势：出牌者脚下的能量汇聚环 ── */}
      <motion.div
        className="absolute pointer-events-none"
        style={{
          left: `${from.x}%`, top: `${from.y}%`,
          width: 120, height: 120, marginLeft: -60, marginTop: -60,
          borderRadius: "50%",
          border: `1.5px solid ${primary}`,
          boxShadow: `0 0 24px ${glow}, inset 0 0 18px ${glow}`,
        }}
        initial={{ scale: 1.5, opacity: 0 }}
        animate={{ scale: [1.5, 0.55], opacity: [0, 0.85, 0] }}
        transition={{ duration: windupS, ease: "easeOut" }}
      />

      {/* ── 飞行拖尾 ── */}
      {cfg.flight.trailLength > 0 && (
        <motion.div
          className="absolute pointer-events-none"
          style={{
            width: 10, height: 10, marginLeft: -5, marginTop: -5,
            borderRadius: "50%",
            background: cfg.flight.trailColor,
            filter: `blur(6px) drop-shadow(0 0 12px ${glow})`,
          }}
          initial={{ left: `${from.x}%`, top: `${from.y}%`, scale: 0, opacity: 0 }}
          animate={{
            left: [`${from.x}%`, `${mid.x}%`, `${to.x}%`],
            top: [`${from.y}%`, `${mid.y}%`, `${to.y}%`],
            scale: [0, cfg.flight.trailLength / 22, 0.4],
            opacity: [0, 0.9, 0],
          }}
          transition={{ duration: travelS, delay: windupS, ease: prof.ease }}
        />
      )}

      {/* ── 飞行中的卡牌本体 ── */}
      <motion.div
        className="absolute pointer-events-none"
        style={{
          width: cardW, height: cardH, marginLeft: -cardW / 2, marginTop: -cardH / 2,
          borderRadius: 8,
          filter: `drop-shadow(0 12px 26px rgba(0,0,0,0.8)) drop-shadow(0 0 20px ${glow})`,
        }}
        initial={{
          left: `${from.x}%`, top: `${from.y}%`,
          scale: 0.3, opacity: 0, rotate: angleDeg * 0.12,
        }}
        animate={{
          left: [`${from.x}%`, `${from.x}%`, `${mid.x}%`, `${to.x}%`, `${to.x}%`],
          top: [`${from.y}%`, `${from.y}%`, `${mid.y}%`, `${to.y}%`, `${to.y}%`],
          scale: [0.3, 1.05, 0.92, prof.overshoot, 0.2],
          opacity: [0, 1, 1, 1, 0],
          rotate: [
            angleDeg * 0.12,
            angleDeg * 0.12,
            angleDeg * 0.12 + spinTotal * 0.5,
            angleDeg * 0.12 + spinTotal,
            angleDeg * 0.12 + spinTotal * 1.2,
          ],
        }}
        transition={{
          duration: windupS + travelS + impactS * 0.6,
          times: [0, windupS / (windupS + travelS + impactS * 0.6), (windupS + travelS * 0.5) / (windupS + travelS + impactS * 0.6), (windupS + travelS) / (windupS + travelS + impactS * 0.6), 1],
          ease: ["easeOut", prof.ease, prof.ease, "easeIn"],
        }}
      >
        <div
          className="absolute -inset-[1.5px] rounded-lg"
          style={{
            background: "linear-gradient(135deg, #2a2218 0%, #14100c 50%, #080604 100%)",
            border: `1px solid ${primary}`,
            boxShadow: `0 0 20px ${glow} inset`,
          }}
        />
        <div className="relative w-full h-full rounded-md overflow-hidden bg-[#0a0806]">
          <img src={cardImg} alt="" className="absolute inset-0 w-full h-full object-cover" draggable={false} />
          {/* 飞行时的斜向高光扫过 */}
          <motion.div
            className="absolute inset-0"
            style={{ background: `linear-gradient(115deg, transparent 35%, ${accent}55 50%, transparent 65%)` }}
            initial={{ x: "-120%" }}
            animate={{ x: "120%" }}
            transition={{ duration: travelS * 0.8, delay: windupS, ease: "easeInOut" }}
          />
        </div>
      </motion.div>

      {/* ── 命中：对每个目标各来一次冲击 ── */}
      {(isGroup ? targetSeats : isSelf ? [fromSeat] : [targetSeats[0]]).map((tSeat, i) => {
        const p = isSelf ? seatPos(fromSeat) : seatPos(tSeat);
        // 群体牌的冲击波从中心向外，逐个目标略微错开
        const delay = windupS + travelS + (isGroup ? i * 0.09 : 0);
        return (
          <ImpactBurst
            key={`${tSeat}-${i}`}
            x={p.x}
            y={p.y}
            duration={impactS + settleS}
            delay={delay}
            primary={primary}
            accent={accent}
            glow={glow}
            particles={showParticles ? particleCount : 0}
            heavy={cfg.intensity === "intense" || cfg.intensity === "extreme"}
          />
        );
      })}

      {/* ── 群体牌：中心向外的扩散环 ── */}
      {isGroup && (
        <motion.div
          className="absolute pointer-events-none"
          style={{
            left: "50%", top: "50%",
            width: 80, height: 80, marginLeft: -40, marginTop: -40,
            borderRadius: "50%",
            border: `2px solid ${primary}`,
            boxShadow: `0 0 30px ${glow}`,
          }}
          initial={{ scale: 0.2, opacity: 0 }}
          animate={{ scale: [0.2, 14], opacity: [0, 0.8, 0] }}
          transition={{ duration: impactS + settleS, delay: windupS + travelS, ease: "easeOut" }}
        />
      )}
    </>
  );
}

/** 命中点的冲击表现：闪核 + 冲击环 + 碎片迸射 */
function ImpactBurst({
  x, y, duration, delay, primary, accent, glow, particles, heavy,
}: {
  x: number; y: number; duration: number; delay: number;
  primary: string; accent: string; glow: string; particles: number; heavy: boolean;
}) {
  // 碎片方向预先算好，避免每帧重算
  const shards = useMemo(
    () =>
      Array.from({ length: particles }).map((_, i) => {
        const a = (i / Math.max(1, particles)) * Math.PI * 2 + (i % 3) * 0.4;
        const dist = 34 + (i % 5) * 16;
        return {
          dx: Math.cos(a) * dist,
          dy: Math.sin(a) * dist,
          size: i % 4 === 0 ? 4 : i % 3 === 0 ? 3 : 2,
          delay: (i % 6) * 0.018,
          color: i % 3 === 0 ? accent : primary,
        };
      }),
    [particles, primary, accent],
  );

  return (
    <>
      {/* 闪核 */}
      <motion.div
        className="absolute pointer-events-none"
        style={{
          left: `${x}%`, top: `${y}%`,
          width: 64, height: 64, marginLeft: -32, marginTop: -32,
          borderRadius: "50%",
          background: `radial-gradient(circle, #fff8e0 0%, ${accent} 30%, ${primary}00 70%)`,
        }}
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: [0, heavy ? 2.1 : 1.5, 0.4], opacity: [0, 1, 0] }}
        transition={{ duration: duration * 0.5, delay, ease: "easeOut" }}
      />

      {/* 冲击环 ×2，错开时间形成层次 */}
      {[0, 1].map((r) => (
        <motion.div
          key={r}
          className="absolute pointer-events-none"
          style={{
            left: `${x}%`, top: `${y}%`,
            width: 70, height: 70, marginLeft: -35, marginTop: -35,
            borderRadius: "50%",
            border: `${r === 0 ? 2.5 : 1.2}px solid ${r === 0 ? primary : accent}`,
            boxShadow: `0 0 22px ${glow}`,
          }}
          initial={{ scale: 0.25, opacity: 0 }}
          animate={{ scale: [0.25, heavy ? 4.2 : 3.0], opacity: [0, 0.9, 0] }}
          transition={{ duration: duration * (r === 0 ? 0.7 : 0.9), delay: delay + r * 0.08, ease: "easeOut" }}
        />
      ))}

      {/* 碎片迸射 */}
      {shards.map((s, i) => (
        <motion.span
          key={i}
          className="absolute pointer-events-none rounded-full"
          style={{
            left: `${x}%`, top: `${y}%`,
            width: s.size, height: s.size,
            marginLeft: -s.size / 2, marginTop: -s.size / 2,
            background: s.color,
            boxShadow: `0 0 6px ${glow}`,
          }}
          initial={{ x: 0, y: 0, opacity: 0, scale: 0.4 }}
          animate={{ x: s.dx, y: s.dy, opacity: [0, 1, 0], scale: [0.4, 1, 0.2] }}
          transition={{ duration: duration * 0.85, delay: delay + s.delay, ease: "easeOut" }}
        />
      ))}
    </>
  );
}

export const CardFlight = memo(CardFlightInner);
export default CardFlight;

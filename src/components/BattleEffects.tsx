/**
 * BattleEffects.tsx  ——  重构后的出牌特效系统
 * ============================================================================
 * 设计变更：
 *  1. 主要特效由 cardPlayEffect 状态 + CardEffectConfig 配置驱动（每张牌独特演出）。
 *  2. 保留日志解析作为补充触发机制（仅处理 draw / damage / judgement / discard）。
 *  3. 每张牌使用配置中定义的独特粒子形状、颜色、飞行方式、命中表现。
 *  4. 特效四阶段：起势(windup) → 爆发(burst) → 命中(impact) → 收束(settle)。
 *  5. 性能降级：读取 localStorage.rerun_settings 中的 quality 设置。
 *  6. 禁止出牌时弹出任何文字。
 * ============================================================================
 */

import { useEffect, useRef, useState, useMemo } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useGameStore } from "../store/gameStore";
import { getCharacter } from "../data/characters";
import {
  resolvePerfConfig,
  type ResolvedEffectConfig,
  type PerfTier,
  type ParticleShape,
} from "./CardEffectConfig";
import { SvgEffectLayer } from "./SvgCardEffects";

// ── Player screen positions (percentage 0-100) ──
const PLAYER_POSITIONS: Record<number, { x: number; y: number }> = {
  0: { x: 50, y: 92 }, // self (bottom center)
  1: { x: 95, y: 42 }, // right
  2: { x: 50, y: 14 }, // top
  3: { x: 5, y: 42 }, // left
};

const CENTER_POS = { x: 50, y: 50 };
const DECK_POS = { x: 50, y: 55 };

// ── Read performance tier from localStorage rerun_settings ──
function getPerfTier(): PerfTier {
  try {
    const raw = localStorage.getItem("rerun_settings");
    if (raw) {
      const s = JSON.parse(raw);
      const q = s.quality;
      if (q === "low" || q === "medium" || q === "high") return q;
    }
  } catch {
    /* ignore */
  }
  return "high";
}

// ── Position helper ──
function absPos(x: number, y: number, w: number, h: number): React.CSSProperties {
  return {
    position: "absolute",
    left: `${x}%`,
    top: `${y}%`,
    marginLeft: `${-w / 2}px`,
    marginTop: `${-h / 2}px`,
  };
}

function getPos(seat?: number) {
  if (seat !== undefined && PLAYER_POSITIONS[seat]) return PLAYER_POSITIONS[seat];
  return CENTER_POS;
}

/* ═══════════════════════════════════════════════════════════════════════════
 * 类型定义
 * ═══════════════════════════════════════════════════════════════════════════ */

/** 主要：卡牌出牌驱动的特效（配置驱动） */
interface CardPlayActiveEffect {
  id: number;
  cardKey: string;
  fromSeat: number;
  /** 真实目标座位。空数组代表自身牌，多个代表群体牌 */
  targetSeats: number[];
  perfTier: PerfTier;
}

/** 补充：日志驱动的特效（仅 draw/damage/judgement/discard） */
type LogEffectType = "draw" | "damage" | "judgement" | "discard";

interface LogActiveEffect {
  id: number;
  type: LogEffectType;
  fromSeat?: number;
  targetSeat?: number;
  amount?: number;
  text: string;
}

let effectIdCounter = 0;

/* ═══════════════════════════════════════════════════════════════════════════
 * 日志解析（补充触发，仅处理非卡牌专属类型）
 * 卡牌专属类型（bifa/liubai/canmo/poti/lunbian/mochao/equip/skill）
 * 现已由 cardPlayEffect 配置驱动系统处理，此处跳避免重复触发。
 * ═══════════════════════════════════════════════════════════════════════════ */

function findSeatByName(
  text: string,
  players: Array<{ seat: number; characterId: number; alive: boolean }>,
  startIndex = 0,
): { seat: number; index: number } | null {
  for (const p of players) {
    const name = getCharacter(p.characterId).name;
    const idx = text.indexOf(`【${name}】`, startIndex);
    if (idx !== -1) return { seat: p.seat, index: idx };
  }
  return null;
}

function parseLogEffectType(entry: { text: string; kind?: string }): LogEffectType | null {
  const t = entry.text;
  // 续笔摸牌 / 审阅阶段抽牌
  if (t.includes("摸了") || t.includes("摸牌") || t.includes("抽牌") || (t.includes("摸") && t.includes("张牌"))) {
    return "draw";
  }
  // 判定
  if (t.includes("判定")) return "judgement";
  // 弃牌
  if (t.includes("弃置") || t.includes("弃牌")) return "discard";
  // 受伤通用（伤害数字反馈，与配置驱动特效互补）
  if (t.match(/受到\s*(\d+)\s*段/)) return "damage";
  return null;
}

function parseSeats(text: string, players: Array<{ seat: number; characterId: number; alive: boolean }>) {
  let fromSeat: number | undefined;
  let targetSeat: number | undefined;
  const first = findSeatByName(text, players, 0);
  if (first) {
    fromSeat = first.seat;
    const second = findSeatByName(text, players, first.index + 1);
    if (second && second.seat !== first.seat) targetSeat = second.seat;
  }
  return { fromSeat, targetSeat };
}

function extractDamage(text: string): number | undefined {
  const m = text.match(/受到\s*(\d+)\s*段/);
  return m ? parseInt(m[1], 10) : undefined;
}

/* ═══════════════════════════════════════════════════════════════════════════
 * 主组件
 * ═══════════════════════════════════════════════════════════════════════════ */

export default function BattleEffects() {
  const log = useGameStore((s) => s.log);
  const players = useGameStore((s) => s.players);
  const cardPlayEffect = useGameStore((s) => s.cardPlayEffect);

  const [cardEffects, setCardEffects] = useState<CardPlayActiveEffect[]>([]);
  const [logEffects, setLogEffects] = useState<LogActiveEffect[]>([]);
  const lastLogLenRef = useRef(0);
  const lastCardPlayIdRef = useRef(0);

  const playerList = useMemo(
    () => players.map((p) => ({ seat: p.seat, characterId: p.characterId, alive: p.alive })),
    [players],
  );

  // ── 主要：监听 cardPlayEffect（配置驱动） ──
  useEffect(() => {
    if (cardPlayEffect && cardPlayEffect.id !== lastCardPlayIdRef.current) {
      lastCardPlayIdRef.current = cardPlayEffect.id;
      const tier = getPerfTier();
      setCardEffects((prev) => [
        ...prev,
        {
          id: cardPlayEffect.id,
          cardKey: cardPlayEffect.cardKey,
          fromSeat: cardPlayEffect.fromSeat,
          targetSeats: cardPlayEffect.targetSeats ?? [],
          perfTier: tier,
        },
      ]);
    }
  }, [cardPlayEffect]);

  // ── 补充：监听日志（仅非卡牌专属类型） ──
  useEffect(() => {
    if (log.length <= lastLogLenRef.current) {
      lastLogLenRef.current = log.length;
      return;
    }
    const newEntries = log.slice(lastLogLenRef.current);
    lastLogLenRef.current = log.length;

    const newEffects: LogActiveEffect[] = [];
    for (const entry of newEntries) {
      const type = parseLogEffectType(entry);
      if (!type) continue;
      const { fromSeat, targetSeat } = parseSeats(entry.text, playerList);
      const amount = extractDamage(entry.text);
      newEffects.push({ id: ++effectIdCounter, type, fromSeat, targetSeat, amount, text: entry.text });
    }
    if (newEffects.length > 0) setLogEffects((prev) => [...prev, ...newEffects]);
  }, [log, playerList]);

  const removeCardEffect = (id: number) => setCardEffects((prev) => prev.filter((e) => e.id !== id));
  const removeLogEffect = (id: number) => setLogEffects((prev) => prev.filter((e) => e.id !== id));

  return (
    <div className="fixed inset-0 pointer-events-none z-[70]" style={{ overflow: "hidden" }}>
      <AnimatePresence>
        {/* 主要：配置驱动的卡牌出牌特效 */}
        {cardEffects.map((eff) => (
          <ConfigDrivenCardEffect key={`ce-${eff.id}`} effect={eff} onComplete={() => removeCardEffect(eff.id)} />
        ))}
        {/* 补充：日志驱动的辅助特效 */}
        {logEffects.map((eff) => (
          <LogEffectRenderer key={`le-${eff.id}`} effect={eff} onComplete={() => removeLogEffect(eff.id)} />
        ))}
      </AnimatePresence>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
 * 配置驱动特效：四阶段系统（起势 → 爆发 → 命中 → 收束）
 * ═══════════════════════════════════════════════════════════════════════════ */

function ConfigDrivenCardEffect({
  effect,
  onComplete,
}: {
  effect: CardPlayActiveEffect;
  onComplete: () => void;
}) {
  const cfg = useMemo(
    () => resolvePerfConfig(effect.cardKey, effect.perfTier),
    [effect.cardKey, effect.perfTier],
  );
  const phases = cfg.phases;
  const totalMs = phases.windup + phases.burst + phases.impact + phases.settle;
  const burstStartMs = phases.windup;
  const impactStartMs = phases.windup + phases.burst;

  // 单体牌把专属 SVG 演出放到真正的目标身上；
  // 自身牌放在出牌者身上；群体牌仍用中心，再由 CardFlight 扩散到各目标。
  const toPos =
    effect.targetSeats.length === 1
      ? getPos(effect.targetSeats[0])
      : effect.targetSeats.length === 0
        ? getPos(effect.fromSeat)
        : CENTER_POS;

  // 各阶段秒数（framer-motion 使用）
  const windupS = phases.windup / 1000;
  const burstS = phases.burst / 1000;
  const impactS = phases.impact / 1000;
  const burstDelayS = burstStartMs / 1000;
  const impactDelayS = impactStartMs / 1000;

  // 自动移除
  useEffect(() => {
    const t = setTimeout(onComplete, totalMs + 100);
    return () => clearTimeout(t);
  }, [totalMs, onComplete]);

  // 屏幕震屏 & 缩放参数
  const shakeAnim = cfg.screen.shake
    ? {
        x: [0, -cfg.screen.shake.intensity, cfg.screen.shake.intensity, -cfg.screen.shake.intensity * 0.5, cfg.screen.shake.intensity * 0.5, 0],
        y: [0, cfg.screen.shake.intensity * 0.5, -cfg.screen.shake.intensity * 0.5, 0, 0, 0],
      }
    : {};
  const shakeTransition = cfg.screen.shake
    ? { duration: cfg.screen.shake.duration / 1000, delay: impactDelayS, ease: "easeInOut" as const }
    : { duration: 0 };

  const zoomAnim = cfg.screen.zoom ? { scale: [1, cfg.screen.zoom.scale, 1] } : {};
  const zoomTransition = cfg.screen.zoom
    ? { duration: cfg.screen.zoom.duration / 1000, delay: burstDelayS, ease: "easeInOut" as const }
    : { duration: 0 };

  return (
    <>
      {/* ── 全屏闪光 ── */}
      {cfg.screen.flash && (
        <motion.div
          className="absolute inset-0"
          style={{ background: cfg.screen.flash.color, pointerEvents: "none" }}
          initial={{ opacity: 0 }}
          animate={{ opacity: [0, cfg.screen.flash.opacity, 0] }}
          transition={{ duration: cfg.screen.flash.duration / 1000, delay: burstDelayS, ease: "easeOut" }}
        />
      )}

      {/* ── 全屏暗角 ── */}
      {cfg.screen.vignette && (
        <motion.div
          className="absolute inset-0"
          style={{
            background: `radial-gradient(ellipse at center, transparent 25%, ${cfg.screen.vignette.color} 100%)`,
            pointerEvents: "none",
          }}
          initial={{ opacity: 0 }}
          animate={{ opacity: [0, cfg.screen.vignette.opacity, cfg.screen.vignette.opacity, 0] }}
          transition={{
            duration: cfg.screen.vignette.duration / 1000,
            delay: burstDelayS,
            times: [0, 0.25, 0.7, 1],
            ease: "easeOut",
          }}
        />
      )}

      {/* ── 中心特效组（可震屏 / 缩放） ── */}
      <motion.div className="absolute inset-0" animate={shakeAnim} transition={shakeTransition}>
        <motion.div
          className="absolute inset-0"
          style={{ transformOrigin: `${toPos.x}% ${toPos.y}%` }}
          animate={zoomAnim}
          transition={zoomTransition}
        >
          {/* 起势：中心蓄势微光 */}
          <WindupLayer cfg={cfg} pos={toPos} duration={windupS} />

          {/* 爆发：原型专属能量释放 */}
          <BurstLayer cfg={cfg} pos={toPos} burstDelay={burstDelayS} burstDuration={burstS} />

          {/* SVG 精美特效层：卡牌专属矢量演出（burst 阶段视觉主体） */}
          <SvgEffectLayer cfg={cfg} pos={toPos} burstDelay={burstDelayS} burstDuration={burstS} />

          {/* 命中：命中表现 */}
          <ImpactLayer cfg={cfg} pos={toPos} impactDelay={impactDelayS} impactDuration={impactS} />

          {/* 粒子场 */}
          <ParticleField
            cfg={cfg}
            pos={toPos}
            burstDelay={burstDelayS}
            totalParticleMs={phases.burst + phases.impact + phases.settle}
          />
        </motion.div>
      </motion.div>
    </>
  );
}

/* ─────────────────────────────────────────────
 * 起势层：中心蓄势微光
 * ───────────────────────────────────────────── */
function WindupLayer({
  cfg,
  pos,
  duration,
}: {
  cfg: ResolvedEffectConfig;
  pos: { x: number; y: number };
  duration: number;
}) {
  if (duration <= 0) return null;
  return (
    <motion.div
      className="absolute rounded-full"
      style={{
        ...absPos(pos.x, pos.y, 40, 40),
        background: `radial-gradient(circle, ${cfg.primaryColor}40, transparent 70%)`,
      }}
      initial={{ scale: 0.3, opacity: 0 }}
      animate={{ scale: [0.3, 0.8, 1], opacity: [0, 0.4, 0.15] }}
      transition={{ duration, ease: "easeIn" }}
    />
  );
}

/* ─────────────────────────────────────────────
 * 爆发层：原型(archetype)专属能量释放
 * ───────────────────────────────────────────── */
function BurstLayer({
  cfg,
  pos,
  burstDelay,
  burstDuration,
}: {
  cfg: ResolvedEffectConfig;
  pos: { x: number; y: number };
  burstDelay: number;
  burstDuration: number;
}) {
  const { archetype, primaryColor, secondaryColor, glowColor } = cfg;
  const d = burstDelay;
  const dur = burstDuration;

  // 通用：中心能量爆闪
  const energyCore = (
    <motion.div
      className="absolute rounded-full"
      style={{
        ...absPos(pos.x, pos.y, 60, 60),
        background: `radial-gradient(circle, #ffffff 0%, ${primaryColor} 30%, ${secondaryColor} 60%, transparent 85%)`,
        boxShadow: `0 0 50px ${glowColor}`,
      }}
      initial={{ scale: 0, opacity: 0 }}
      animate={{ scale: [0, 1.8, 2.2, 0], opacity: [0, 0.9, 0.3, 0] }}
      transition={{ duration: dur, delay: d, ease: "easeOut" }}
    />
  );

  switch (archetype) {
    // ── 攻击弹道 / 反制打断：方向性光束 / X形交叉 ──
    case "strike":
      return (
        <>
          {energyCore}
          <BurstBeam pos={pos} color={primaryColor} glow={glowColor} rotate={0} delay={d} dur={dur} />
        </>
      );
    case "counter":
      return (
        <>
          {energyCore}
          <BurstBeam pos={pos} color={primaryColor} glow={glowColor} rotate={45} delay={d} dur={dur} />
          <BurstBeam pos={pos} color={primaryColor} glow={glowColor} rotate={-45} delay={d} dur={dur} />
        </>
      );

    // ── 防御护盾 / 群体波纹 / 装备穿戴：扩散环 ──
    case "ward":
    case "tide":
    case "equip":
      return (
        <>
          {energyCore}
          {[0, 1, 2].map((i) => (
            <motion.div
              key={i}
              className="absolute rounded-full"
              style={{
                ...absPos(pos.x, pos.y, 80, 80),
                border: `2px solid ${primaryColor}`,
                boxShadow: `0 0 20px ${glowColor}`,
              }}
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: [0, 1.4 + i * 0.6, 2 + i * 0.6], opacity: [0, 0.6, 0] }}
              transition={{ duration: dur, delay: d + i * 0.1, ease: "easeOut" }}
            />
          ))}
        </>
      );

    // ── 恢复汇聚 / 和谐双流：向内收缩光环 ──
    case "restore":
    case "harmony":
      return (
        <>
          {energyCore}
          {[0, 1, 2, 3].map((i) => (
            <motion.div
              key={i}
              className="absolute rounded-full"
              style={{
                ...absPos(pos.x, pos.y, 50, 50),
                border: `1px solid ${secondaryColor}`,
                background: `radial-gradient(circle, ${primaryColor}30, transparent)`,
              }}
              initial={{ scale: 2.2, opacity: 0 }}
              animate={{ scale: [2.2, 0.5, 0.3], opacity: [0, 0.5, 0] }}
              transition={{ duration: dur, delay: d + i * 0.08, ease: "easeIn" }}
            />
          ))}
        </>
      );

    // ── 决斗碰撞：双向光束对撞 ──
    case "duel":
      return (
        <>
          {energyCore}
          <BurstBeam pos={pos} color={primaryColor} glow={glowColor} rotate={0} delay={d} dur={dur * 0.7} />
          <BurstBeam pos={pos} color={secondaryColor} glow={glowColor} rotate={180} delay={d} dur={dur * 0.7} />
        </>
      );

    // ── 风暴旋涡 / 时间扭曲：旋转涡环 ──
    case "storm":
    case "timewarp": {
      const reverse = archetype === "timewarp";
      return (
        <>
          {energyCore}
          <motion.div
            className="absolute rounded-full"
            style={{
              ...absPos(pos.x, pos.y, 100, 100),
              border: `2px dashed ${primaryColor}`,
              boxShadow: `0 0 25px ${glowColor}`,
            }}
            initial={{ scale: 0, opacity: 0, rotate: 0 }}
            animate={{ scale: [0, 1.5, 2.2], opacity: [0, 0.6, 0], rotate: reverse ? -360 : 360 }}
            transition={{ duration: dur, delay: d, ease: "easeOut" }}
          />
        </>
      );
    }

    // ── 封印判定：旋转符文环收紧 ──
    case "seal":
      return (
        <>
          {energyCore}
          <motion.div
            className="absolute rounded-full"
            style={{
              ...absPos(pos.x, pos.y, 100, 100),
              border: `2px solid ${primaryColor}`,
              boxShadow: `0 0 25px ${glowColor}`,
            }}
            initial={{ scale: 1.8, opacity: 0, rotate: 0 }}
            animate={{ scale: [1.8, 1, 0.4], opacity: [0, 0.7, 0], rotate: 180 }}
            transition={{ duration: dur, delay: d, ease: "easeIn" }}
          />
        </>
      );

    // ── 窃取牵扯 / 傀儡操控：放射丝线 ──
    case "theft":
    case "puppet": {
      const stringCount = 6;
      return (
        <>
          {energyCore}
          {Array.from({ length: stringCount }).map((_, i) => {
            const angle = (i / stringCount) * 360;
            return (
              <motion.div
                key={i}
                className="absolute"
                style={{
                  ...absPos(pos.x, pos.y, 80, 1.5),
                  background: `linear-gradient(90deg, transparent, ${primaryColor}, transparent)`,
                  transformOrigin: "center",
                  rotate: angle,
                }}
                initial={{ scaleX: 0, opacity: 0 }}
                animate={{ scaleX: [0, 1, 0.3], opacity: [0, 0.7, 0] }}
                transition={{ duration: dur, delay: d + i * 0.04, ease: "easeOut" }}
              />
            );
          })}
        </>
      );
    }

    // ── 干扰侵蚀：暗色触手 ──
    case "disrupt":
      return (
        <>
          {energyCore}
          {Array.from({ length: 5 }).map((_, i) => {
            const angle = (i / 5) * 360;
            return (
              <motion.div
                key={i}
                className="absolute rounded-full"
                style={{
                  ...absPos(pos.x, pos.y, 6, 60),
                  background: `linear-gradient(180deg, ${primaryColor}, transparent)`,
                  transformOrigin: "bottom center",
                  rotate: angle,
                }}
                initial={{ scaleY: 0, opacity: 0 }}
                animate={{ scaleY: [0, 1, 0.4], opacity: [0, 0.5, 0] }}
                transition={{ duration: dur, delay: d + i * 0.06, ease: "easeOut" }}
              />
            );
          })}
        </>
      );

    // ── 增益飞行：上升光柱 ──
    case "augment":
      return (
        <>
          {energyCore}
          <motion.div
            className="absolute"
            style={{
              ...absPos(pos.x, pos.y - 40, 40, 120),
              background: `linear-gradient(180deg, transparent, ${primaryColor}40, ${primaryColor}80, transparent)`,
              borderRadius: "50% 50% 0 0",
              filter: "blur(4px)",
            }}
            initial={{ scaleY: 0, opacity: 0 }}
            animate={{ scaleY: [0, 1, 0.5], opacity: [0, 0.6, 0] }}
            transition={{ duration: dur, delay: d, ease: "easeOut" }}
          />
        </>
      );

    default:
      return energyCore;
  }
}

/** 爆发光束 */
function BurstBeam({
  pos,
  color,
  glow,
  rotate,
  delay,
  dur,
}: {
  pos: { x: number; y: number };
  color: string;
  glow: string;
  rotate: number;
  delay: number;
  dur: number;
}) {
  return (
    <motion.div
      className="absolute"
      style={{
        ...absPos(pos.x, pos.y, 140, 5),
        background: `linear-gradient(90deg, transparent, ${color}, #ffffff, ${color}, transparent)`,
        boxShadow: `0 0 16px ${glow}`,
        borderRadius: "3px",
        transformOrigin: "center",
        rotate,
      }}
      initial={{ scaleX: 0, opacity: 0 }}
      animate={{ scaleX: [0, 1, 1, 0], opacity: [0, 1, 0.7, 0] }}
      transition={{ duration: dur, delay, times: [0, 0.2, 0.7, 1] }}
    />
  );
}

/* ─────────────────────────────────────────────
 * 命中层：命中表现(hit pattern)
 * ───────────────────────────────────────────── */
function ImpactLayer({
  cfg,
  pos,
  impactDelay,
  impactDuration,
}: {
  cfg: ResolvedEffectConfig;
  pos: { x: number; y: number };
  impactDelay: number;
  impactDuration: number;
}) {
  const { hit, primaryColor, glowColor } = cfg;
  if (hit.pattern === "none" || impactDuration <= 0) return null;

  const d = impactDelay;
  const dur = impactDuration;
  const hitColor = hit.particleColor || primaryColor;

  switch (hit.pattern) {
    // ── 飞溅 / 火花：放射状迸射 ──
    case "splash":
    case "spark": {
      const count = Math.min(Math.max(hit.particleCount, 6), 14);
      return (
        <>
          {Array.from({ length: count }).map((_, i) => {
            const angle = (i / count) * Math.PI * 2;
            const dist = 30 + Math.random() * 35;
            return (
              <motion.div
                key={i}
                className="absolute rounded-full"
                style={{
                  ...absPos(pos.x, pos.y, 5, 5),
                  background: hitColor,
                  boxShadow: `0 0 8px ${glowColor}`,
                }}
                initial={{ x: 0, y: 0, opacity: 1, scale: 1 }}
                animate={{ x: Math.cos(angle) * dist, y: Math.sin(angle) * dist, opacity: [1, 0], scale: [1, 0.2] }}
                transition={{ duration: dur, delay: d, ease: "easeOut" }}
              />
            );
          })}
          {hit.ringPulse && <ImpactRing pos={pos} color={hitColor} glow={glowColor} delay={d} dur={dur} />}
          {hit.targetShake && <ImpactShake pos={pos} intensity={hit.shakeIntensity} delay={d} />}
        </>
      );
    }

    // ── 涟漪：扩散环 ──
    case "ripple":
      return (
        <>
          {[0, 1, 2].map((i) => (
            <motion.div
              key={i}
              className="absolute rounded-full"
              style={{
                ...absPos(pos.x, pos.y, 80, 80),
                border: `2px solid ${hitColor}`,
                boxShadow: `0 0 20px ${glowColor}`,
              }}
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: [0, 1.4 + i * 0.6], opacity: [0, 0.6, 0] }}
              transition={{ duration: dur, delay: d + i * 0.08, ease: "easeOut" }}
            />
          ))}
          {hit.ringPulse && <ImpactRing pos={pos} color={hitColor} glow={glowColor} delay={d} dur={dur} />}
        </>
      );

    // ── 崩裂 / 裂纹：放射裂纹 ──
    case "shatter":
    case "crack":
      return (
        <>
          {Array.from({ length: 6 }).map((_, i) => {
            const angle = (i / 6) * 360;
            return (
              <motion.div
                key={i}
                className="absolute"
                style={{
                  ...absPos(pos.x, pos.y, 45, 2),
                  background: `linear-gradient(90deg, ${hitColor}, transparent)`,
                  transformOrigin: "left center",
                  rotate: angle,
                }}
                initial={{ scaleX: 0, opacity: 0 }}
                animate={{ scaleX: [0, 1, 0.3], opacity: [0, 0.8, 0] }}
                transition={{ duration: dur * 0.8, delay: d, ease: "easeOut" }}
              />
            );
          })}
          {hit.ringPulse && <ImpactRing pos={pos} color={hitColor} glow={glowColor} delay={d} dur={dur} />}
          {hit.targetShake && <ImpactShake pos={pos} intensity={hit.shakeIntensity} delay={d} />}
        </>
      );

    // ── 汇聚 / 吸收吞噬：向内塌缩 ──
    case "converge":
    case "absorb":
      return (
        <>
          {[0, 1].map((i) => (
            <motion.div
              key={i}
              className="absolute rounded-full"
              style={{ ...absPos(pos.x, pos.y, 80, 80), border: `2px solid ${hitColor}` }}
              initial={{ scale: 2, opacity: 0 }}
              animate={{ scale: [2, 0.3, 0], opacity: [0, 0.7, 0] }}
              transition={{ duration: dur, delay: d + i * 0.1, ease: "easeIn" }}
            />
          ))}
          {hit.ringPulse && <ImpactRing pos={pos} color={hitColor} glow={glowColor} delay={d} dur={dur} />}
        </>
      );

    // ── 旋涡：旋转塌缩环 ──
    case "vortex":
      return (
        <>
          <motion.div
            className="absolute rounded-full"
            style={{
              ...absPos(pos.x, pos.y, 100, 100),
              border: `2px dashed ${hitColor}`,
              boxShadow: `0 0 20px ${glowColor}`,
            }}
            initial={{ scale: 0, opacity: 0, rotate: 0 }}
            animate={{ scale: [0, 1.5, 0.5], opacity: [0, 0.6, 0], rotate: 360 }}
            transition={{ duration: dur, delay: d, ease: "easeOut" }}
          />
          {hit.ringPulse && <ImpactRing pos={pos} color={hitColor} glow={glowColor} delay={d} dur={dur} />}
          {hit.targetShake && <ImpactShake pos={pos} intensity={hit.shakeIntensity} delay={d} />}
        </>
      );

    // ── 封印盖戳：方形印记 ──
    case "seal-stamp":
      return (
        <>
          <motion.div
            className="absolute"
            style={{
              ...absPos(pos.x, pos.y, 60, 60),
              border: `3px solid ${hitColor}`,
              borderRadius: "4px",
              boxShadow: `0 0 25px ${glowColor}`,
              background: `${primaryColor}20`,
            }}
            initial={{ scale: 2, opacity: 0, rotate: -15 }}
            animate={{ scale: [2, 1, 0.8], opacity: [0, 0.9, 0], rotate: [-15, 0, 5] }}
            transition={{ duration: dur, delay: d, ease: "easeOut" }}
          />
          {hit.ringPulse && <ImpactRing pos={pos} color={hitColor} glow={glowColor} delay={d} dur={dur} />}
        </>
      );

    default:
      return null;
  }
}

/** 命中脉冲环 */
function ImpactRing({
  pos,
  color,
  glow,
  delay,
  dur,
}: {
  pos: { x: number; y: number };
  color: string;
  glow: string;
  delay: number;
  dur: number;
}) {
  return (
    <motion.div
      className="absolute rounded-full"
      style={{
        ...absPos(pos.x, pos.y, 100, 100),
        border: `3px solid ${color}`,
        boxShadow: `0 0 20px ${glow}, inset 0 0 20px ${glow}`,
      }}
      initial={{ scale: 0.8, opacity: 0 }}
      animate={{ scale: [0.8, 1.2, 1], opacity: [0, 0.8, 0] }}
      transition={{ duration: dur, delay, ease: "easeOut" }}
    />
  );
}

/** 目标震颤 */
function ImpactShake({
  pos,
  intensity,
  delay,
}: {
  pos: { x: number; y: number };
  intensity: number;
  delay: number;
}) {
  if (intensity <= 0) return null;
  return (
    <motion.div
      className="absolute"
      style={{ ...absPos(pos.x, pos.y, 1, 1) }}
      initial={{ x: 0, y: 0 }}
      animate={{
        x: [0, -intensity, intensity, -intensity * 0.5, intensity * 0.5, 0],
        y: [0, intensity * 0.5, -intensity * 0.5, 0, 0, 0],
      }}
      transition={{ duration: 0.3, delay }}
    />
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
 * 粒子系统：每张牌粒子形状独立，禁止共用换色粒子
 * ═══════════════════════════════════════════════════════════════════════════ */

/** 单个粒子（根据 shape 渲染独特形态）—— 粒子系统已禁用，保留定义供未来参考 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function Particle({
  shape,
  color,
  secondaryColor,
  size,
  glow,
}: {
  shape: ParticleShape;
  color: string;
  secondaryColor: string;
  size: number;
  glow: boolean;
}): React.ReactNode {
  const glowShadow = glow ? `0 0 ${Math.max(2, size)}px ${color}, 0 0 ${Math.max(4, size * 2)}px ${color}55` : "none";

  switch (shape) {
    case "droplet":
      // 墨滴：水滴形径向渐变
      return (
        <div
          style={{
            width: size,
            height: size * 1.3,
            borderRadius: "50% 50% 50% 50% / 65% 65% 35% 35%",
            background: `radial-gradient(ellipse at 35% 25%, ${color}, ${secondaryColor})`,
            boxShadow: glowShadow,
          }}
        />
      );

    case "ember":
      // 余烬：明亮发光圆心
      return (
        <div
          style={{
            width: size,
            height: size,
            borderRadius: "50%",
            background: `radial-gradient(circle, #ffffff 0%, ${color} 35%, ${secondaryColor} 70%, transparent 100%)`,
            boxShadow: glowShadow,
          }}
        />
      );

    case "shard":
      // 碎片：菱形多边形
      return (
        <div
          style={{
            width: size,
            height: size,
            clipPath: "polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)",
            background: `linear-gradient(135deg, ${color}, ${secondaryColor})`,
            filter: glow ? `drop-shadow(0 0 ${size * 0.5}px ${color})` : "none",
          }}
        />
      );

    case "snowflake":
      // 雪花：六角星 SVG
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 20 20"
          style={{ filter: glow ? `drop-shadow(0 0 ${size * 0.3}px ${color})` : "none" }}
        >
          {[0, 60, 120].map((a) => {
            const rad = (a * Math.PI) / 180;
            return (
              <line
                key={a}
                x1={10 - 9 * Math.cos(rad)}
                y1={10 - 9 * Math.sin(rad)}
                x2={10 + 9 * Math.cos(rad)}
                y2={10 + 9 * Math.sin(rad)}
                stroke={color}
                strokeWidth="1.2"
                strokeLinecap="round"
              />
            );
          })}
        </svg>
      );

    case "leaf":
      // 羽/叶：椭圆叶片
      return (
        <div
          style={{
            width: size,
            height: size * 0.45,
            borderRadius: "50%",
            background: `linear-gradient(90deg, ${secondaryColor}, ${color})`,
            boxShadow: glowShadow,
          }}
        />
      );

    case "rune":
      // 符文：方框 + 符号
      return (
        <div
          style={{
            width: size,
            height: size,
            border: `1.5px solid ${color}`,
            borderRadius: "2px",
            background: `${color}15`,
            boxShadow: glowShadow,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: size * 0.55,
            color: color,
            fontFamily: "serif",
            lineHeight: 1,
          }}
        >
          ✦
        </div>
      );

    case "spark":
      // 火花：四角星
      return (
        <div
          style={{
            width: size,
            height: size,
            clipPath:
              "polygon(50% 0%, 58% 38%, 100% 50%, 58% 62%, 50% 100%, 42% 62%, 0% 50%, 42% 38%)",
            background: `radial-gradient(circle, #ffffff, ${color})`,
            boxShadow: glow ? `0 0 ${size * 2}px ${color}` : "none",
          }}
        />
      );

    case "wisp":
      // 飘絮：模糊柔光椭圆
      return (
        <div
          style={{
            width: size,
            height: size * 0.7,
            borderRadius: "50%",
            background: `radial-gradient(ellipse, ${color}, transparent 70%)`,
            filter: `blur(${Math.max(1, size * 0.2)}px)`,
          }}
        />
      );

    case "dust":
      // 尘埃：微小圆点
      return (
        <div
          style={{
            width: size,
            height: size,
            borderRadius: "50%",
            background: color,
            opacity: 0.8,
            boxShadow: glow ? `0 0 ${size}px ${color}` : "none",
          }}
        />
      );

    case "thread":
      // 丝线：细长线
      return (
        <div
          style={{
            width: size * 4,
            height: 1.5,
            background: `linear-gradient(90deg, transparent, ${color}, ${secondaryColor}, transparent)`,
            boxShadow: glow ? `0 0 3px ${color}` : "none",
          }}
        />
      );

    case "crack":
      // 裂纹：锯齿 SVG 路径
      return (
        <svg
          width={size * 2.5}
          height={size}
          viewBox="0 0 50 20"
          style={{ filter: glow ? `drop-shadow(0 0 2px ${color})` : "none" }}
        >
          <path
            d="M0,10 L8,5 L14,13 L20,4 L27,11 L34,6 L42,12 L50,8"
            stroke={color}
            strokeWidth="1.5"
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      );

    case "none":
      return null;
  }
}

/** 粒子场：已禁用 —— 所有视觉效果由 SVG 特效层提供 */
function ParticleField({
  cfg: _cfg,
  pos: _pos,
  burstDelay: _burstDelay,
  totalParticleMs: _totalParticleMs,
}: {
  cfg: ResolvedEffectConfig;
  pos: { x: number; y: number };
  burstDelay: number;
  totalParticleMs: number;
}) {
  // 粒子系统已禁用，视觉效果完全由 SvgEffectLayer 提供
  return null;
}

/* ═══════════════════════════════════════════════════════════════════════════
 * 补充：日志驱动特效渲染器（draw / damage / judgement / discard）
 * ═══════════════════════════════════════════════════════════════════════════ */

function LogEffectRenderer({
  effect,
  onComplete,
}: {
  effect: LogActiveEffect;
  onComplete: () => void;
}) {
  switch (effect.type) {
    case "draw":
      return <DrawEffect effect={effect} onComplete={onComplete} />;
    case "damage":
      return <DamageEffect effect={effect} onComplete={onComplete} />;
    case "judgement":
      return <JudgementEffect effect={effect} onComplete={onComplete} />;
    case "discard":
      return <DiscardEffect effect={effect} onComplete={onComplete} />;
    default:
      return null;
  }
}

// ─────────────────────────────────────────────
// 续笔摸牌 - 金色卡牌从牌堆飞向目标
// ─────────────────────────────────────────────
function DrawEffect({ effect, onComplete }: { effect: LogActiveEffect; onComplete: () => void }) {
  const targetPos = getPos(effect.targetSeat ?? effect.fromSeat ?? 0);
  const cardCount = Math.min(effect.amount ?? 2, 3);

  return (
    <>
      {Array.from({ length: cardCount }).map((_, i) => (
        <motion.div
          key={i}
          className="absolute"
          style={{
            ...absPos(DECK_POS.x, DECK_POS.y, 40, 56),
            borderRadius: "4px",
            background: "linear-gradient(135deg, #c8a043 0%, #f0c862 50%, #c8a043 100%)",
            border: "1px solid #f0c862",
            boxShadow: "0 0 12px rgba(240,200,98,0.6), 0 4px 8px rgba(0,0,0,0.4)",
          }}
          initial={{ rotate: 0, scale: 0.5, opacity: 0 }}
          animate={{
            left: [`${DECK_POS.x}%`, `${targetPos.x}%`],
            top: [`${DECK_POS.y}%`, `${targetPos.y - 5}%`],
            rotate: [0, 360 + i * 90],
            scale: [0.5, 0.7],
            opacity: [0, 1, 1, 0],
          }}
          transition={{ duration: 0.8, delay: i * 0.15, times: [0, 0.7, 0.9, 1], ease: "easeOut" }}
          onAnimationComplete={i === 0 ? onComplete : undefined}
        >
          <div
            className="absolute inset-1 rounded-sm"
            style={{
              border: "1px solid rgba(240,200,98,0.5)",
              background: "radial-gradient(circle, rgba(240,200,98,0.2) 0%, transparent 70%)",
            }}
          />
        </motion.div>
      ))}
      {Array.from({ length: cardCount }).map((_, i) => (
        <motion.div
          key={`trail-${i}`}
          className="absolute"
          style={{
            ...absPos(DECK_POS.x, DECK_POS.y, 80, 2),
            background: "linear-gradient(90deg, transparent, #f0c862, transparent)",
            filter: "blur(1px)",
            borderRadius: "1px",
          }}
          initial={{ scaleX: 0, opacity: 0 }}
          animate={{
            left: [`${DECK_POS.x}%`, `${targetPos.x}%`],
            top: [`${DECK_POS.y}%`, `${targetPos.y - 5}%`],
            scaleX: [0, 1, 0],
            opacity: [0, 0.6, 0],
          }}
          transition={{ duration: 0.7, delay: i * 0.15, times: [0, 0.5, 1] }}
        />
      ))}
    </>
  );
}

// ─────────────────────────────────────────────
// 受伤/伤害通用 - 红色脉冲 + 伤害数字（补充反馈）
// ─────────────────────────────────────────────
function DamageEffect({ effect, onComplete }: { effect: LogActiveEffect; onComplete: () => void }) {
  const pos = getPos(effect.targetSeat);
  const amount = effect.amount ?? 1;

  return (
    <>
      {[0, 1, 2].map((i) => (
        <motion.div
          key={i}
          className="absolute"
          style={{
            ...absPos(pos.x, pos.y, 90, 90),
            borderRadius: "8px",
            border: "2px solid #c64040",
            boxShadow: "0 0 12px rgba(198,64,64,0.5), inset 0 0 10px rgba(198,64,64,0.15)",
          }}
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: [0.9, 1.1, 1], opacity: [0, 0.7, 0] }}
          transition={{ duration: 0.3, delay: i * 0.2 }}
          onAnimationComplete={i === 2 ? onComplete : undefined}
        />
      ))}
      <motion.div
        className="absolute font-gothic text-2xl font-bold"
        style={{
          ...absPos(pos.x, pos.y - 10, 40, 40),
          color: "#e06060",
          textShadow: "0 0 10px rgba(198,64,64,0.8), 0 2px 4px rgba(0,0,0,0.8)",
          textAlign: "center",
        }}
        initial={{ y: 0, opacity: 0, scale: 0.3 }}
        animate={{ y: -80, opacity: [0, 1, 1, 0], scale: [0.3, 1.3, 1, 0.8] }}
        transition={{ duration: 1.0, ease: "easeOut" }}
      >
        -{amount}
      </motion.div>
      <motion.div
        className="absolute"
        style={{ ...absPos(pos.x, pos.y, 1, 1) }}
        initial={{ x: 0, y: 0 }}
        animate={{ x: [0, -8, 8, -4, 4, 0], y: [0, 4, -4, 0, 0, 0] }}
        transition={{ duration: 0.3 }}
      />
    </>
  );
}

// ─────────────────────────────────────────────
// 判定 - 卡牌翻转
// ─────────────────────────────────────────────
function JudgementEffect({ effect, onComplete }: { effect: LogActiveEffect; onComplete: () => void }) {
  const pos = getPos(effect.targetSeat ?? effect.fromSeat);
  const isRed = /红桃|方片|红/.test(effect.text) && !/黑桃|梅花|黑/.test(effect.text);
  const cardColor = isRed ? "#c64040" : "#2a2a2a";
  const glowColor = isRed ? "rgba(198,64,64," : "rgba(180,180,200,";

  return (
    <>
      <motion.div
        className="absolute flex items-center justify-center"
        style={{
          ...absPos(pos.x, pos.y - 10, 48, 68),
          borderRadius: "4px",
          background: "#f5ecd7",
          border: `2px solid ${cardColor}`,
          boxShadow: `0 4px 12px rgba(0,0,0,0.5), 0 0 20px ${glowColor}0.4)`,
          fontSize: "20px",
          fontWeight: "bold",
          color: cardColor,
        }}
        initial={{ rotateY: 180, scale: 0.5, opacity: 0, y: 0 }}
        animate={{
          rotateY: [180, 0, 0, 180],
          scale: [0.5, 1, 1, 0.5],
          opacity: [0, 1, 1, 0],
          y: [0, -40, -40, -60],
        }}
        transition={{ duration: 1.5, times: [0, 0.3, 0.7, 1], ease: "easeInOut" }}
        onAnimationComplete={onComplete}
      >
        <motion.span
          initial={{ opacity: 0 }}
          animate={{ opacity: [0, 0, 1] }}
          transition={{ duration: 0.1, delay: 0.4 }}
        >
          ?
        </motion.span>
      </motion.div>
      <motion.div
        className="absolute rounded-full"
        style={{
          ...absPos(pos.x, pos.y - 10, 80, 80),
          background: `radial-gradient(circle, ${glowColor}0.3) 0%, transparent 70%)`,
        }}
        initial={{ scale: 0.3, opacity: 0 }}
        animate={{ scale: [0.3, 1.5, 1.8], opacity: [0, 0.4, 0] }}
        transition={{ duration: 1.2, delay: 0.3 }}
      />
    </>
  );
}

// ─────────────────────────────────────────────
// 弃牌 - 卡牌飞散消失
// ─────────────────────────────────────────────
function DiscardEffect({ effect, onComplete }: { effect: LogActiveEffect; onComplete: () => void }) {
  const pos = getPos(effect.fromSeat);
  const cardCount = 2;

  return (
    <>
      {Array.from({ length: cardCount }).map((_, i) => {
        const dir = i === 0 ? -1 : 1;
        const angle = dir * (20 + Math.random() * 30);
        return (
          <motion.div
            key={i}
            className="absolute"
            style={{
              ...absPos(pos.x, pos.y, 36, 50),
              borderRadius: "3px",
              background: "linear-gradient(135deg, #2a2218 0%, #1a1410 100%)",
              border: "1px solid #5a4020",
              boxShadow: "0 2px 8px rgba(0,0,0,0.4)",
            }}
            initial={{ scale: 0.5, opacity: 1, rotate: 0, x: 0, y: 0 }}
            animate={{
              x: dir * (80 + Math.random() * 60),
              y: 40 + Math.random() * 40,
              rotate: angle * 3,
              scale: [0.5, 0.6, 0.3],
              opacity: [1, 1, 0],
            }}
            transition={{ duration: 0.8, delay: i * 0.1, ease: "easeOut" }}
            onAnimationComplete={i === cardCount - 1 ? onComplete : undefined}
          />
        );
      })}
      <motion.div
        className="absolute rounded-full"
        style={{
          ...absPos(pos.x, pos.y, 60, 60),
          background: "radial-gradient(circle, rgba(90,64,32,0.3) 0%, transparent 70%)",
        }}
        initial={{ opacity: 0.3, scale: 0.5 }}
        animate={{ opacity: [0.3, 0], scale: [0.5, 1] }}
        transition={{ duration: 0.6 }}
      />
    </>
  );
}

// 粒子系统已禁用，保留 Particle 定义供未来参考
void Particle;

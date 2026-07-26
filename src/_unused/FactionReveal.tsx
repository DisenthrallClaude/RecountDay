import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { FACTIONS, CATEGORY_META } from "../data/factions";
import { getCharacter } from "../data/characters";
import { FactionIcon } from "./Icons";
import { AudioManager } from "../audio/AudioManager";

// ============================================================================
// FactionRevealOverlay — 阵营揭示仪式
// 完整动画阶段：
//   载体进入 → 材质展开 → 手写显现 → 阅读停留 → 边缘燃烧 → 内容焚毁 → 灰烬消散
// ============================================================================

export interface FactionRevealData {
  seat: number;
  factionId: number;
  isHuman: boolean;
  characterId: number;
}

interface Props {
  data: FactionRevealData;
  onComplete: () => void;
}

type Phase = "enter" | "unroll" | "write" | "hold" | "burn" | "destroy" | "scatter";

// 各阶段时长（毫秒）
const PHASE_DUR: Record<Phase, number> = {
  enter: 950,
  unroll: 1100,
  write: 2600,
  hold: 2600,
  burn: 1600,
  destroy: 1100,
  scatter: 1100,
};

const PHASE_ORDER: Phase[] = ["enter", "unroll", "write", "hold", "burn", "destroy", "scatter"];

// 阶段累计起始时间（用于音效与子动画同步）
function phaseStartMs(idx: number): number {
  let t = 0;
  for (let i = 0; i < idx; i++) t += PHASE_DUR[PHASE_ORDER[i]];
  return t;
}

export default function FactionReveal({ data, onComplete }: Props) {
  const faction = FACTIONS.find((f) => f.id === data.factionId);
  const [phaseIdx, setPhaseIdx] = useState(0);
  const doneRef = useRef(false);
  const phase = PHASE_ORDER[phaseIdx];

  const charName = getCharacter(data.characterId).name;
  const cat = faction ? CATEGORY_META[faction.category] : null;
  const nameChars = useMemo(() => (faction ? Array.from(faction.name) : []), [faction]);

  // 预生成灰烬粒子（消散阶段）
  const ashParticles = useMemo(
    () =>
      Array.from({ length: 36 }).map((_, i) => ({
        id: i,
        startX: 20 + Math.random() * 60,
        drift: (Math.random() - 0.5) * 80,
        size: 2 + Math.random() * 5,
        delay: Math.random() * 0.5,
        dur: 0.9 + Math.random() * 0.6,
        rot: (Math.random() - 0.5) * 540,
        riseY: -120 - Math.random() * 180,
        dark: Math.random() > 0.4,
      })),
    []
  );

  // 预生成燃烧边缘的火焰粒子
  const flameParticles = useMemo(
    () =>
      Array.from({ length: 22 }).map((_, i) => ({
        id: i,
        edge: i % 4, // 0=top 1=right 2=bottom 3=left
        pos: Math.random() * 100,
        size: 4 + Math.random() * 8,
        delay: Math.random() * 0.8,
        dur: 0.8 + Math.random() * 0.7,
        hue: 18 + Math.random() * 20,
      })),
    []
  );

  // 阶段推进
  useEffect(() => {
    const t = setTimeout(() => {
      setPhaseIdx((i) => Math.min(i + 1, PHASE_ORDER.length - 1));
    }, PHASE_DUR[phase]);
    return () => clearTimeout(t);
  }, [phaseIdx, phase]);

  // 完成回调
  useEffect(() => {
    if (phase === "scatter") {
      const t = setTimeout(() => {
        if (!doneRef.current) {
          doneRef.current = true;
          onComplete();
        }
      }, PHASE_DUR.scatter);
      return () => clearTimeout(t);
    }
  }, [phase, onComplete]);

  // 音效编排
  useEffect(() => {
    AudioManager.playSfx("open");
    const timers: number[] = [];
    const t1 = phaseStartMs(1) + 150; // 封蜡破碎
    const t2 = phaseStartMs(1) + 600; // 卷轴展开
    const t3 = phaseStartMs(2) + 100; // 手写起笔
    const t4 = phaseStartMs(2) + 1200; // 引言显现
    const t5 = phaseStartMs(4) + 100; // 燃烧起
    const t6 = phaseStartMs(5) + 100; // 焚毁
    const t7 = phaseStartMs(6) + 100; // 消散
    [
      [t1, "damage"] as const,
      [t2, "open"] as const,
      [t3, "select"] as const,
      [t4, "hover"] as const,
      [t5, "damage"] as const,
      [t6, "damage"] as const,
      [t7, "click"] as const,
    ].forEach(([ms, sfx]) => timers.push(window.setTimeout(() => AudioManager.playSfx(sfx), ms)));
    return () => timers.forEach((t) => clearTimeout(t));
  }, []);

  if (!faction || !cat) return null;

  const isScrollOpen = phase !== "enter"; // enter 之后卷轴展开
  const showContent = ["write", "hold", "burn", "destroy", "scatter"].includes(phase);
  const showSeal = phase === "enter" || phase === "unroll"; // 封蜡在 enter/unroll 阶段显示
  const isBurning = ["burn", "destroy", "scatter"].includes(phase);
  const isDestroying = ["destroy", "scatter"].includes(phase);
  const isScattering = phase === "scatter";

  // 燃烧进度 0-1
  const burnProgress =
    phase === "burn" ? 0.55 : phase === "destroy" ? 0.85 : phase === "scatter" ? 1 : 0;

  return (
    <motion.div
      className="fixed inset-0 z-[80] flex items-center justify-center overflow-hidden"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.4 }}
      style={{
        background:
          "radial-gradient(ellipse 60% 50% at 50% 50%, rgba(20,14,8,0.92) 0%, rgba(8,5,3,0.98) 60%, #050402 100%)",
      }}
    >
      {/* 仪式光柱 */}
      <motion.div
        className="absolute pointer-events-none"
        style={{
          width: "120%",
          height: "140%",
          background:
            "radial-gradient(ellipse 30% 45% at 50% 48%, rgba(160,120,50,0.10) 0%, transparent 70%)",
        }}
        animate={{ opacity: isBurning ? [0.4, 0.15] : [0.15, 0.4, 0.15] }}
        transition={{ duration: isBurning ? 1.2 : 3, repeat: Infinity }}
      />

      {/* 燃烧时的环境红光 */}
      <AnimatePresence>
        {isBurning && (
          <motion.div
            className="absolute inset-0 pointer-events-none"
            initial={{ opacity: 0 }}
            animate={{ opacity: isDestroying ? 0.5 : 0.3 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.6 }}
            style={{
              background:
                "radial-gradient(ellipse 50% 40% at 50% 55%, rgba(140,40,15,0.25) 0%, transparent 70%)",
            }}
          />
        )}
      </AnimatePresence>

      {/* ===== 阵营载体：密令卷轴 ===== */}
      <motion.div
        className="relative"
        style={{ width: "min(440px, 88vw)" }}
        initial={{ y: -420, opacity: 0, scale: 0.7, rotate: -8 }}
        animate={{
          y: 0,
          opacity: 1,
          scale: 1,
          rotate: 0,
        }}
        transition={{ duration: 0.85, ease: [0.16, 1, 0.3, 1] }}
      >
        {/* 顶部卷轴杆 */}
        <motion.div
          className="relative mx-auto"
          style={{
            width: "108%",
            marginLeft: "-4%",
            height: 16,
            borderRadius: 8,
            background: "linear-gradient(180deg, #3a2a14 0%, #5a4020 40%, #2a1c0c 100%)",
            boxShadow: "0 4px 10px rgba(0,0,0,0.7), inset 0 1px 0 rgba(200,160,80,0.25)",
            zIndex: 5,
          }}
          animate={{ opacity: isDestroying ? 0 : 1, y: isDestroying ? -20 : 0 }}
          transition={{ duration: 0.8 }}
        >
          <div className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-1/3 w-5 h-7 rounded-full" style={{ background: "radial-gradient(circle at 35% 30%, #6a4a24, #2a1808)", boxShadow: "0 2px 6px rgba(0,0,0,0.6)" }} />
          <div className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-1/3 w-5 h-7 rounded-full" style={{ background: "radial-gradient(circle at 35% 30%, #6a4a24, #2a1808)", boxShadow: "0 2px 6px rgba(0,0,0,0.6)" }} />
        </motion.div>

        {/* 卷轴主体 — 羊皮纸 */}
        <motion.div
          className="relative overflow-hidden"
          style={{
            width: "100%",
            // 卷起时高度小，展开后高度大
            background: `
              url('/textures/parchment.jpg') center/cover,
              linear-gradient(170deg, #e8d8b0 0%, #d8c498 40%, #c8b486 70%, #b8a878 100%)
            `,
            backgroundBlendMode: "multiply",
            borderLeft: "1px solid rgba(90,60,20,0.3)",
            borderRight: "1px solid rgba(90,60,20,0.3)",
            boxShadow: `
              0 18px 50px rgba(0,0,0,0.75),
              inset 0 0 60px rgba(120,80,30,0.15),
              inset 0 0 0 1px rgba(160,128,48,0.12)
            `,
          }}
          animate={{
            height: isScrollOpen ? "auto" : 90,
          }}
          transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
        >
          {/* 羊皮纸做旧污渍层 */}
          <div className="absolute inset-0 pointer-events-none" style={{
            background: `
              radial-gradient(circle at 18% 22%, rgba(90,50,15,0.12) 0%, transparent 8%),
              radial-gradient(circle at 82% 78%, rgba(90,50,15,0.10) 0%, transparent 7%),
              radial-gradient(circle at 65% 30%, rgba(60,35,10,0.08) 0%, transparent 6%),
              radial-gradient(circle at 30% 75%, rgba(60,35,10,0.09) 0%, transparent 5%)
            `,
            mixBlendMode: "multiply",
          }} />

          {/* 燃烧边缘遮罩：从四边向内侵蚀 */}
          <motion.div
            className="absolute inset-0 pointer-events-none"
            style={{
              background: `
                radial-gradient(ellipse 75% 75% at 50% 50%, transparent ${60 - burnProgress * 55}%, rgba(30,16,6,0.85) ${78 - burnProgress * 20}%, #0a0603 100%)
              `,
              mixBlendMode: "multiply",
            }}
            animate={{ opacity: burnProgress > 0 ? 1 : 0 }}
            transition={{ duration: 0.5 }}
          />
          {/* 燃烧焦黑边 */}
          {isBurning && (
            <div className="absolute inset-0 pointer-events-none" style={{
              boxShadow: `inset 0 0 ${20 + burnProgress * 40}px ${10 + burnProgress * 30}px rgba(20,8,2,${0.5 + burnProgress * 0.4})`,
            }} />
          )}
          {/* 燃烧橙红辉光 */}
          {isBurning && (
            <div className="absolute inset-0 pointer-events-none" style={{
              boxShadow: `inset 0 0 ${14 + burnProgress * 30}px ${4 + burnProgress * 16}px rgba(180,60,15,${0.35 * burnProgress})`,
            }} />
          )}

          {/* 内容区（展开后才显示） */}
          <AnimatePresence>
            {showContent && (
              <motion.div
                className="relative px-6 py-7 flex flex-col items-center"
                initial={{ opacity: 0 }}
                animate={{ opacity: isDestroying ? 0 : 1, filter: isBurning ? `sepia(${burnProgress * 0.6}) brightness(${1 - burnProgress * 0.4}) contrast(${1 + burnProgress * 0.3})` : "none" }}
                transition={{ duration: 0.6 }}
                style={{ minHeight: 360 }}
              >
                {/* 顶部装饰线 */}
                <motion.div
                  className="w-full flex items-center gap-2 mb-3"
                  initial={{ opacity: 0, scaleX: 0 }}
                  animate={{ opacity: 1, scaleX: 1 }}
                  transition={{ delay: 0.2, duration: 0.5 }}
                  style={{ transformOrigin: "center" }}
                >
                  <div className="flex-1 h-px" style={{ background: `linear-gradient(90deg, transparent, ${cat.color}80)` }} />
                  <FactionIcon category={faction.category} size={14} color={cat.color} />
                  <div className="flex-1 h-px" style={{ background: `linear-gradient(90deg, ${cat.color}80, transparent)` }} />
                </motion.div>

                {/* 分类标签 */}
                <motion.div
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3, duration: 0.4 }}
                  className="font-cinzel tracking-[0.4em] mb-1"
                  style={{ fontSize: 10, color: cat.color, letterSpacing: "0.35em" }}
                >
                  {cat.label.toUpperCase()} · ORDO
                </motion.div>

                {/* 阵营图片 — 拱形肖像 */}
                <motion.div
                  className="relative mt-2 mb-3"
                  initial={{ opacity: 0, scale: 0.7 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.35, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                  style={{
                    width: 92,
                    height: 116,
                    borderRadius: "46px 46px 8px 8px",
                    overflow: "hidden",
                    border: `1.5px solid ${cat.color}`,
                    boxShadow: `0 4px 14px rgba(0,0,0,0.5), 0 0 18px ${cat.color}30`,
                  }}
                >
                  <img src={faction.image} alt={faction.name} className="w-full h-full object-cover" draggable={false} />
                  <div className="absolute inset-0" style={{ background: `linear-gradient(180deg, transparent 50%, ${cat.color}22 100%)` }} />
                </motion.div>

                {/* 阵营名称 — 手写逐字 */}
                <div className="flex items-center justify-center min-h-[52px] mb-2">
                  {nameChars.map((ch, i) => (
                    <motion.span
                      key={i}
                      className="font-caoshu"
                      style={{
                        fontSize: 38,
                        color: "#3a2410",
                        textShadow: "0 1px 0 rgba(255,240,200,0.3), 0 2px 3px rgba(60,30,10,0.3)",
                        marginLeft: i === 0 ? 0 : 2,
                      }}
                      initial={{ opacity: 0, y: 4, filter: "blur(4px)" }}
                      animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                      transition={{
                        delay: 0.5 + i * 0.18,
                        duration: 0.35,
                        ease: "easeOut",
                      }}
                    >
                      {ch}
                    </motion.span>
                  ))}
                  {/* 墨水光标 */}
                  <motion.span
                    className="inline-block ml-1"
                    style={{ width: 2, height: 34, background: "#3a2410", alignSelf: "center" }}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: [0, 1, 1, 0] }}
                    transition={{ delay: 0.5, duration: 0.4 + nameChars.length * 0.18, times: [0, 0.1, 0.85, 1] }}
                  />
                </div>

                {/* 分隔花纹 */}
                <motion.div
                  className="flex items-center gap-1.5 mb-3"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.6 + nameChars.length * 0.18, duration: 0.4 }}
                >
                  <div className="w-10 h-px" style={{ background: `linear-gradient(90deg, transparent, ${cat.color}90)` }} />
                  <span style={{ color: cat.color, fontSize: 8 }}>✦</span>
                  <div className="w-10 h-px" style={{ background: `linear-gradient(90deg, ${cat.color}90, transparent)` }} />
                </motion.div>

                {/* 引言 — 手写体斜体 */}
                <motion.p
                  className="font-cormorant italic text-center leading-relaxed mb-3"
                  style={{ fontSize: 13, color: "#5a3a1c", maxWidth: 320 }}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.7 + nameChars.length * 0.18, duration: 0.5 }}
                >
                  「{faction.quote}」
                </motion.p>

                {/* 胜利条件 */}
                <motion.div
                  className="w-full mt-1"
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.9 + nameChars.length * 0.18, duration: 0.5 }}
                >
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="font-cinzel tracking-[0.3em]" style={{ fontSize: 8, color: "#8a6a28" }}>VICTORIA OCCULTA</span>
                    <div className="flex-1 h-px" style={{ background: "linear-gradient(90deg, rgba(120,90,30,0.4), transparent)" }} />
                  </div>
                  <p className="font-serif-display text-center leading-[1.7]" style={{ fontSize: 12, color: "#4a3018" }}>
                    {faction.win}
                  </p>
                </motion.div>

                {/* 揭示者署名 */}
                <motion.div
                  className="mt-4 flex items-center gap-1.5"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 1.1 + nameChars.length * 0.18, duration: 0.4 }}
                >
                  <span className="font-cinzel tracking-widest" style={{ fontSize: 8, color: "#7a5a28" }}>REVELATIO</span>
                  <span className="font-caoshu" style={{ fontSize: 14, color: "#3a2410" }}>{charName}</span>
                  <span className="font-cinzel" style={{ fontSize: 8, color: "#7a5a28" }}>· {data.isHuman ? "玩家" : "AI"}</span>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* 封蜡封印（未展开时显示在中央） */}
          <AnimatePresence>
            {showSeal && (
              <motion.div
                className="absolute inset-0 flex items-center justify-center"
                exit={{ opacity: 0 }}
              >
                <motion.div
                  className="relative flex items-center justify-center"
                  style={{
                    width: 64,
                    height: 64,
                    borderRadius: "50%",
                    background: `radial-gradient(circle at 35% 30%, ${cat.color}, ${cat.color}cc 40%, ${cat.color}88 70%, ${cat.color}44 100%)`,
                    boxShadow: `0 4px 12px rgba(0,0,0,0.5), inset 0 -3px 8px rgba(0,0,0,0.3), inset 0 2px 4px rgba(255,255,255,0.15)`,
                  }}
                  initial={{ scale: 0, rotate: -30 }}
                  animate={{ scale: 1, rotate: 0 }}
                  transition={{ delay: 0.4, duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
                >
                  {/* 封蜡破裂动画 */}
                  <motion.div
                    className="absolute inset-0 flex items-center justify-center"
                    animate={
                      phase === "unroll"
                        ? { scale: [1, 1.15, 0.4], opacity: [1, 1, 0], rotate: [0, 5, 20] }
                        : {}
                    }
                    transition={{ duration: 0.5, ease: "easeOut" }}
                  >
                    <FactionIcon category={faction.category} size={26} color="#f0e8d0" />
                  </motion.div>
                  {/* 封蜡裂纹 */}
                  <motion.div
                    className="absolute inset-0 rounded-full pointer-events-none"
                    style={{ boxShadow: `inset 0 0 0 2px ${cat.color}aa` }}
                    animate={phase === "unroll" ? { opacity: [1, 0] } : {}}
                    transition={{ duration: 0.4 }}
                  />
                </motion.div>
                {/* 封蜡碎屑飞散 */}
                <AnimatePresence>
                  {phase === "unroll" &&
                    Array.from({ length: 8 }).map((_, i) => {
                      const ang = (i / 8) * Math.PI * 2;
                      return (
                        <motion.div
                          key={i}
                          className="absolute"
                          style={{
                            width: 6,
                            height: 6,
                            borderRadius: "50%",
                            background: cat.color,
                            top: "50%",
                            left: "50%",
                          }}
                          initial={{ x: 0, y: 0, opacity: 1, scale: 1 }}
                          animate={{
                            x: Math.cos(ang) * 50,
                            y: Math.sin(ang) * 50,
                            opacity: 0,
                            scale: 0.3,
                          }}
                          transition={{ duration: 0.6, ease: "easeOut" }}
                        />
                      );
                    })}
                </AnimatePresence>
              </motion.div>
            )}
          </AnimatePresence>

          {/* 燃烧火焰粒子（沿边缘上升） */}
          <AnimatePresence>
            {isBurning &&
              !isScattering &&
              flameParticles.map((p) => {
                const posStyle: CSSProperties =
                  p.edge === 0
                    ? { top: -4, left: `${p.pos}%` }
                    : p.edge === 1
                      ? { right: -4, top: `${p.pos}%` }
                      : p.edge === 2
                        ? { bottom: -4, left: `${p.pos}%` }
                        : { left: -4, top: `${p.pos}%` };
                return (
                  <motion.div
                    key={p.id}
                    className="absolute pointer-events-none"
                    style={{
                      ...posStyle,
                      width: p.size,
                      height: p.size,
                      borderRadius: "50%",
                      background: `radial-gradient(circle, hsl(${p.hue},100%,60%) 0%, hsl(${p.hue - 10},90%,40%) 50%, transparent 80%)`,
                      filter: "blur(1px)",
                      mixBlendMode: "screen",
                    }}
                    initial={{ opacity: 0, scale: 0.5, y: 0 }}
                    animate={{
                      opacity: [0, 0.9, 0],
                      scale: [0.5, 1.3, 0.2],
                      y: [0, -30 - p.size * 2],
                    }}
                    transition={{
                      duration: p.dur,
                      delay: p.delay,
                      repeat: Infinity,
                      ease: "easeOut",
                    }}
                  />
                );
              })}
          </AnimatePresence>
        </motion.div>

        {/* 底部卷轴杆 */}
        <motion.div
          className="relative mx-auto"
          style={{
            width: "108%",
            marginLeft: "-4%",
            height: 16,
            borderRadius: 8,
            background: "linear-gradient(180deg, #3a2a14 0%, #5a4020 40%, #2a1c0c 100%)",
            boxShadow: "0 -2px 8px rgba(0,0,0,0.5), inset 0 1px 0 rgba(200,160,80,0.25)",
            zIndex: 5,
          }}
          animate={{ opacity: isDestroying ? 0 : 1, y: isDestroying ? 20 : 0 }}
          transition={{ duration: 0.8 }}
        >
          <div className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-1/3 w-5 h-7 rounded-full" style={{ background: "radial-gradient(circle at 35% 30%, #6a4a24, #2a1808)", boxShadow: "0 2px 6px rgba(0,0,0,0.6)" }} />
          <div className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-1/3 w-5 h-7 rounded-full" style={{ background: "radial-gradient(circle at 35% 30%, #6a4a24, #2a1808)", boxShadow: "0 2px 6px rgba(0,0,0,0.6)" }} />
        </motion.div>
      </motion.div>

      {/* ===== 灰烬消散粒子 ===== */}
      <AnimatePresence>
        {isScattering && (
          <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
            {ashParticles.map((a) => (
              <motion.div
                key={a.id}
                className="absolute"
                style={{
                  width: a.size,
                  height: a.size,
                  borderRadius: "1px",
                  background: a.dark ? "rgba(30,22,14,0.85)" : "rgba(90,70,45,0.7)",
                  left: `${a.startX}%`,
                  top: "50%",
                }}
                initial={{ opacity: 0, x: 0, y: 0, rotate: 0, scale: 0.5 }}
                animate={{
                  opacity: [0, 0.9, 0],
                  x: a.drift,
                  y: [0, a.riseY],
                  rotate: a.rot,
                  scale: [0.5, 1, 0.3],
                }}
                transition={{
                  duration: a.dur,
                  delay: a.delay,
                  ease: "easeOut",
                }}
              />
            ))}
          </div>
        )}
      </AnimatePresence>

      {/* 底部提示 */}
      <AnimatePresence>
        {phase === "hold" && (
          <motion.div
            className="absolute bottom-10 left-1/2 -translate-x-1/2 font-cinzel tracking-[0.4em]"
            style={{ fontSize: 9, color: "#6a5a3c" }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.6 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.5 }}
          >
            FATUM REVELATUR · 命运已昭
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

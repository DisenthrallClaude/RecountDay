import { useEffect, useLayoutEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { CHARACTERS, type CharacterDef } from "../data/characters";
import { IconQuill, IconExit, IconScroll } from "./Icons";
import { AudioManager } from "../audio/AudioManager";
import { assetUrl } from "../utils/assetUrl";

/**
 * 扇形展开需要约 1190×410 的空间（半径 750、±45°、卡牌 130×190）。
 * 原实现把这些尺寸写死，窗口窄于 ~1250px 时两端的角色会被
 * overflow-hidden 直接裁掉 —— 24 个角色里有 8 个根本选不到。
 * 这里按视口实时算一个缩放系数，让扇面始终完整可见。
 */
const FAN_DESIGN_W = 1240;
const FAN_DESIGN_H = 470;

function useFanScale() {
  const [scale, setScale] = useState(1);
  useLayoutEffect(() => {
    const measure = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      // 留出顶部标题与底部提示的空间
      const usableH = Math.max(240, h - 210);
      setScale(Math.min(1, (w - 48) / FAN_DESIGN_W, usableH / FAN_DESIGN_H));
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);
  return scale;
}

interface Props {
  onConfirm: (id: number) => void;
  onBack: () => void;
}

export default function CharacterSelect({ onConfirm, onBack }: Props) {
  const [selected, setSelected] = useState<number | null>(null);
  const [hovered, setHovered] = useState<number | null>(null);
  const [detailMode, setDetailMode] = useState(false);

  const ch = CHARACTERS.find((c) => c.id === selected) || null;

  const total = CHARACTERS.length;
  const fanAngle = 90; // wider spread for upward arc
  const angleStep = fanAngle / (total - 1);
  const startAngle = -fanAngle / 2;
  const fanRadius = 750;

  const fanScale = useFanScale();

  // 这一屏此前完全没有音效，和主菜单的反馈节奏对不上
  const handleCardClick = (id: number) => {
    AudioManager.playSfx("select");
    setSelected(id);
    setDetailMode(true);
  };

  const handleExitDetail = () => {
    AudioManager.playSfx("click");
    setDetailMode(false);
  };

  // Esc 退出详情页 / 返回主菜单
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (detailMode) handleExitDetail();
      else onBack();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [detailMode, onBack]);

  return (
    <div className="fixed inset-0 overflow-hidden flex flex-col" style={{ backgroundImage: `url(${assetUrl("images/bg-dark.jpg")})`, backgroundSize: "cover", backgroundPosition: "center" }}>
      {/* Background - complex magic array */}
      <div className="absolute inset-0 pointer-events-none" style={{ background: "rgba(0,0,0,0.5)" }}>
        {/* Complex SVG magic array - very detailed */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[900px] h-[900px] opacity-[0.18]">
          <svg viewBox="0 0 600 600" className="w-full h-full animate-rotate-slow">
            {/* Outer ring with decorative marks */}
            <circle cx="300" cy="300" r="290" fill="none" stroke="#c8a043" strokeWidth="0.4" />
            <circle cx="300" cy="300" r="280" fill="none" stroke="#c8a043" strokeWidth="0.6" />
            <circle cx="300" cy="300" r="270" fill="none" stroke="#c8a043" strokeWidth="0.3" strokeDasharray="3 2" />
            {/* Second ring */}
            <circle cx="300" cy="300" r="240" fill="none" stroke="#c8a043" strokeWidth="0.4" />
            <circle cx="300" cy="300" r="230" fill="none" stroke="#c8a043" strokeWidth="0.3" />
            {/* Third ring */}
            <circle cx="300" cy="300" r="190" fill="none" stroke="#c8a043" strokeWidth="0.5" />
            {/* Inner rings */}
            <circle cx="300" cy="300" r="120" fill="none" stroke="#c8a043" strokeWidth="0.4" />
            <circle cx="300" cy="300" r="80" fill="none" stroke="#c8a043" strokeWidth="0.3" />
            <circle cx="300" cy="300" r="60" fill="none" stroke="#c8a043" strokeWidth="0.4" />
            <circle cx="300" cy="300" r="40" fill="none" stroke="#c8a043" strokeWidth="0.3" />
            {/* Hexagram */}
            <path d="M300 150 L440 380 L160 380 Z" fill="none" stroke="#c8a043" strokeWidth="0.6" />
            <path d="M300 450 L160 220 L440 220 Z" fill="none" stroke="#c8a043" strokeWidth="0.6" />
            {/* Pentagon star */}
            {Array.from({ length: 5 }).map((_, i) => {
              const a1 = (i * 72 - 90) * Math.PI / 180;
              const a2 = ((i + 2) * 72 - 90) * Math.PI / 180;
              const x1 = 300 + 100 * Math.cos(a1);
              const y1 = 300 + 100 * Math.sin(a1);
              const x2 = 300 + 100 * Math.cos(a2);
              const y2 = 300 + 100 * Math.sin(a2);
              return <line key={`pent-${i}`} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#c8a043" strokeWidth="0.5" />;
            })}
            {/* Outer marks - 24 ticks */}
            {Array.from({ length: 24 }).map((_, i) => (
              <line key={`tick-${i}`} x1="300" y1="20" x2="300" y2="40" transform={`rotate(${i * 15} 300 300)`} stroke="#c8a043" strokeWidth="0.4" />
            ))}
            {/* Inner marks - 12 ticks */}
            {Array.from({ length: 12 }).map((_, i) => (
              <line key={`itick-${i}`} x1="300" y1="180" x2="300" y2="195" transform={`rotate(${i * 30} 300 300)`} stroke="#c8a043" strokeWidth="0.3" />
            ))}
            {/* Runes ring */}
            {Array.from({ length: 36 }).map((_, i) => {
              const angle = (i * 10) * Math.PI / 180;
              const x = 300 + 255 * Math.cos(angle);
              const y = 300 + 255 * Math.sin(angle);
              const runes = "ᚠᚢᚦᚨᚱᚲᚷᚹᚺᚾᛁᛃᛇᛈᛉᛊᛏᛒᛖᛗᛚᛜᛟᛞᚠᚢᚦᚨᚱᚲᚷᚹᚺᚾᛁᛃ";
              return <text key={`rune-${i}`} x={x} y={y} fill="#a08030" fontSize="9" textAnchor="middle" dominantBaseline="middle">{runes[i]}</text>;
            })}
            {/* Inner runes */}
            {Array.from({ length: 12 }).map((_, i) => {
              const angle = (i * 30) * Math.PI / 180;
              const x = 300 + 145 * Math.cos(angle);
              const y = 300 + 145 * Math.sin(angle);
              const runes = "ᚠᚢᚦᚨᚱᚲᚷᚹᚺᚾᛁᛃ";
              return <text key={`irune-${i}`} x={x} y={y} fill="#a08030" fontSize="8" textAnchor="middle" dominantBaseline="middle">{runes[i]}</text>;
            })}
            {/* Center dot */}
            <circle cx="300" cy="300" r="3" fill="#a08030" />
            {/* Radiating lines */}
            {Array.from({ length: 8 }).map((_, i) => {
              const a = (i * 45) * Math.PI / 180;
              const x1 = 300 + 60 * Math.cos(a);
              const y1 = 300 + 60 * Math.sin(a);
              const x2 = 300 + 120 * Math.cos(a);
              const y2 = 300 + 120 * Math.sin(a);
              return <line key={`rad-${i}`} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#c8a043" strokeWidth="0.3" opacity="0.6" />;
            })}
          </svg>
        </div>
        {/* Counter-rotating inner ring */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[700px] opacity-[0.08]">
          <svg viewBox="0 0 200 200" className="w-full h-full animate-rotate-rev">
            <circle cx="100" cy="100" r="80" fill="none" stroke="#c8a043" strokeWidth="0.3" strokeDasharray="2 3" />
            <circle cx="100" cy="100" r="60" fill="none" stroke="#c8a043" strokeWidth="0.2" strokeDasharray="1 2" />
          </svg>
        </div>
        {/* Particles */}
        {Array.from({ length: 12 }).map((_, i) => (
          <span key={i} className="float-particle absolute w-1 h-1 rounded-full" style={{
            left: `${10 + i * 7}%`, bottom: "10%",
            background: i % 2 ? "#c9b896" : "#a08030", boxShadow: "0 0 4px rgba(200,160,67,0.5)",
            animationDuration: `${8 + i}s`, animationDelay: `${i * 0.8}s`,
            ["--dx" as string]: `${(i % 2 ? 1 : -1) * 25}px`,
          }} />
        ))}
      </div>

      {/* Header - better font */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
        className="relative z-20 flex items-center justify-between px-8 py-5"
      >
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-[#c9b896] font-cinzel text-sm hover:text-[#e8dfc8] transition-colors group"
        >
          <IconExit size={14} color="#c9b896" />
          <span className="group-hover:translate-x-[-2px] transition-transform">返回</span>
        </button>
        <div className="text-center">
          <motion.h2
            initial={{ opacity: 0, scale: 0.9, letterSpacing: "0.6em" }}
            animate={{ opacity: 1, scale: 1, letterSpacing: "0.3em" }}
            transition={{ duration: 1, delay: 0.2 }}
            className="font-caoshu text-ink-gradient text-4xl md:text-5xl"
            style={{ fontWeight: 400 }}
          >
            选 择 你 的 叙 事 者
          </motion.h2>
          <div className="flex items-center justify-center gap-3 mt-1">
            <motion.span initial={{ scaleX: 0 }} animate={{ scaleX: 1 }} transition={{ duration: 0.8, delay: 0.5 }} className="block w-16 h-px bg-gradient-to-r from-transparent to-[#a08030] origin-right" />
            <span className="font-cinzel text-[10px] text-[#a08030] tracking-[0.4em]">CHOOSE YOUR NARRATOR</span>
            <motion.span initial={{ scaleX: 0 }} animate={{ scaleX: 1 }} transition={{ duration: 0.8, delay: 0.5 }} className="block w-16 h-px bg-gradient-to-l from-transparent to-[#a08030] origin-left" />
          </div>
        </div>
        <div className="w-24" />
      </motion.div>

      {/* Fan cards or detail view */}
      <div className="relative z-10 flex-1 overflow-hidden">
        <AnimatePresence mode="wait">
          {detailMode && ch ? (
            <DetailView key="detail" ch={ch} onExit={handleExitDetail} onConfirm={onConfirm} />
          ) : (
            <FanView
              key="fan"
              startAngle={startAngle}
              angleStep={angleStep}
              fanRadius={fanRadius}
              scale={fanScale}
              hovered={hovered}
              onSelect={handleCardClick}
              onHover={setHovered}
            />
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

function FanView({ startAngle, angleStep, fanRadius, scale, hovered, onSelect, onHover }: {
  startAngle: number;
  angleStep: number;
  fanRadius: number;
  scale: number;
  hovered: number | null;
  onSelect: (id: number) => void;
  onHover: (id: number | null) => void;
}) {
  const hoveredCh = hovered != null ? CHARACTERS.find((c) => c.id === hovered) ?? null : null;
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, scale: 1.05 }}
      transition={{ duration: 0.5 }}
      className="absolute inset-0"
    >
      {/* Instruction */}
      <motion.div
        animate={{ opacity: [0.5, 1, 0.5] }}
        transition={{ duration: 2.5, repeat: Infinity }}
        className="absolute top-8 left-1/2 -translate-x-1/2 text-center pointer-events-none z-10"
      >
        <span className="font-cinzel text-[#a08030] text-xs tracking-[0.4em]">◆ 点选角色 · 查看详情 ◆</span>
      </motion.div>

      {/* 悬停速览：不必点进详情页就能看清这个角色是谁 */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 pointer-events-none w-[min(92vw,620px)]">
        <AnimatePresence mode="wait">
          {hoveredCh && (
            <motion.div
              key={hoveredCh.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 6 }}
              transition={{ duration: 0.22, ease: [0.22, 0.85, 0.3, 1] }}
              className="rounded-lg px-4 py-2.5 text-center"
              style={{
                background: "linear-gradient(150deg, rgba(26,20,16,0.94), rgba(10,8,6,0.92))",
                border: "1px solid rgba(160,128,48,0.38)",
                boxShadow: "0 10px 30px rgba(0,0,0,0.7)",
                backdropFilter: "blur(10px)",
              }}
            >
              <div className="flex items-center justify-center gap-2.5">
                <span className="font-caoshu text-[#e8dfc8] text-lg tracking-[0.18em]">{hoveredCh.name}</span>
                <span className="text-[#5a4818]">·</span>
                <span className="font-cinzel text-[10px] tracking-[0.3em]" style={{ color: hoveredCh.color }}>
                  {hoveredCh.ability}
                </span>
                <span className="text-[#5a4818]">·</span>
                <span className="font-cinzel text-[10px] text-[#8a7a5c]">篇幅 {hoveredCh.maxFragments}</span>
              </div>
              <div className="font-brush text-[11px] text-[#9c8a68] italic mt-1 truncate">
                「{hoveredCh.quote}」
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Fan cards - UPWARD arc (convex up), 整体按视口缩放 */}
      <div
        className="absolute inset-0"
        style={{ transform: `scale(${scale})`, transformOrigin: "50% 42%" }}
      >
        {CHARACTERS.map((c, i) => {
          const angle = startAngle + i * angleStep;
          const isHovered = hovered === c.id;
          return (
            <FanCard
              key={c.id}
              ch={c}
              angle={angle}
              radius={fanRadius}
              index={i}
              isHovered={isHovered}
              onSelect={() => onSelect(c.id)}
              onHover={(h) => {
                if (h) AudioManager.playSfx("hover");
                onHover(h ? c.id : null);
              }}
            />
          );
        })}
      </div>
    </motion.div>
  );
}

function FanCard({ ch, angle, radius, index, isHovered, onSelect, onHover }: {
  ch: CharacterDef;
  angle: number;
  radius: number;
  index: number;
  isHovered: boolean;
  onSelect: () => void;
  onHover: (h: boolean) => void;
}) {
  // RAINBOW shape (upward arch): center card HIGH, side cards LOW
  // This is the OPPOSITE of a smile - like a rainbow ⌒
  // center at angle=0 should be at the TOP (highest position)
  // edges at angle=±45 should curve DOWN (lower position)
  const rad = (angle * Math.PI) / 180;
  const xOffset = radius * Math.sin(rad);
  // For rainbow: center at top (0), edges go DOWN (positive Y)
  // yOffset = radius * (1 - cos) gives 0 at center, positive at edges = RAINBOW!
  const rainbowY = radius * (1 - Math.cos(rad));

  const lift = isHovered ? 25 : 0;
  const scale = isHovered ? 1.1 : 1;
  const cardW = 130;
  const cardH = 190;

  const transform = `translateX(-50%) translate(${xOffset}px, ${rainbowY - lift}px) rotate(${angle}deg) scale(${scale})`;

  return (
    <div
      onMouseEnter={() => onHover(true)}
      onMouseLeave={() => onHover(false)}
      onClick={onSelect}
      className="absolute preserve-3d cursor-pointer"
      style={{
        left: "50%",
        top: "45%", // pivot in middle - center card arches up, edges curve down
        width: `${cardW}px`,
        height: `${cardH}px`,
        marginLeft: `-${cardW/2}px`,
        marginTop: `-${cardH/2}px`, // center the card on the pivot
        transformOrigin: "center bottom",
        transform,
        zIndex: isHovered ? 100 : 10 + Math.round(Math.abs(angle) * 2),
        // Only transition transform, NOT opacity (opacity is set by animation only)
        transition: "transform 0.3s cubic-bezier(0.16, 1, 0.3, 1)",
        opacity: 0,
        animation: `fanCardIn 0.5s cubic-bezier(0.16, 1, 0.3, 1) ${index * 0.03}s forwards`,
      }}
    >
      <div
        className="relative w-full h-full rounded-lg overflow-hidden"
        style={{
          background: "linear-gradient(135deg, #2a2218 0%, #1a1410 50%, #0a0806 100%)",
          padding: "2px",
          border: "1px solid rgba(160,128,48,0.4)",
          boxShadow: isHovered
            ? "0 12px 36px rgba(0,0,0,0.8), 0 0 24px rgba(200,160,67,0.25)"
            : "0 6px 18px rgba(0,0,0,0.6)",
        }}
      >
        <div className="relative w-full h-full bg-[#0a0806] rounded-[5px] overflow-hidden">
          <img src={ch.portrait} alt={ch.name} className="w-full h-full object-cover" draggable={false} />
          <div className="absolute inset-0" style={{
            background: `linear-gradient(180deg, transparent 55%, ${ch.color}55 100%)`,
          }} />
          {/* Name */}
          <div className="absolute bottom-0 inset-x-0 p-2 text-center" style={{
            background: "linear-gradient(180deg, transparent, rgba(0,0,0,0.92))",
          }}>
            <div className="font-gothic text-[#e8dfc8] text-sm tracking-wider">{ch.name}</div>
            <div className="font-cinzel text-[8px] text-[#c9b896]/70 tracking-widest mt-0.5">{ch.ability}</div>
          </div>
          {/* Hover shimmer */}
          {isHovered && (
            <div className="absolute inset-0 pointer-events-none overflow-hidden">
              <div className="absolute inset-0" style={{
                background: "linear-gradient(110deg, transparent 30%, rgba(200,160,67,0.2) 50%, transparent 70%)",
                backgroundSize: "200% 100%",
                animation: "shimmer-sweep 2s ease-in-out infinite",
              }} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function DetailView({ ch, onExit, onConfirm }: { ch: CharacterDef; onExit: () => void; onConfirm: (id: number) => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 1.03 }}
      transition={{ duration: 0.5, ease: [0.22, 0.85, 0.3, 1] }}
      className="absolute inset-0 flex items-center justify-center gap-4 md:gap-6 px-4 md:px-10 py-6"
    >
      {/* Left: character portrait - slightly smaller for better proportion */}
      <motion.div
        initial={{ opacity: 0, x: -30 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.5, delay: 0.08 }}
        className="flex-shrink-0"
      >
        <div className="relative" style={{ width: "clamp(200px, 22vw, 290px)" }}>
          {/* Outer frame - company style dark glass */}
          <div
            className="relative rounded-lg overflow-hidden"
            style={{
              background: "linear-gradient(145deg, rgba(26,20,16,0.98) 0%, rgba(14,10,6,0.98) 100%)",
              border: "1px solid rgba(160,128,48,0.45)",
              boxShadow: "0 16px 48px rgba(0,0,0,0.8), 0 0 0 1px rgba(240,200,98,0.06) inset, 0 0 30px rgba(200,160,67,0.08)",
            }}
          >
            {/* Top gold accent line */}
            <div className="h-px" style={{ background: "linear-gradient(90deg, transparent, rgba(240,200,98,0.5), transparent)" }} />

            {/* Close button */}
            <button
              onClick={onExit}
              className="absolute top-2 right-2 z-20 w-7 h-7 flex items-center justify-center rounded text-[#8a7a5c] hover:text-[#e8dfc8] hover:bg-[#a08030]/20 transition-all"
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M2 2l8 8M10 2l-8 8"/></svg>
            </button>

            {/* Portrait */}
            <div className="relative bg-[#0a0806] overflow-hidden" style={{ aspectRatio: "9/16", margin: "3px" }}>
              <img src={ch.portrait} alt={ch.name} className="w-full h-full object-cover" />
              <div className="absolute inset-0" style={{
                background: `linear-gradient(180deg, transparent 50%, ${ch.color}22 80%, ${ch.color}44 100%)`,
              }} />
              {/* Subtle vignette */}
              <div className="absolute inset-0 pointer-events-none" style={{
                background: "radial-gradient(ellipse at center, transparent 50%, rgba(0,0,0,0.4) 100%)",
              }} />
              {/* Corner accents */}
              <div className="absolute top-1 left-1 w-3 h-3 border-t border-l border-[#a08030]/40" />
              <div className="absolute top-1 right-1 w-3 h-3 border-t border-r border-[#a08030]/40" />
              <div className="absolute bottom-1 left-1 w-3 h-3 border-b border-l border-[#a08030]/40" />
              <div className="absolute bottom-1 right-1 w-3 h-3 border-b border-r border-[#a08030]/40" />
              {/* Name overlay */}
              <div className="absolute bottom-0 inset-x-0 p-3 text-center" style={{
                background: "linear-gradient(180deg, transparent, rgba(0,0,0,0.95))",
              }}>
                <div className="font-gothic text-[#e8dfc8] text-xl tracking-[0.2em]">{ch.name}</div>
                <div className="font-cinzel text-[9px] text-[#c9b896]/80 tracking-[0.35em] mt-0.5">{ch.ability}</div>
              </div>
            </div>

            {/* Bottom gold accent */}
            <div className="h-px" style={{ background: "linear-gradient(90deg, transparent, rgba(160,128,48,0.3), transparent)" }} />
          </div>
        </div>
      </motion.div>

      {/* Right: character info panel - company style dark glass */}
      <motion.div
        initial={{ opacity: 0, x: 30 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.5, delay: 0.15 }}
        className="flex flex-col"
        style={{ width: "clamp(300px, 42vw, 460px)", maxHeight: "calc(100vh - 100px)" }}
      >
        {/* Main info card */}
        <div
          className="rounded-lg overflow-hidden flex flex-col"
          style={{
            background: "linear-gradient(145deg, rgba(26,20,16,0.97) 0%, rgba(14,10,6,0.97) 100%)",
            border: "1px solid rgba(160,128,48,0.4)",
            boxShadow: "0 12px 40px rgba(0,0,0,0.7), 0 0 0 1px rgba(240,200,98,0.06) inset",
            backdropFilter: "blur(16px)",
          }}
        >
          {/* Top gold bar */}
          <div className="h-px" style={{ background: "linear-gradient(90deg, transparent, rgba(240,200,98,0.5), transparent)" }} />

          {/* Content area - scrollable */}
          <div className="p-4 overflow-y-auto flex-1" style={{ maxHeight: "calc(100vh - 220px)" }}>
            {/* Header section with name and stats row */}
            <div className="flex items-start justify-between gap-3 mb-3">
              <div>
                <h3 className="font-gothic text-2xl text-[#e8dfc8] tracking-[0.15em]" style={{ textShadow: "0 0 12px rgba(200,160,67,0.2)" }}>
                  {ch.name}
                </h3>
                <div className="flex items-center gap-2 mt-1">
                  <div className="h-px w-6" style={{ background: "linear-gradient(90deg, rgba(160,128,48,0.5), transparent)" }} />
                  <span className="font-cinzel text-[9px] text-[#a08030] tracking-[0.3em]">{ch.ability}</span>
                </div>
              </div>
              {/* Stats - compact inline */}
              <div className="flex gap-1.5">
                <div className="text-center px-2 py-1 rounded" style={{ background: "rgba(160,128,48,0.1)", border: "1px solid rgba(160,128,48,0.2)" }}>
                  <div className="text-[7px] font-cinzel text-[#c9b896]/50 tracking-wider">篇幅</div>
                  <div className="font-gothic text-sm text-[#e8dfc8] leading-tight">{ch.maxFragments}</div>
                </div>
                <div className="text-center px-2 py-1 rounded" style={{ background: "rgba(160,128,48,0.1)", border: "1px solid rgba(160,128,48,0.2)" }}>
                  <div className="text-[7px] font-cinzel text-[#c9b896]/50 tracking-wider">技能</div>
                  <div className="font-gothic text-sm text-[#e8dfc8] leading-tight">{ch.skills.length}</div>
                </div>
                <div className="text-center px-2 py-1 rounded" style={{ background: "rgba(160,128,48,0.1)", border: "1px solid rgba(160,128,48,0.2)" }}>
                  <div className="text-[7px] font-cinzel text-[#c9b896]/50 tracking-wider">阶</div>
                  <div className="font-gothic text-sm text-[#e8dfc8] leading-tight">{Math.max(...ch.skills.map(s => s.rankReq))}</div>
                </div>
              </div>
            </div>

            {/* Divider */}
            <div className="h-px mb-3" style={{ background: "linear-gradient(90deg, rgba(160,128,48,0.3), rgba(160,128,48,0.08) 60%, transparent)" }} />

            {/* Quote */}
            <div className="mb-3 px-3 py-2 rounded" style={{ background: "rgba(160,128,48,0.06)", borderLeft: "2px solid rgba(160,128,48,0.3)" }}>
              <p className="font-brush text-[#c9b896] text-[12px] italic leading-relaxed">「{ch.quote}」</p>
            </div>

            {/* Description */}
            <p className="text-[11px] text-[#c9b896]/80 leading-[1.7] mb-4">{ch.desc}</p>

            {/* Skills section */}
            <div className="flex items-center gap-2 mb-2">
              <div className="w-1 h-3 rounded-sm" style={{ background: "linear-gradient(180deg, #f0c862, #a08030)" }} />
              <IconQuill size={11} color="#a08030" />
              <span className="font-cinzel text-[9px] text-[#a08030] tracking-[0.35em]">叙事能力</span>
              <div className="flex-1 h-px" style={{ background: "linear-gradient(90deg, rgba(160,128,48,0.2), transparent)" }} />
            </div>
            <div className="space-y-1.5">
              {ch.skills.map((sk, i) => (
                <motion.div
                  key={sk.key}
                  initial={{ opacity: 0, x: 8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.1 + 0.06 * i, duration: 0.3 }}
                  className="p-2 rounded"
                  style={{
                    background: "rgba(10,8,6,0.6)",
                    border: "1px solid rgba(160,128,48,0.15)",
                  }}
                >
                  <div className="flex justify-between items-center mb-0.5">
                    <span className="font-gothic text-[#e8dfc8] text-[13px]">{sk.name}</span>
                    <div className="flex items-center gap-1.5">
                      <span className="font-cinzel text-[8px] text-[#a08030] px-1 py-px rounded" style={{ border: "1px solid rgba(160,128,48,0.25)" }}>{sk.type}</span>
                    </div>
                  </div>
                  <p className="text-[10.5px] text-[#c9b896]/80 leading-[1.5]">{sk.desc}</p>
                  <div className="flex items-center gap-2 mt-1 text-[8px] text-[#a08030]/70 font-cinzel tracking-wider">
                    <span>阶位 {sk.rankReq}</span>
                    {sk.cost > 0 && <span>· 消耗 {sk.cost}</span>}
                  </div>
                </motion.div>
              ))}
            </div>
          </div>

          {/* Confirm button area - fixed at bottom */}
          <div className="p-4 pt-2">
            <div className="h-px mb-3" style={{ background: "linear-gradient(90deg, transparent, rgba(160,128,48,0.2), transparent)" }} />
            <motion.button
              whileHover={{ scale: 1.01, boxShadow: "0 6px 20px rgba(0,0,0,0.5), 0 0 16px rgba(160,128,48,0.15)" }}
              whileTap={{ scale: 0.99 }}
              onClick={() => { AudioManager.playSfx("gameStart", { volume: 0.85 }); onConfirm(ch.id); }}
              className="relative w-full py-2.5 rounded font-caoshu text-[15px] tracking-[0.3em] flex items-center justify-center gap-2 transition-all overflow-hidden group"
              style={{
                background: "linear-gradient(135deg, rgba(40,30,18,0.9) 0%, rgba(20,14,8,0.9) 50%, rgba(40,30,18,0.9) 100%)",
                border: "1px solid rgba(160,128,48,0.5)",
                color: "#e8dfc8",
              }}
            >
              {/* Corner accents */}
              <span className="absolute top-1 left-1 w-2 h-2 border-t border-l border-[#a08030]/50" />
              <span className="absolute top-1 right-1 w-2 h-2 border-t border-r border-[#a08030]/50" />
              <span className="absolute bottom-1 left-1 w-2 h-2 border-b border-l border-[#a08030]/50" />
              <span className="absolute bottom-1 right-1 w-2 h-2 border-b border-r border-[#a08030]/50" />
              <span className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity" style={{
                background: "linear-gradient(110deg, transparent 30%, rgba(200,160,67,0.1) 50%, transparent 70%)",
              }} />
              <IconScroll size={12} color="#a08030" />
              <span className="relative">以此身入局</span>
            </motion.button>
          </div>

          {/* Bottom gold bar */}
          <div className="h-px" style={{ background: "linear-gradient(90deg, transparent, rgba(160,128,48,0.3), transparent)" }} />
        </div>
      </motion.div>
    </motion.div>
  );
}

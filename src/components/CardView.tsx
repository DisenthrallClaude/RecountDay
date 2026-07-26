import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { CardDef } from "../data/cards";
import { SUIT_SYMBOL } from "../data/cards";
import { cn } from "../utils/cn";

interface Props {
  card?: CardDef;
  faceDown?: boolean;
  size?: "sm" | "md" | "lg" | "xl";
  selected?: boolean;
  disabled?: boolean;
  glow?: boolean;
  onClick?: () => void;
  className?: string;
  tiny?: boolean;
  showTooltip?: boolean;
}

const SIZES: Record<string, { w: string; h: string; fontSize: string }> = {
  sm: { w: "w-14", h: "h-20", fontSize: "9px" },
  md: { w: "w-20", h: "h-28", fontSize: "11px" },
  lg: { w: "w-24", h: "h-[136px]", fontSize: "13px" },
  xl: { w: "w-28", h: "h-40", fontSize: "16px" },
};

const KIND_LABEL: Record<string, string> = { basic: "基本", strategy: "策略", equip: "畸变" };

export default function CardView({ card, faceDown, size = "md", selected, disabled, glow, onClick, className, tiny, showTooltip = true }: Props) {
  const sz = SIZES[size] ?? SIZES.md;
  const [hovered, setHovered] = useState(false);

  // Face-down card (back of card)
  if (faceDown || !card) {
    return (
      <motion.div
        whileHover={onClick ? { y: -6, scale: 1.04 } : undefined}
        className={cn(sz.w, sz.h, "relative rounded-md overflow-hidden", className)}
        onClick={onClick}
        style={{
          background: "linear-gradient(135deg, #2a2218 0%, #1a1410 50%, #0a0806 100%)",
          padding: "1.5px",
          border: "1px solid rgba(160,128,48,0.3)",
          boxShadow: "0 4px 12px rgba(0,0,0,0.6)",
        }}
      >
        <div className="relative w-full h-full bg-[#0a0806] rounded-[3px] overflow-hidden">
          <div className="absolute inset-0 flex items-center justify-center" style={{
            background: "radial-gradient(circle at center, #1a1410 0%, #0a0806 80%)",
          }}>
            <svg viewBox="0 0 60 80" className="w-full h-full opacity-40">
              <rect x="3" y="3" width="54" height="74" fill="none" stroke="#a08030" strokeWidth="0.5" />
              <rect x="6" y="6" width="48" height="68" fill="none" stroke="#a08030" strokeWidth="0.3" />
              <circle cx="30" cy="40" r="14" fill="none" stroke="#a08030" strokeWidth="0.5" />
              <circle cx="30" cy="40" r="9" fill="none" stroke="#a08030" strokeWidth="0.3" />
              <path d="M30 26v28M16 40h28M22 32l16 16M38 32l-16 16" stroke="#a08030" strokeWidth="0.3" />
              <circle cx="30" cy="40" r="2" fill="#a08030" />
              {Array.from({ length: 8 }).map((_, i) => (
                <line key={i} x1="30" y1="14" x2="30" y2="18"
                  transform={`rotate(${i * 45} 30 40)`} stroke="#a08030" strokeWidth="0.4" />
              ))}
            </svg>
          </div>
        </div>
      </motion.div>
    );
  }

  const hasImage = !!card.image;

  return (
    <div
      className={cn("relative", sz.w, sz.h, className)}
      style={{ zIndex: hovered || selected ? 999 : undefined }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: selected ? -18 : 0 }}
        whileHover={disabled ? undefined : { y: -14, scale: 1.08 }}
        transition={{ type: "spring", stiffness: 300, damping: 22 }}
        onClick={disabled ? undefined : onClick}
        className={cn(
          "group relative w-full h-full cursor-pointer select-none",
          disabled && "opacity-50 cursor-not-allowed"
        )}
      >
        {/* Glow halo on hover/select */}
        <div
          className={cn(
            "absolute -inset-[3px] rounded-lg transition-opacity duration-300",
            (selected || glow) ? "opacity-100" : "opacity-0 group-hover:opacity-60"
          )}
          style={{
            background: "radial-gradient(circle, rgba(200,160,67,0.3) 0%, transparent 70%)",
            filter: "blur(4px)",
          }}
        />

        {/* Dark frame */}
        <div className="absolute -inset-[1.5px] rounded-md" style={{
          background: "linear-gradient(135deg, #2a2218 0%, #1a1410 50%, #0a0806 100%)",
          border: "1px solid rgba(160,128,48,0.4)",
        }} />

        {/* Card body */}
        <div className="relative w-full h-full rounded-md overflow-hidden bg-[#0a0806]">
          {hasImage ? (
            <>
              <img
                src={card.image}
                alt={card.name}
                className="absolute inset-0 w-full h-full object-cover"
                draggable={false}
                onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
              />
              {/* Top-left rank+suit */}
              <div className="absolute top-0.5 left-0.5 flex flex-col items-center px-0.5 py-0 rounded-sm" style={{
                background: "rgba(0,0,0,0.65)",
                backdropFilter: "blur(2px)",
              }}>
                <span className="font-cinzel font-bold leading-none text-[#e8dfc8]" style={{ fontSize: tiny ? 8 : sz.fontSize }}>
                  {card.rank}
                </span>
                <span className="text-[#e8dfc8]" style={{ fontSize: tiny ? 8 : sz.fontSize }}>
                  {SUIT_SYMBOL[card.suit]}
                </span>
              </div>
              {/* Bottom-right rank+suit (rotated) */}
              <div className="absolute bottom-0.5 right-0.5 flex flex-col items-center px-0.5 py-0 rounded-sm transform rotate-180" style={{
                background: "rgba(0,0,0,0.65)",
                backdropFilter: "blur(2px)",
              }}>
                <span className="font-cinzel font-bold leading-none text-[#e8dfc8]" style={{ fontSize: tiny ? 8 : sz.fontSize }}>
                  {card.rank}
                </span>
                <span className="text-[#e8dfc8]" style={{ fontSize: tiny ? 8 : sz.fontSize }}>
                  {SUIT_SYMBOL[card.suit]}
                </span>
              </div>
              {/* Bottom name plate */}
              {!tiny && (
                <div className="absolute bottom-0 inset-x-0 px-1 py-0.5 text-center" style={{
                  background: "linear-gradient(180deg, transparent, rgba(0,0,0,0.9))",
                }}>
                  <span className="font-gothic text-[#e8dfc8] tracking-wider" style={{ fontSize: sz.fontSize }}>
                    {card.name}
                  </span>
                </div>
              )}
            </>
          ) : (
            <div className="relative w-full h-full" style={{ background: "linear-gradient(135deg, #1a1612 0%, #0a0806 100%)" }}>
              <div className="absolute inset-0 p-1 flex flex-col justify-between">
                <div className="flex items-center justify-between px-0.5">
                  <span className="font-cinzel font-bold leading-none text-[#e8dfc8]" style={{ fontSize: tiny ? 9 : 12 }}>
                    {card.rank}
                  </span>
                  <span className="text-[#e8dfc8]" style={{ fontSize: tiny ? 9 : 12 }}>{SUIT_SYMBOL[card.suit]}</span>
                </div>
                <div className="flex-1 flex items-center justify-center px-0.5">
                  <span className="font-brush text-center leading-tight text-[#e8dfc8]" style={{ fontSize: tiny ? 11 : size === "xl" ? 20 : 15 }}>
                    {card.name}
                  </span>
                </div>
                {!tiny && (
                  <div className="text-center">
                    <span className="text-[8px] tracking-widest text-[#a08030] font-cinzel">{KIND_LABEL[card.kind]}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Inner border */}
          <div className="absolute inset-0 pointer-events-none rounded-md" style={{
            boxShadow: "inset 0 0 0 1px rgba(160,128,48,0.3)",
          }} />

          {/* Shimmer on hover */}
          <div className="absolute inset-0 shimmer opacity-0 group-hover:opacity-40 pointer-events-none rounded-md" />
        </div>
      </motion.div>

      {/* Tooltip on hover - shows card effect */}
      <AnimatePresence>
        {hovered && showTooltip && !disabled && (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 5, scale: 0.95 }}
            transition={{ duration: 0.2 }}
            className="absolute bottom-full left-1/2 -translate-x-1/2 mb-3 w-52 p-3 rounded-lg pointer-events-none z-[1000]"
            style={{
              background: "#0a0806",
              border: "1px solid rgba(160,128,48,0.5)",
              boxShadow: "0 8px 24px rgba(0,0,0,0.8)",
            }}
          >
            <div className="font-gothic text-[#e8dfc8] text-sm tracking-wider mb-1">{card.name}</div>
            <div className="font-cinzel text-[9px] text-[#a08030] tracking-widest mb-2">{KIND_LABEL[card.kind]}牌</div>
            <p className="text-[10px] text-[#c9b896] leading-relaxed">{card.desc}</p>
            {card.range && (
              <div className="mt-1 text-[9px] text-[#a08030] font-cinzel">射程 {card.range}</div>
            )}
            {/* Tooltip arrow */}
            <div className="absolute top-full left-1/2 -translate-x-1/2 w-2 h-2 rotate-45" style={{
              background: "#0a0806",
              borderRight: "1px solid rgba(160,128,48,0.5)",
              borderBottom: "1px solid rgba(160,128,48,0.5)",
              marginTop: "-4px",
            }} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

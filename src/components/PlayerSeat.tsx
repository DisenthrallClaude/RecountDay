import { motion } from "framer-motion";
import { useGameStore } from "../store/gameStore";
import { getCharacter } from "../data/characters";
import { FACTIONS, CATEGORY_META } from "../data/factions";
import CardView from "./CardView";
import { FactionIcon, IconClose } from "./Icons";

const RANK_LABEL = ["", "一阶", "二阶", "三阶", "四阶"];

// Responsive size helper: uses CSS clamp for viewport-based scaling
const sz = (min: number, preferred: string, max: number) =>
  `clamp(${min}px, ${preferred}, ${max}px)`;

export default function PlayerSeat({ seat }: { seat: number; orientation?: "top" | "left" | "right" }) {
  const player = useGameStore((s) => s.players[seat]);
  const activeSeat = useGameStore((s) => s.activeSeat);
  const pendingTarget = useGameStore((s) => s.pendingTarget);
  const resolveTargetSeats = useGameStore((s) => s.actions.resolveTargetSeats);
  if (!player) return null;
  const ch = getCharacter(player.characterId);
  const isActive = activeSeat === seat;
  const isCandidate = !!pendingTarget?.candidates.includes(seat);
  const faction = player.factionRevealed ? FACTIONS.find((f) => f.id === player.factionId) : null;
  const ratio = Math.max(0, player.fragments / player.maxFragments);
  const catColor = faction ? CATEGORY_META[faction.category].color : "#a08030";

  // Responsive dimensions
  const cardW = sz(150, "13vw", 220);
  const cardH = sz(150, "13vw", 220);
  const portraitW = sz(82, "7.2vw", 124);
  const nameSize = sz(11, "0.85vw", 14);
  const tinySize = sz(7, "0.5vw", 9);
  const badgeSize = sz(7, "0.48vw", 8);
  const barH = sz(5, "0.35vw", 7);
  const handCardW = sz(13, "0.9vw", 18);
  const handCardH = sz(18, "1.3vw", 26);
  const equipTagSize = sz(6, "0.42vw", 8);

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: player.alive ? 1 : 0.55, y: 0 }}
      onClick={() => { if (isCandidate) resolveTargetSeats([seat]); }}
      className={`relative ${isCandidate ? "cursor-pointer" : ""}`}
    >
      {isCandidate && (
        <div className="absolute -inset-2 rounded-lg border-2 border-[#a08030] animate-ping-slow pointer-events-none z-30" />
      )}

      {/* Vertical rectangle card */}
      <motion.div
        whileHover={isCandidate ? { scale: 1.04, y: -3 } : undefined}
        animate={isActive ? { boxShadow: ["0 6px 20px rgba(0,0,0,0.7), 0 0 0px rgba(200,160,67,0)", "0 6px 20px rgba(0,0,0,0.7), 0 0 24px rgba(200,160,67,0.5)", "0 6px 20px rgba(0,0,0,0.7), 0 0 0px rgba(200,160,67,0)"] } : {}}
        transition={isActive ? { duration: 2, repeat: Infinity } : {}}
        className="relative rounded-md overflow-hidden flex"
        style={{
          width: cardW,
          height: cardH,
          background: "#0a0806",
          border: isActive ? "1px solid rgba(200,160,67,0.6)" : "1px solid rgba(160,128,48,0.2)",
          boxShadow: isActive
            ? "0 6px 20px rgba(0,0,0,0.7), 0 0 24px rgba(200,160,67,0.3)"
            : "0 4px 14px rgba(0,0,0,0.6)",
        }}
      >
        {/* Left: Portrait with gold frame */}
        <div className="relative flex-shrink-0" style={{ width: portraitW, height: "100%" }}>
          <div className="relative w-full h-full" style={{
            background: isActive
              ? "linear-gradient(135deg, #c8a043 0%, #a08030 50%, #6a5418 100%)"
              : "linear-gradient(135deg, #2a2218 0%, #1a1410 50%, #0a0806 100%)",
            padding: "2px",
            border: isActive ? "1px solid #c8a043" : "1px solid rgba(160,128,48,0.5)",
            boxShadow: isActive ? "inset 0 0 8px rgba(200,160,67,0.3)" : "none",
            transition: "all 0.4s ease",
          }}>
            <div className="relative w-full h-full bg-[#0a0806] overflow-hidden">
              <img src={ch.portrait} alt={ch.name} className="w-full h-full object-cover" draggable={false} />
              <div className="absolute inset-0" style={{
                background: `linear-gradient(135deg, transparent 50%, ${ch.color}33 100%)`,
              }} />
              {/* Rank badge */}
              <div className="absolute top-0.5 left-0.5 px-1 py-0 rounded-sm font-cinzel text-[#e8dfc8] bg-black/75" style={{ fontSize: badgeSize }}>
                {RANK_LABEL[player.rank]}
              </div>
              {/* Dead overlay */}
              {!player.alive && (
                <div className="absolute inset-0 flex items-center justify-center" style={{ background: "rgba(0,0,0,0.85)" }}>
                  <IconClose size={22} />
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right: Info */}
        <div className="flex-1 p-1.5 flex flex-col justify-between min-w-0">
          <div>
            <div className="font-gothic text-[#e8dfc8] leading-tight tracking-wider truncate" style={{ fontSize: nameSize }}>{ch.name}</div>
            <div className="flex items-center gap-1 mt-0.5">
              {faction ? (
                <>
                  <FactionIcon category={faction.category} size={8} color={catColor} />
                  <span className="font-cinzel tracking-wider truncate" style={{ fontSize: tinySize, color: catColor }}>
                    {faction.name}
                  </span>
                </>
              ) : (
                <span className="font-cinzel text-[#6a5418] tracking-wider" style={{ fontSize: tinySize }}>势力未知</span>
              )}
            </div>
            <div className="font-cinzel text-[#8a7a5c] tracking-widest mt-1" style={{ fontSize: `calc(${tinySize} - 1px)` }}>
              位置 {seat + 1} · {player.isHuman ? "玩家" : "AI"}
            </div>
          </div>

          {/* Fragments bar */}
          <div>
            <div className="flex items-center justify-between mb-0.5">
              <span className="font-cinzel text-[#a08030] tracking-widest" style={{ fontSize: `calc(${tinySize} - 1px)` }}>篇幅</span>
              <span className="font-cinzel text-[#c9b896]" style={{ fontSize: tinySize }}>{player.fragments}/{player.maxFragments}</span>
            </div>
            <div className="w-full rounded-full bg-black/70 border border-[#a08030]/30 overflow-hidden" style={{ height: barH }}>
              <div
                className="h-full transition-all duration-500"
                style={{
                  width: `${ratio * 100}%`,
                  background: // 血条语义：满血=金（安全）→ 中段=琥珀（警戒）→ 低血=血红（危险）。
                    // 原实现是反的：满血鲜红、中血金色，读起来与直觉完全相悖。
                    ratio > 0.5
                    ? "linear-gradient(90deg, #8a6a20, #c8a043)"
                    : ratio > 0.25
                      ? "linear-gradient(90deg, #a05a18, #d08030)"
                      : "linear-gradient(90deg, #5c0d0d, #b83030)",
                }}
              />
            </div>
          </div>
        </div>

        {/* Active turn glow */}
        {isActive && (
          <div className="absolute inset-0 pointer-events-none rounded-md" style={{
            boxShadow: "inset 0 0 12px 2px rgba(200,160,67,0.2)",
          }} />
        )}
      </motion.div>

      {/* Active turn indicator */}
      {isActive && (
        <div
          className="absolute -top-2.5 left-1/2 -translate-x-1/2 px-2.5 py-0.5 rounded-full font-cinzel tracking-widest font-bold whitespace-nowrap"
          style={{
            background: "#0a0806",
            color: "#e8dfc8",
            border: "1px solid #a08030",
            boxShadow: "0 0 10px rgba(200,160,67,0.4)",
            fontSize: sz(8, "0.55vw", 10),
          }}
        >
          ◆ 行动中 ◆
        </div>
      )}

      {/* Hand cards preview */}
      <div className="flex justify-center mt-1.5">
        <div className="flex gap-0.5">
          {player.hand.slice(0, 5).map((_, i) => (
            <div key={i} style={{ width: handCardW, height: handCardH }}>
              <CardView faceDown size="sm" className="!w-full !h-full" showTooltip={false} />
            </div>
          ))}
          {player.hand.length > 5 && (
            <span className="text-[#a08030] font-cinzel self-center ml-0.5" style={{ fontSize: tinySize }}>+{player.hand.length - 5}</span>
          )}
        </div>
      </div>

      {/* Equipments */}
      {(Object.values(player.equips).some(Boolean) || player.judgement.length > 0) && (
        <div className="flex gap-0.5 flex-wrap justify-center mt-1" style={{ maxWidth: cardW }}>
          {Object.values(player.equips).filter(Boolean).map((e) => (
            <span key={e!.uid} title={e!.name} className="px-1 py-0.5 rounded bg-[#0a0806] border border-[#a08030]/30 text-[#c9b896]" style={{ fontSize: equipTagSize }}>
              {e!.name}
            </span>
          ))}
          {player.judgement.map((j) => (
            <span key={j.uid} title={j!.name} className="px-1 py-0.5 rounded bg-[#2a1010] border border-[#8a2020]/50 text-[#e0a0a0]" style={{ fontSize: equipTagSize }}>
              {j.name}
            </span>
          ))}
        </div>
      )}
    </motion.div>
  );
}

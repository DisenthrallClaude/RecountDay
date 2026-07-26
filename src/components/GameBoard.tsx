import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useGameStore } from "../store/gameStore";
import { effectiveSkillCost } from "../store/skills";
import { getCharacter } from "../data/characters";
import { FACTIONS, CATEGORY_META, type FactionCategory } from "../data/factions";
import { seatDistance, attackRange as baseRange } from "../engine/utils";
import PlayerSeat from "./PlayerSeat";
import CardView from "./CardView";
import CharacterAvatar from "./CharacterAvatar";
import { TargetPickerModal, DefenseModal, ChoiceModal, DiscardModal, CardNoticeModal, RulesModal } from "./Modals";
import { playSound } from "./MainMenu";
import BattleEffects from "./BattleEffects";
import CardFlight from "./CardFlight";
import FloatingNotices from "./FloatingNotices";
import PaperBurn from "./PaperBurn";
import { TypeOut } from "./Kit";
import { SEAT_ANCHOR } from "./CardFlight";
import { getDuration, getEffectConfig, type PerfTier } from "./CardEffectConfig";
import { AudioManager } from "../audio/AudioManager";
import {
  IconScales,
  IconScroll,
  IconStar,
  IconExit,
  FactionIcon,
  IconSurrender,
  IconFlame,
  IconBook,
} from "./Icons";
import { assetUrl } from "../utils/assetUrl";

const PHASE_LABEL: Record<string, string> = { recover: "恢复阶段", draw: "审阅阶段", play: "书写阶段", discard: "归档阶段" };
const RANK_LABEL = ["", "一阶", "二阶", "三阶", "四阶"];

// Read performance tier from localStorage rerun_settings (same logic as BattleEffects)
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

export default function GameBoard({ onExit }: { onExit: () => void }) {
  const surrender = useGameStore((s) => s.actions.surrender);
  const players = useGameStore((s) => s.players);
  const activeSeat = useGameStore((s) => s.activeSeat);
  const phase = useGameStore((s) => s.phase);
  const round = useGameStore((s) => s.round);
  const log = useGameStore((s) => s.log);
  const winner = useGameStore((s) => s.winner);
  const actions = useGameStore((s) => s.actions);
  const deckLen = useGameStore((s) => s.deck.length);
  const discardLen = useGameStore((s) => s.discardPile.length);

  const [showLog, setShowLog] = useState(false);
  const [showFaction, setShowFaction] = useState(false);
  const [showRules, setShowRules] = useState(false);
  const [showSurrender, setShowSurrender] = useState(false);
  const [timerPct, setTimerPct] = useState(100);
  const logEndRef = useRef<HTMLDivElement>(null);

  // ===== 阵营揭示仪式 =====
  // 用 (seat, eliminatedRound) 组合作为唯一键，确保每次淘汰都能触发且游戏重置后可再次触发
  const shownRevealsRef = useRef<Set<string>>(new Set());
  const [revealFlashes, setRevealFlashes] = useState<
    { id: string; seat: number; text: string; color: string }[]
  >([]);

  // 公开提示只停留片刻，自动消失
  useEffect(() => {
    if (revealFlashes.length === 0) return;
    const t = window.setTimeout(() => setRevealFlashes((prev) => prev.slice(1)), 2600);
    return () => window.clearTimeout(t);
  }, [revealFlashes]);

  const me = players[0];
  const isMyTurn = activeSeat === 0 && phase === "play" && me?.alive;

  // Game BGM - crossfades from menu BGM automatically
  useEffect(() => {
    AudioManager.playBgm("/audio/bgm-game.mp3", true);
  }, []);

  useEffect(() => {
    if (!isMyTurn) { setTimerPct(100); return; }
    setTimerPct(100);
    const start = Date.now();
    const iv = setInterval(() => {
      const pct = Math.max(0, 100 - ((Date.now() - start) / 45000) * 100);
      setTimerPct(pct);
    }, 200);
    return () => clearInterval(iv);
  }, [isMyTurn, activeSeat]);

  useEffect(() => {
    if (showLog) logEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [log, showLog]);

  // Close the surrender modal on ESC key
  useEffect(() => {
    if (!showSurrender) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setShowSurrender(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [showSurrender]);

  // ===== 阵营公开 =====
  // 这里原本会播放一段 11 秒的全屏卷轴仪式（FactionReveal），期间还锁住操作。
  // 两个问题：
  //   1. 左上角本来就有常驻的「阵营」面板，中途再展开一张卷轴属于重复告知；
  //   2. 一局最多淘汰 3 人 —— 那就是 33 秒被强制观看的过场。
  // 改为轻量提示：座位上方浮出一行公开信息即可。信息本身一点没少，
  // 座位卡在 factionRevealed 后也会直接显示该玩家的阵营。
  useEffect(() => {
    const anyRevealed = players.some((p) => p.factionRevealed);
    if (!anyRevealed) {
      shownRevealsRef.current.clear();
      return;
    }
    players.forEach((p) => {
      if (!p.factionRevealed || p.eliminatedRound === undefined) return;
      const key = `${p.seat}-${p.eliminatedRound}`;
      if (shownRevealsRef.current.has(key)) return;
      shownRevealsRef.current.add(key);
      const fac = FACTIONS.find((f) => f.id === p.factionId);
      if (fac) {
        setRevealFlashes((prev) => [
          ...prev.slice(-3),
          { id: `${key}-${fac.id}`, seat: p.seat, text: `阵营公开 · ${fac.name}`, color: CATEGORY_META[fac.category].color },
        ]);
      }
    });
  }, [players]);


  // Guard: render a fade-out placeholder instead of null to avoid black flashes during exit transitions.
  if (!me) {
    return <div className="absolute inset-0 bg-[#0a0806]" style={{ opacity: 0 }} />;
  }
  const myChar = getCharacter(me.characterId);
  const myFaction = FACTIONS.find((f) => f.id === me.factionId);
  const range = baseRange(me, me.tempFullRange ? 99 : me.tempRangeBonus + (getCharacter(me.characterId).skills.some((sk) => sk.key === "close_range") && me.rank >= 1 ? 1 : 0));

  const bifaCandidates = useMemo(() => {
    if (!isMyTurn) return [];
    return players.filter((o) => o.seat !== 0 && o.alive && seatDistance(me, o) <= range).map((o) => o.seat);
  }, [players, me, range, isMyTurn]);

  const [cardEffects, setCardEffects] = useState<{ id: number; key: string; name: string; fromSeat: number; targetSeats: number[] }[]>([]);
  const effectIdRef = useRef(0);
  const lastEffectIdRef = useRef(0);
  const cardPlayEffect = useGameStore((s) => s.cardPlayEffect);

  // Watch for card play effects from the store (triggers for ALL players including AI)
  useEffect(() => {
    if (cardPlayEffect && cardPlayEffect.id !== lastEffectIdRef.current) {
      lastEffectIdRef.current = cardPlayEffect.id;
      const id = ++effectIdRef.current;
      setCardEffects((prev) => [
        ...prev,
        {
          id,
          key: cardPlayEffect.cardKey,
          name: cardPlayEffect.cardName,
          fromSeat: cardPlayEffect.fromSeat,
          targetSeats: cardPlayEffect.targetSeats ?? [],
        },
      ]);
      // Play sound based on card effect config
      const tier = getPerfTier();
      const soundCfg = getEffectConfig(cardPlayEffect.cardKey)?.sound;
      if (soundCfg) {
        AudioManager.playSfx(soundCfg.sfx, { volume: soundCfg.volume, pitch: soundCfg.pitch });
        if (soundCfg.secondarySfx) {
          setTimeout(() => AudioManager.playSfx(soundCfg.secondarySfx!), 150);
        }
      } else {
        playSound("card");
      }
      // Remove after animation completes (use config-driven duration instead of hardcoded 3800ms)
      const duration = getDuration(cardPlayEffect.cardKey, tier);
      setTimeout(() => {
        setCardEffects(prev => prev.filter(e => e.id !== id));
      }, duration + 200);
    }
  }, [cardPlayEffect]);

  const handleCardClick = (uid: string, key: string) => {
    if (!isMyTurn) return;
    if (key === "liubai" || key === "poti") return;
    if (key === "bifa" && me.usedBifaThisTurn) return;
    actions.playHandCard(uid);
  };

  return (
    <div className="fixed inset-0 overflow-hidden select-none bg-kraft-board">
      {/* Gold scrollbar styling for the battle log chronicle panel */}
      <style>{`
        .battle-log-scroll::-webkit-scrollbar { width: 5px; }
        .battle-log-scroll::-webkit-scrollbar-track { background: rgba(160,128,48,0.08); border-radius: 3px; }
        .battle-log-scroll::-webkit-scrollbar-thumb {
          background: linear-gradient(180deg, #c8a043, #8a6a28);
          border-radius: 3px;
          border: none;
        }
        .battle-log-scroll::-webkit-scrollbar-thumb:hover {
          background: linear-gradient(180deg, #e8c870, #a08030);
        }
        .battle-log-scroll { scrollbar-width: thin; scrollbar-color: #8a6a28 transparent; }
      `}</style>

      {/* Board background — formation mandala image (原图，无任何蒙版) */}
      <div
        className="absolute inset-0"
        style={{
          backgroundImage: `url(${assetUrl("images/formation_bg.jpg")})`,
          backgroundSize: "cover",
          backgroundPosition: "center",
        }}
      />

      {/* Center rotating sigil — refined occult circle */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[640px] h-[640px] opacity-[0.28] pointer-events-none">
        <svg viewBox="0 0 200 200" className="w-full h-full animate-rotate-slow">
          {/* Outer ring with tick marks */}
          <circle cx="100" cy="100" r="96" fill="none" stroke="#a08030" strokeWidth="0.4" />
          <circle cx="100" cy="100" r="90" fill="none" stroke="#a08030" strokeWidth="0.25" />
          {Array.from({ length: 24 }).map((_, i) => (
            <line key={`t${i}`} x1="100" y1="4" x2="100" y2={i % 2 === 0 ? 11 : 7} transform={`rotate(${i * 15} 100 100)`} stroke="#a08030" strokeWidth="0.3" />
          ))}
          {/* Mid ring with geometric pattern */}
          <circle cx="100" cy="100" r="72" fill="none" stroke="#a08030" strokeWidth="0.3" />
          <circle cx="100" cy="100" r="56" fill="none" stroke="#a08030" strokeWidth="0.25" />
          {/* Inner star polygon */}
          {Array.from({ length: 12 }).map((_, i) => (
            <line key={`s${i}`} x1="100" y1="44" x2="100" y2="56" transform={`rotate(${i * 30} 100 100)`} stroke="#a08030" strokeWidth="0.35" />
          ))}
          {/* Core circle + cross */}
          <circle cx="100" cy="100" r="32" fill="none" stroke="#a08030" strokeWidth="0.35" />
          <circle cx="100" cy="100" r="22" fill="none" stroke="#a08030" strokeWidth="0.25" />
          <line x1="100" y1="68" x2="100" y2="132" stroke="#a08030" strokeWidth="0.3" />
          <line x1="68" y1="100" x2="132" y2="100" stroke="#a08030" strokeWidth="0.3" />
          <circle cx="100" cy="100" r="3" fill="#a08030" fillOpacity="0.3" />
        </svg>
        {/* Counter-rotating dashed ring */}
        <svg viewBox="0 0 200 200" className="absolute inset-0 w-full h-full animate-rotate-rev">
          <circle cx="100" cy="100" r="82" fill="none" stroke="#a08030" strokeWidth="0.3" strokeDasharray="1 6" />
          <circle cx="100" cy="100" r="48" fill="none" stroke="#a08030" strokeWidth="0.25" strokeDasharray="0.5 4" />
        </svg>
      </div>

      {/* Candle glow pools at corners — warm flickering light sources */}
      <div className="pointer-events-none absolute inset-0">
        {[
          { x: "4%", y: "16%", size: 120 },
          { x: "94%", y: "18%", size: 110 },
          { x: "6%", y: "80%", size: 100 },
          { x: "93%", y: "77%", size: 120 },
        ].map((pos, i) => (
          <div key={i} className="absolute animate-candle" style={{
            left: pos.x, top: pos.y, width: `${pos.size}px`, height: `${pos.size}px`,
            transform: "translate(-50%, -50%)",
            background: "radial-gradient(circle, rgba(240,200,98,0.12) 0%, rgba(200,150,60,0.05) 40%, transparent 70%)",
            animationDelay: `${i * 0.7}s`,
          }} />
        ))}
      </div>

      {/* Ember particles — fewer, more refined, with varied warmth */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        {Array.from({ length: 12 }).map((_, i) => (
          <span
            key={i}
            className="ember absolute rounded-full"
            style={{
              left: `${(i * 67 + 13) % 100}%`,
              bottom: `${(i * 29) % 45}%`,
              width: i % 3 === 0 ? "2px" : "1px",
              height: i % 3 === 0 ? "2px" : "1px",
              animationDuration: `${7 + (i % 4) * 1.5}s`,
              animationDelay: `${i * 0.5}s`,
              background: i % 4 === 0 ? "#c8a043" : "#a08030",
              ["--dx" as string]: `${(i % 2 ? 1 : -1) * (8 + i * 4)}px`,
              boxShadow: "0 0 5px rgba(200,160,67,0.5)",
            }}
          />
        ))}
      </div>

      {/* ========== Top-left chronicle ========== */}
      <div className="absolute top-3 left-3 z-20 flex flex-col items-start gap-2">
        {/* Chronicle panel — ornate gothic header */}
        <div className="relative rounded-lg overflow-hidden" style={{
          background: "linear-gradient(150deg, rgba(26,20,16,0.92) 0%, rgba(14,10,6,0.88) 100%)",
          border: "1px solid rgba(160,128,48,0.45)",
          boxShadow: "0 6px 20px rgba(0,0,0,0.5), inset 0 1px 0 rgba(240,200,98,0.08), inset 0 0 0 1px rgba(240,200,98,0.04)",
          backdropFilter: "blur(10px)",
        }}>
          {/* Top gold accent line */}
          <div className="h-px" style={{ background: "linear-gradient(90deg, transparent, rgba(200,160,67,0.5) 30%, rgba(200,160,67,0.6) 70%, transparent)" }} />
          <div className="px-3.5 py-2">
            {/* Chronicle title — small caps with ornament */}
            <div className="flex items-center gap-1.5 mb-1">
              <span className="text-[#6a5418] text-[8px]">◆</span>
              <span className="font-cinzel text-[9px] tracking-[0.32em] text-[#8a7a4c]">RECOUNT DAY</span>
              <span className="text-[#6a5418] text-[8px]">◆</span>
            </div>
            <div className="font-cormorant text-[13px] tracking-wide text-[#c9b896] leading-tight">
              残局纪年 · <span className="font-cinzel text-[#a08030] text-[12px]">第 {round} 轮</span>
            </div>
            {/* Divider */}
            <div className="my-1 h-px" style={{ background: "linear-gradient(90deg, rgba(160,128,48,0.35), transparent)" }} />
            {/* Current turn info */}
            <div className="text-[10px] leading-snug text-[#8a7a5c]">
              <span className="font-gothic text-[#e8dfc8] text-[11px] tracking-wider">{getCharacter(players[activeSeat]?.characterId ?? 0).name}</span>
              <span className="text-[#6a5418] mx-1">·</span>
              <span className="font-cormorant italic text-[#a08030]">{PHASE_LABEL[phase]}</span>
            </div>
          </div>
          {/* Bottom accent line */}
          <div className="h-px" style={{ background: "linear-gradient(90deg, transparent, rgba(160,128,48,0.2) 40%, rgba(160,128,48,0.25) 60%, transparent)" }} />
          {/* Corner flourishes */}
          <div className="absolute top-1 left-1 w-2 h-2 pointer-events-none" style={{ borderTop: "1px solid rgba(200,160,67,0.35)", borderLeft: "1px solid rgba(200,160,67,0.35)" }} />
          <div className="absolute bottom-1 right-1 w-2 h-2 pointer-events-none" style={{ borderBottom: "1px solid rgba(200,160,67,0.25)", borderRight: "1px solid rgba(200,160,67,0.25)" }} />
        </div>

        {/* Faction / Log toggle — slim gothic buttons */}
        <div className="flex gap-1.5">
          {[
            { label: "阵营", icon: <IconScales size={12} color={showFaction ? "#e8c870" : "#8a7a4c"} />, onClick: () => { setShowFaction((v) => !v); setShowLog(false); }, active: showFaction },
            { label: "战报", icon: <IconScroll size={12} color={showLog ? "#e8c870" : "#8a7a4c"} />, onClick: () => { setShowLog((v) => !v); setShowFaction(false); }, active: showLog },
          ].map((b) => (
            <button
              key={b.label}
              onClick={b.onClick}
              className="relative flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[9px] font-cinzel tracking-[0.2em] transition-all duration-200 overflow-hidden"
              style={{
                background: b.active ? "linear-gradient(135deg, rgba(42,32,16,0.95), rgba(26,20,14,0.95))" : "rgba(14,10,6,0.82)",
                border: `1px solid ${b.active ? "rgba(200,160,67,0.6)" : "rgba(106,84,24,0.4)"}`,
                color: b.active ? "#e8dfc8" : "#8a7a4c",
                boxShadow: b.active ? "0 0 12px rgba(200,160,67,0.2), inset 0 0 6px rgba(200,160,67,0.06)" : "none",
              }}
            >
              {b.icon}
              <span>{b.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* ========== Top-right info ========== */}
      <div className="absolute top-3 right-3 z-20 flex flex-col items-end gap-2">
        <button
          onClick={onExit}
          className="flex items-center gap-1.5 text-[10px] font-cinzel tracking-[0.15em] rounded-full px-3.5 py-1.5 transition-all duration-200 group"
          style={{
            background: "linear-gradient(135deg, rgba(26,20,16,0.9), rgba(14,10,6,0.85))",
            border: "1px solid rgba(106,84,24,0.45)",
            color: "#8a7a4c",
            backdropFilter: "blur(8px)",
          }}
        >
          <IconExit size={11} color="#8a7a4c" className="transition-colors group-hover:text-[#c9b896]" />
          <span className="transition-colors group-hover:text-[#c9b896]">返回主菜单</span>
        </button>
        {/* Deck info — refined tracker */}
        <div className="flex items-center gap-2 px-3 py-1 rounded-md" style={{
          background: "rgba(14,10,6,0.75)",
          border: "1px solid rgba(106,84,24,0.3)",
          backdropFilter: "blur(6px)",
        }}>
          <div className="flex items-center gap-1">
            <span className="font-cinzel text-[8px] tracking-widest text-[#6a5418]">DECK</span>
            <span className="font-cinzel text-[10px] text-[#c9b896] tabular-nums">{deckLen}</span>
          </div>
          <span className="text-[#3a2a10] text-[8px]">|</span>
          <div className="flex items-center gap-1">
            <span className="font-cinzel text-[8px] tracking-widest text-[#6a5418]">DISCARD</span>
            <span className="font-cinzel text-[10px] text-[#c9b896] tabular-nums">{discardLen}</span>
          </div>
        </div>
      </div>

      {/* ========== Opponent seats — ambient framed with gothic light pools ========== */}
      {/* Seat 2 (top) */}
      <div className="absolute z-20 animate-seat-appear" style={{ top: "52px", left: "50%", transform: "translateX(-50%)" }}>
        <div className="relative">
          {/* Ambient glow behind seat */}
          <div className="absolute -inset-4 pointer-events-none rounded-2xl" style={{
            background: activeSeat === 2
              ? "radial-gradient(ellipse at center, rgba(200,160,67,0.1) 0%, transparent 70%)"
              : "radial-gradient(ellipse at center, rgba(80,60,30,0.06) 0%, transparent 70%)",
          }} />
          <PlayerSeat seat={2} orientation="top" />
        </div>
      </div>
      {/* Seat 3 (left) */}
      <div className="absolute z-20 animate-seat-appear" style={{ top: "300px", left: "16px", animationDelay: "0.1s" }}>
        <div className="relative">
          <div className="absolute -inset-4 pointer-events-none rounded-2xl" style={{
            background: activeSeat === 3
              ? "radial-gradient(ellipse at center, rgba(200,160,67,0.1) 0%, transparent 70%)"
              : "radial-gradient(ellipse at center, rgba(80,60,30,0.06) 0%, transparent 70%)",
          }} />
          <PlayerSeat seat={3} orientation="left" />
        </div>
      </div>
      {/* Seat 1 (right) */}
      <div className="absolute z-20 animate-seat-appear" style={{ top: "300px", right: "16px", animationDelay: "0.2s" }}>
        <div className="relative">
          <div className="absolute -inset-4 pointer-events-none rounded-2xl" style={{
            background: activeSeat === 1
              ? "radial-gradient(ellipse at center, rgba(200,160,67,0.1) 0%, transparent 70%)"
              : "radial-gradient(ellipse at center, rgba(80,60,30,0.06) 0%, transparent 70%)",
          }} />
          <PlayerSeat seat={1} orientation="right" />
        </div>
      </div>

      {/* ========== 左侧法器架：规则 / 投降 ==========
           做成两枚嵌在墙上的铜质圆章，而不是两个方块按钮。
           规则是冷金，投降是暗血 —— 视觉上先分出"查阅"与"了断"的分量差。 */}
      <div className="absolute z-30 flex flex-col gap-3.5" style={{ bottom: "96px", left: "14px" }}>
        {[
          {
            label: "规则", latin: "CODEX", danger: false, active: showRules,
            icon: (c: string) => <IconBook size={17} color={c} />,
            onClick: () => { AudioManager.playSfx("open", { volume: 0.6 }); setShowRules(true); setShowFaction(false); setShowLog(false); },
          },
          {
            label: "投降", latin: "CEDO", danger: true, active: showSurrender,
            icon: (c: string) => <IconSurrender size={17} color={c} />,
            onClick: () => { AudioManager.playSfx("alert", { volume: 0.5 }); setShowSurrender(true); setShowFaction(false); setShowLog(false); },
          },
        ].map((b) => {
          const accent = b.danger ? "#c04030" : "#e8c870";
          const dim = b.danger ? "#7a4a40" : "#8a7a4c";
          const ink = b.active ? accent : dim;
          return (
            <motion.button
              key={b.label}
              onClick={b.onClick}
              whileHover={{ scale: 1.07, x: 2 }}
              whileTap={{ scale: 0.94 }}
              transition={{ type: "spring", stiffness: 420, damping: 24 }}
              className="relative group"
              style={{ width: 52, height: 52 }}
              aria-label={b.label}
            >
              {/* 外圈光晕 */}
              <div
                className="absolute -inset-1.5 rounded-full pointer-events-none transition-opacity duration-300"
                style={{
                  background: `radial-gradient(circle, ${accent}22 0%, transparent 68%)`,
                  opacity: b.active ? 1 : 0,
                }}
              />
              {/* 铜章底盘 */}
              <div
                className="absolute inset-0 rounded-full transition-all duration-300"
                style={{
                  background: b.danger
                    ? "radial-gradient(circle at 34% 26%, #3a1410 0%, #200a08 58%, #0e0504 100%)"
                    : "radial-gradient(circle at 34% 26%, #3a2e16 0%, #201808 58%, #0c0904 100%)",
                  border: `1px solid ${b.active ? `${accent}88` : "rgba(90,70,28,0.4)"}`,
                  boxShadow: b.active
                    ? `0 0 18px ${accent}30, inset 0 1px 0 ${accent}30, inset 0 -6px 12px rgba(0,0,0,0.6)`
                    : "0 4px 12px rgba(0,0,0,0.55), inset 0 1px 0 rgba(200,160,67,0.1), inset 0 -6px 12px rgba(0,0,0,0.5)",
                }}
              />
              {/* 刻痕环 */}
              <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 52 52">
                <circle cx="26" cy="26" r="22.5" fill="none" stroke={ink} strokeWidth="0.5" strokeOpacity={b.active ? 0.55 : 0.25} />
                <circle cx="26" cy="26" r="19" fill="none" stroke={ink} strokeWidth="0.35" strokeOpacity={b.active ? 0.3 : 0.14} strokeDasharray="1 3" />
                {Array.from({ length: 12 }).map((_, i) => (
                  <line
                    key={i} x1="26" y1="2.4" x2="26" y2={i % 3 === 0 ? 6.2 : 4.4}
                    transform={`rotate(${i * 30} 26 26)`}
                    stroke={ink} strokeWidth="0.6" strokeOpacity={b.active ? 0.5 : 0.2}
                  />
                ))}
              </svg>
              {/* 激活时缓慢自转的外环 */}
              {b.active && (
                <motion.svg
                  className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 52 52"
                  animate={{ rotate: 360 }}
                  transition={{ duration: b.danger ? 18 : 26, repeat: Infinity, ease: "linear" }}
                >
                  <circle cx="26" cy="26" r="24.6" fill="none" stroke={accent} strokeWidth="0.7" strokeOpacity="0.5" strokeDasharray="3 7" />
                </motion.svg>
              )}
              {/* 图标 */}
              <div
                className="relative w-full h-full flex items-center justify-center transition-transform duration-300 group-hover:scale-110"
                style={{ filter: b.active ? `drop-shadow(0 0 5px ${accent}70)` : "none" }}
              >
                {b.icon(ink)}
              </div>
              {/* 悬停时向右滑出的铭牌 */}
              <div
                className="absolute left-full top-1/2 -translate-y-1/2 ml-2 px-2.5 py-1 rounded-sm whitespace-nowrap pointer-events-none
                           opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-250"
                style={{
                  background: "linear-gradient(150deg, rgba(24,18,12,0.97), rgba(10,7,4,0.97))",
                  border: `1px solid ${accent}44`,
                  boxShadow: "0 6px 18px rgba(0,0,0,0.65)",
                }}
              >
                <div className="text-[11px] tracking-[0.2em]" style={{ color: b.danger ? "#d08070" : "#e8dfc8" }}>{b.label}</div>
                <div className="font-cinzel text-[7px] tracking-[0.34em]" style={{ color: dim }}>{b.latin}</div>
              </div>
            </motion.button>
          );
        })}
      </div>

      {/* ========== Faction info panel - torn parchment with calligraphy, auto-burns after 10s ========== */}
      <AnimatePresence>
        {showFaction && myFaction && (
          <FactionParchment
            factionName={myFaction.name}
            factionCategory={myFaction.category}
            winCondition={myFaction.win}
            quote={myFaction.quote}
            onClose={() => setShowFaction(false)}
          />
        )}
      </AnimatePresence>

      {/* ========== Log panel — gothic chronicle scroll with time flow ========== */}
      <AnimatePresence>
        {showLog && (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ duration: 0.25, ease: [0.22, 0.85, 0.3, 1] }}
            className="absolute z-30 flex flex-col rounded-lg overflow-hidden"
            style={{
              left: "12px", top: "96px", bottom: "156px", width: "300px",
              background: "linear-gradient(155deg, rgba(26,20,16,0.97) 0%, rgba(14,10,6,0.96) 100%)",
              border: "1px solid rgba(160,128,48,0.4)",
              boxShadow: "0 12px 40px rgba(0,0,0,0.7), inset 0 1px 0 rgba(200,160,67,0.06), inset 0 0 0 1px rgba(200,160,67,0.03)",
              backdropFilter: "blur(16px)",
            }}
          >
            {/* Top accent line */}
            <div className="h-px flex-shrink-0" style={{ background: "linear-gradient(90deg, transparent, rgba(200,160,67,0.45) 30%, rgba(200,160,67,0.5) 70%, transparent)" }} />

            {/* Header — refined typography */}
            <div className="flex items-center justify-between px-3.5 py-2.5 flex-shrink-0">
              <div className="flex items-center gap-2">
                <IconScroll size={13} color="#8a7a4c" />
                <div className="flex flex-col">
                  <span className="font-cinzel text-[10px] tracking-[0.35em] text-[#c9b896]">CHRONICLE</span>
                  <span className="font-cormorant text-[9px] italic text-[#6a5418] -mt-0.5">战报录</span>
                </div>
              </div>
              <div className="flex flex-col items-end gap-1">
                {/* Turn / round counter */}
                <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full" style={{ background: "rgba(160,128,48,0.12)", border: "1px solid rgba(160,128,48,0.3)" }}>
                  <span className="font-cinzel text-[8px] tracking-wider text-[#8a7a4c]">回合</span>
                  <span className="font-cinzel text-[11px] text-[#c8a043] tabular-nums leading-none">{round}</span>
                </div>
                <span className="font-cinzel text-[8px] text-[#6a5418] tabular-nums">{log.length} entries</span>
              </div>
            </div>
            <div className="h-px mx-3.5 flex-shrink-0" style={{ background: "linear-gradient(90deg, transparent, rgba(160,128,48,0.25), transparent)" }} />

            {/* Log entries — refined hierarchy */}
            <div className="flex-1 overflow-y-auto px-3 py-2.5 space-y-1.5 battle-log-scroll">
              {log.length === 0 && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.15 }} className="text-center font-cormorant text-[12px] italic py-8 text-[#4a3a20]">
                  战局未开，静待肇始……
                </motion.div>
              )}
              {log.map((l, i) => {
                const isLast = i === log.length - 1;
                const meta = (() => {
                  switch (l.kind) {
                    case "damage": return { color: "#d08070", bar: "#9c3030", icon: "✕", glow: "rgba(180,60,50,0.3)" };
                    case "heal":   return { color: "#90b878", bar: "#4a7030", icon: "✚", glow: "rgba(100,160,60,0.25)" };
                    case "win":    return { color: "#e8c870", bar: "#c8a030", icon: "★", glow: "rgba(200,160,67,0.4)" };
                    case "skill":  return { color: "#a888c0", bar: "#704890", icon: "✦", glow: "rgba(140,90,180,0.25)" };
                    case "card":   return { color: "#c9b896", bar: "#8a6a30", icon: "◈", glow: "rgba(160,128,48,0.2)" };
                    default:       return { color: "#8a7a5c", bar: "#5a4818", icon: "·", glow: "none" };
                  }
                })();
                return (
                  <motion.div
                    key={l.id}
                    initial={isLast ? { opacity: 0, x: 6 } : false}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.3, ease: "easeOut" }}
                    className="flex items-start gap-2 text-[11px] leading-relaxed py-1 px-1.5 rounded-sm"
                    style={{
                      color: meta.color,
                      background: isLast ? `${meta.bar}12` : "transparent",
                      borderLeft: `2px solid ${meta.bar}${isLast ? "cc" : "60"}`,
                    }}
                  >
                    <span className="flex-shrink-0 text-[9px] w-3 text-center mt-0.5 font-cinzel" style={{ color: meta.bar, textShadow: isLast ? `0 0 4px ${meta.glow}` : "none" }}>{meta.icon}</span>
                    <span className="relative flex-1" style={{
                      fontWeight: l.kind === "win" ? 500 : 400,
                      textShadow: l.kind === "win" ? "0 0 6px rgba(200,160,67,0.3)" : "none",
                    }}>
                      {l.text}
                      {/* 最新一条上掠过一道墨色横扫：这一行是"刚被写上去的" */}
                      {isLast && (
                        <motion.span
                          className="pointer-events-none absolute inset-y-0 -inset-x-1"
                          initial={{ opacity: 0.85, x: "-104%" }}
                          animate={{ opacity: 0, x: "104%" }}
                          transition={{ duration: 0.72, ease: "easeOut" }}
                          style={{ background: `linear-gradient(90deg, transparent, ${meta.bar}66, transparent)` }}
                        />
                      )}
                    </span>
                  </motion.div>
                );
              })}
              <div ref={logEndRef} />
            </div>

            {/* Bottom accent line */}
            <div className="h-px flex-shrink-0" style={{ background: "linear-gradient(90deg, transparent, rgba(160,128,48,0.2), transparent)" }} />

            {/* Corner flourishes */}
            <div className="absolute top-0 left-0 w-2.5 h-2.5 pointer-events-none" style={{ borderTop: "1px solid rgba(200,160,67,0.35)", borderLeft: "1px solid rgba(200,160,67,0.35)" }} />
            <div className="absolute top-0 right-0 w-2.5 h-2.5 pointer-events-none" style={{ borderTop: "1px solid rgba(200,160,67,0.35)", borderRight: "1px solid rgba(200,160,67,0.35)" }} />
            <div className="absolute bottom-0 left-0 w-2.5 h-2.5 pointer-events-none" style={{ borderBottom: "1px solid rgba(200,160,67,0.2)", borderLeft: "1px solid rgba(200,160,67,0.2)" }} />
            <div className="absolute bottom-0 right-0 w-2.5 h-2.5 pointer-events-none" style={{ borderBottom: "1px solid rgba(200,160,67,0.2)", borderRight: "1px solid rgba(200,160,67,0.2)" }} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* ========== Self panel (bottom-right) — gothic portrait console ========== */}
      <div
        className="absolute z-20 animate-seat-appear"
        style={{
          bottom: "clamp(50px, 5vh, 90px)",
          right: "clamp(20px, 4vw, 70px)",
          width: "clamp(168px, 14vw, 230px)",
          animationDelay: "0.3s",
          background: "linear-gradient(155deg, rgba(28,22,16,0.96) 0%, rgba(14,10,6,0.94) 100%)",
          borderRadius: "10px",
          border: "1px solid rgba(160,128,48,0.38)",
          boxShadow: "0 8px 28px rgba(0,0,0,0.55), inset 0 1px 0 rgba(200,160,67,0.06), inset 0 0 0 1px rgba(200,160,67,0.03)",
          backdropFilter: "blur(12px)",
          overflow: "hidden",
        }}
      >
        {/* Top accent line */}
        <div className="h-px" style={{ background: "linear-gradient(90deg, transparent, rgba(200,160,67,0.4) 25%, rgba(200,160,67,0.5) 50%, rgba(200,160,67,0.4) 75%, transparent)" }} />
        {/* Corner flourishes */}
        <div className="absolute top-1 left-1 w-2.5 h-2.5 pointer-events-none" style={{ borderTop: "1px solid rgba(200,160,67,0.25)", borderLeft: "1px solid rgba(200,160,67,0.25)" }} />
        <div className="absolute top-1 right-1 w-2.5 h-2.5 pointer-events-none" style={{ borderTop: "1px solid rgba(200,160,67,0.25)", borderRight: "1px solid rgba(200,160,67,0.25)" }} />

        <div className="p-2.5">
        {/* Header: portrait + name + fragments */}
        <div className="flex items-start gap-2">
          <div
            className={`rounded-md overflow-hidden border flex-shrink-0 relative ${activeSeat === 0 ? "animate-turn-glow" : ""}`}
            style={{
              width: "clamp(58px, 5vw, 82px)",
              aspectRatio: "9/16",
              padding: "1px",
              background: activeSeat === 0 ? "linear-gradient(135deg, rgba(200,160,67,0.8), rgba(160,128,48,0.6))" : "linear-gradient(135deg, rgba(120,96,40,0.5), rgba(80,64,24,0.4))",
              borderColor: activeSeat === 0 ? "rgba(200,160,67,0.7)" : "rgba(90,70,28,0.4)",
              boxShadow: activeSeat === 0 ? "0 0 10px rgba(200,160,67,0.3)" : "0 2px 6px rgba(0,0,0,0.5)",
            }}
          >
            <CharacterAvatar ch={myChar} className="w-full h-full" shape="rounded" />
          </div>
          <div className="flex-1 min-w-0 pt-0.5">
            <div className="flex items-center justify-between gap-1">
              <span className="font-gothic text-[#e8dfc8] tracking-wider truncate" style={{ fontSize: "clamp(12px, 1vw, 15px)", textShadow: "0 0 6px rgba(200,160,67,0.1)" }}>{myChar.name}</span>
              <span
                className="font-cinzel px-1.5 py-0.5 rounded flex-shrink-0"
                style={{ fontSize: "clamp(7px, 0.5vw, 9px)", color: "#e8c870", background: "rgba(160,128,48,0.12)", border: "1px solid rgba(200,160,67,0.25)" }}
              >
                {RANK_LABEL[me.rank]}
              </span>
            </div>
            <div className="font-cinzel tracking-wider mt-0.5" style={{ fontSize: "clamp(7px, 0.5vw, 9px)", color: myFaction ? CATEGORY_META[myFaction.category].color : "#8a7a4c" }}>
              {myFaction ? myFaction.name : ""}
            </div>
            {/* Fragments bar — blood ink meter */}
            <div className="w-full rounded-full overflow-hidden mt-1.5 relative" style={{ height: "clamp(5px, 0.4vh, 7px)", background: "rgba(8,6,3,0.8)", border: "1px solid rgba(100,76,28,0.35)" }}>
              <div
                className="h-full transition-all duration-500 relative"
                style={{
                  width: `${(me.fragments / me.maxFragments) * 100}%`,
                  background: "linear-gradient(90deg, #6a1818, #a02828, #c64040)",
                  boxShadow: "0 0 5px rgba(160,40,40,0.35)",
                }}
              >
                <div className="absolute inset-0" style={{ background: "linear-gradient(90deg, transparent, rgba(255,220,200,0.12), transparent)" }} />
              </div>
            </div>
            <div className="text-[#8a7a4c] mt-1 font-cinzel tracking-wide flex items-center gap-1.5" style={{ fontSize: "clamp(7px, 0.5vw, 9px)" }}>
              <span>篇幅 <span className="text-[#c9b896] tabular-nums">{me.fragments}/{me.maxFragments}</span></span>
              <span className="text-[#3a2a10]">·</span>
              <span>射程 <span className="text-[#c9b896] tabular-nums">{range >= 90 ? "∞" : range}</span></span>
            </div>
          </div>
        </div>
        {/* Divider */}
        <div className="my-2 h-px" style={{ background: "linear-gradient(90deg, transparent, rgba(160,128,48,0.2), transparent)" }} />
        {/* Skills — refined gothic buttons */}
        <div className="flex flex-col gap-1">
          {myChar.skills.map((sk) => {
            const unlocked = me.rank >= sk.rankReq;
            // 用与后端完全相同的口径计算消耗，避免出现"按钮亮着、点下去把自己扣死"。
            // 旧逻辑在 1 篇幅时把任何技能都视作可用，而红尘余波的减免其实从未实现。
            const cost = effectiveSkillCost(me, sk.cost);
            const affordable = cost === 0 || me.fragments > cost;
            const isPassive = sk.type === "被动" || sk.type === "触发式被动";
            const usedThisTurn = (me.skillUses[sk.key] ?? 0) >= 1;
            const disabled =
              !isMyTurn || !unlocked || !affordable || isPassive || usedThisTurn ||
              me.overloadActiveThisTurn || !!me.statusFlags["cannot_skill"];
            return (
              <button
                key={sk.key}
                title={sk.desc}
                disabled={disabled}
                onClick={() => actions.useSkill(sk.key)}
                className="text-left px-2 py-1 rounded-md transition-all group relative overflow-hidden"
                style={{
                  fontSize: "clamp(9px, 0.65vw, 11px)",
                  background: disabled ? "rgba(8,6,3,0.4)" : "rgba(10,8,4,0.6)",
                  border: `1px solid ${disabled ? "rgba(74,56,24,0.2)" : "rgba(160,128,48,0.3)"}`,
                }}
              >
                {!disabled && (
                  <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity" style={{ background: "linear-gradient(90deg, transparent, rgba(200,160,67,0.06), transparent)" }} />
                )}
                <div className="flex justify-between items-center relative">
                  <span className="font-gothic transition-colors truncate mr-1" style={{ color: disabled ? "#4a3a20" : "#c9b896" }}>
                    {sk.name}
                  </span>
                  <span
                    className="font-cinzel flex-shrink-0"
                    style={{ fontSize: "clamp(7px, 0.5vw, 9px)", color: disabled ? "#3a2a10" : sk.type === "被动" ? "#6a5a3c" : "#8a7a4c" }}
                  >
                    {isPassive ? sk.type : `${cost}墨·${RANK_LABEL[sk.rankReq]}`}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
        {/* Equips & judgement tags */}
        {(Object.values(me.equips).some(Boolean) || me.judgement.length > 0) && (
          <div className="mt-1.5 flex flex-wrap gap-0.5">
            {Object.values(me.equips).filter(Boolean).map((e) => (
              <span key={e!.uid} title={e!.desc} className="text-[7px] px-1 py-0.5 rounded font-cinzel" style={{ background: "rgba(10,8,4,0.7)", border: "1px solid rgba(160,128,48,0.35)", color: "#8a7a4c" }}>{e!.name}</span>
            ))}
            {me.judgement.map((j) => (
              <span key={j.uid} className="text-[7px] px-1 py-0.5 rounded font-cinzel" style={{ background: "rgba(40,12,12,0.7)", border: "1px solid rgba(140,40,40,0.4)", color: "#c08070" }}>{j.name}</span>
            ))}
          </div>
        )}
        </div>
        {/* Bottom accent line */}
        <div className="h-px" style={{ background: "linear-gradient(90deg, transparent, rgba(160,128,48,0.2) 30%, rgba(160,128,48,0.25) 50%, rgba(160,128,48,0.2) 70%, transparent)" }} />
      </div>

      {/* ========== Center controls: confirm/cancel + turn timer ========== */}
      <div className="absolute z-20 flex flex-col items-center gap-2.5" style={{ bottom: "200px", left: "50%", transform: "translateX(-50%)" }}>
        <div className="flex gap-3">
          {/* Confirm button — gothic seal style */}
          <button
            onClick={() => actions.endPlayPhase()}
            disabled={!isMyTurn}
            className="gold-btn px-7 py-2.5 rounded-full font-cinzel text-[13px] tracking-wider disabled:opacity-25 flex items-center gap-2 transition-transform hover:scale-105"
          >
            <IconStar size={12} color="#e8c870" />
            <span>结束回合</span>
          </button>
          {/* Cancel button — subdued gothic */}
          <button
            onClick={() => {}}
            className="px-7 py-2.5 rounded-full font-cinzel text-[13px] tracking-wider flex items-center gap-2 transition-all hover:scale-105"
            style={{
              background: "rgba(14,10,6,0.7)",
              border: "1px solid rgba(106,84,24,0.4)",
              color: "#8a7a4c",
              backdropFilter: "blur(6px)",
            }}
          >
            <IconExit size={12} color="#8a7a4c" />
            <span>取消</span>
          </button>
        </div>
        {/* Timer — slim gothic hourglass bar */}
        <div className="flex items-center gap-2">
          <span className="font-cinzel text-[8px] tracking-widest text-[#5a4818]">TURN</span>
          <div className="w-72 h-1.5 rounded-full overflow-hidden relative" style={{ background: "rgba(8,6,3,0.8)", border: "1px solid rgba(100,76,28,0.3)" }}>
            <motion.div
              className="h-full relative"
              style={{
                background: timerPct < 25
                  ? "linear-gradient(90deg, #8a2020, #c04040)"
                  : "linear-gradient(90deg, #6a5418, #a08030, #c8a040)",
                boxShadow: timerPct < 25 ? "0 0 6px rgba(180,50,50,0.4)" : "0 0 4px rgba(160,128,48,0.25)",
              }}
              animate={{ width: `${timerPct}%` }}
              transition={{ ease: "linear" }}
            >
              <div className="absolute inset-0" style={{ background: "linear-gradient(90deg, transparent, rgba(255,240,200,0.12), transparent)" }} />
            </motion.div>
          </div>
        </div>
      </div>

      {/* ========== Hand cards — bottom shelf with ambient grounding ========== */}
      {/* Subtle glow platform beneath hand cards */}
      <div className="absolute pointer-events-none z-[58]" style={{
        bottom: "0px", left: "50%", transform: "translateX(-50%)",
        width: "70vw", height: "140px",
        background: "radial-gradient(ellipse at 50% 100%, rgba(120,90,40,0.06) 0%, transparent 70%)",
      }} />
      <div className="absolute z-[60] flex items-end gap-1.5 max-w-[90vw] overflow-visible px-4 py-2" style={{ bottom: "4px", left: "50%", transform: "translateX(-50%)" }}>
        {me.hand.map((c) => {
          const disabled = !isMyTurn || (c.key === "bifa" && (me.usedBifaThisTurn || bifaCandidates.length === 0)) || c.key === "liubai" || c.key === "poti";
          return (
            <CardView
              key={c.uid}
              card={c}
              size="lg"
              disabled={disabled}
              onClick={() => handleCardClick(c.uid, c.key)}
            />
          );
        })}
        {me.hand.length === 0 && <div className="text-xs text-[#5a4818] font-cormorant italic py-6">手牌已空</div>}
      </div>
      <div className="absolute z-20 text-[9px] font-cinzel text-[#5a4818] tracking-widest" style={{ bottom: "2px", right: "14px" }}>
        HAND <span className="text-[#8a7a4c] tabular-nums">{me.hand.length}</span>/{me.maxFragments}
      </div>

      {/* Card play effects - card flies from player position to center, triggers BattleEffects VFX */}
      <div className="absolute inset-0 pointer-events-none z-[55]">
        <AnimatePresence>
          {cardEffects.map((eff) => (
            <CardFlight
              key={eff.id}
              cardKey={eff.key}
              fromSeat={eff.fromSeat}
              targetSeats={eff.targetSeats}
              perfTier={getPerfTier()}
            />
          ))}
        </AnimatePresence>
      </div>

      {/* Battle effects - reactive VFX driven by game logs */}
      <BattleEffects />

      {/* 关键判定的浮动提示（破题/免疫/抵消）—— 让它们不再只存在于战报里 */}
      <FloatingNotices />

      {/* 阵营公开：座位上方一行短提示，取代原本 11 秒的全屏卷轴仪式 */}
      <div className="absolute inset-0 pointer-events-none z-[72]">
        <AnimatePresence>
          {revealFlashes.map((f) => {
            const pos = SEAT_ANCHOR[f.seat] ?? { x: 50, y: 50 };
            return (
              <motion.div
                key={f.id}
                className="absolute"
                style={{ left: `${pos.x}%`, top: `${pos.y}%` }}
                initial={{ opacity: 0, y: 8, scale: 0.86, x: "-50%" }}
                animate={{ opacity: 1, y: -92, scale: 1, x: "-50%" }}
                exit={{ opacity: 0, y: -110, x: "-50%" }}
                transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
              >
                <div
                  className="px-3 py-1.5 rounded-[3px] whitespace-nowrap"
                  style={{
                    background: "linear-gradient(150deg, rgba(22,17,12,0.96), rgba(9,7,5,0.96))",
                    border: `1px solid ${f.color}88`,
                    boxShadow: `0 6px 22px rgba(0,0,0,0.75), 0 0 20px ${f.color}33`,
                  }}
                >
                  <span className="text-[12px] tracking-[0.16em]" style={{ color: f.color }}>
                    {f.text}
                  </span>
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>

      <TargetPickerModal />
      <DefenseModal />
      <ChoiceModal />
      <CardNoticeModal />
      <DiscardModal />

      {showRules && <RulesModal onClose={() => setShowRules(false)} />}

      {/* ========== 投降：封笔仪式 ==========
           不是一个"你确定吗"对话框，而是一次有仪式感的了断 ——
           断裂的笔、渗开的血墨、需要按住才能完成的确认。
           投降是不可逆的，交互上就该有相应的重量。 */}
      <AnimatePresence>
        {showSurrender && (
          <motion.div
            key="surrender"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.28 }}
            className="absolute inset-0 z-50 flex items-center justify-center p-4"
            style={{ background: "rgba(4,2,2,0.82)", backdropFilter: "blur(6px)" }}
            onClick={() => setShowSurrender(false)}
          >
            {/* 自下而上的血色渗透 */}
            <motion.div
              className="absolute inset-0 pointer-events-none"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.9 }}
              style={{ background: "radial-gradient(ellipse at 50% 118%, rgba(122,20,16,0.34), transparent 62%)" }}
            />

            <motion.div
              onClick={(e) => e.stopPropagation()}
              initial={{ opacity: 0, scale: 0.9, y: 24, rotateX: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0, rotateX: 0 }}
              exit={{ opacity: 0, scale: 0.93, y: 12 }}
              transition={{ type: "spring", stiffness: 250, damping: 24 }}
              className="relative rounded-md overflow-hidden"
              style={{
                width: 340,
                maxWidth: "calc(100vw - 2rem)",
                background: "linear-gradient(158deg, #241210 0%, #170a08 52%, #0c0504 100%)",
                border: "1px solid rgba(140,44,32,0.45)",
                boxShadow: "0 30px 76px rgba(0,0,0,0.9), 0 0 44px rgba(122,20,16,0.14), inset 0 1px 0 rgba(220,120,90,0.1)",
              }}
            >
              <div className="h-px" style={{ background: "linear-gradient(90deg, transparent, rgba(200,70,50,0.65) 30%, rgba(200,70,50,0.8) 50%, rgba(200,70,50,0.65) 70%, transparent)" }} />

              {/* 纸纹 */}
              <div
                className="absolute inset-0 pointer-events-none mix-blend-overlay opacity-[0.14]"
                style={{
                  backgroundImage:
                    "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='240' height='240'%3E%3Cfilter id='s'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4'/%3E%3C/filter%3E%3Crect width='240' height='240' filter='url(%23s)'/%3E%3C/svg%3E\")",
                }}
              />

              <div className="relative px-7 pt-7 pb-6 text-center">
                {/* 断裂的笔 */}
                <div className="flex justify-center mb-4">
                  <motion.svg
                    width="62" height="62" viewBox="0 0 62 62" fill="none"
                    initial={{ rotate: -8, opacity: 0 }}
                    animate={{ rotate: 0, opacity: 1 }}
                    transition={{ delay: 0.1, type: "spring", stiffness: 200, damping: 16 }}
                    style={{ filter: "drop-shadow(0 0 12px rgba(160,40,30,0.35))" }}
                  >
                    {/* 上半截 */}
                    <motion.g
                      initial={{ x: 0, y: 0, rotate: 0 }}
                      animate={{ x: -3.5, y: -2, rotate: -11 }}
                      transition={{ delay: 0.42, duration: 0.42, ease: [0.2, 1.4, 0.4, 1] }}
                      style={{ transformOrigin: "31px 31px" }}
                    >
                      <path d="M20 42 L36 14 L41 17 L25 45 Z" fill="#2a1a14" stroke="#8a5040" strokeWidth="1" />
                      <path d="M36 14 L41 17 L39.5 10 Z" fill="#6a3a28" />
                    </motion.g>
                    {/* 下半截 */}
                    <motion.g
                      initial={{ x: 0, y: 0, rotate: 0 }}
                      animate={{ x: 3.5, y: 2.5, rotate: 13 }}
                      transition={{ delay: 0.42, duration: 0.42, ease: [0.2, 1.4, 0.4, 1] }}
                      style={{ transformOrigin: "31px 31px" }}
                    >
                      <path d="M18 46 L25 45 L21 52 Z" fill="#2a1a14" stroke="#8a5040" strokeWidth="1" />
                    </motion.g>
                    {/* 断口迸溅的墨点 */}
                    {[[27, 34, 2.1], [35, 30, 1.5], [23, 39, 1.2], [38, 36, 1.7]].map(([cx, cy, r], i) => (
                      <motion.circle
                        key={i} cx={cx} cy={cy} r={r} fill="#9c2020"
                        initial={{ opacity: 0, scale: 0 }}
                        animate={{ opacity: [0, 0.95, 0.55], scale: 1 }}
                        transition={{ delay: 0.55 + i * 0.05, duration: 0.5 }}
                      />
                    ))}
                  </motion.svg>
                </div>

                <div className="font-caoshu text-[#d8c8b0] text-[30px] tracking-[0.3em] leading-none" style={{ textShadow: "0 0 16px rgba(140,40,30,0.28)" }}>
                  封笔
                </div>
                <div className="font-cinzel text-[8px] tracking-[0.48em] text-[#7a4a3a] mt-2">CAPITVLATIO</div>

                <div className="mx-auto w-20 h-px my-4" style={{ background: "linear-gradient(90deg, transparent, rgba(140,60,44,0.55), transparent)" }} />

                <p className="font-brush text-[13.5px] leading-[1.95] text-[#a89078] px-1">
                  就此收笔，你的篇章将停在这一页。<br />
                  余下的叙事者会替你写完结局。
                </p>

                <div className="flex gap-2.5 mt-6">
                  <button
                    onClick={() => { AudioManager.playSfx("click", { volume: 0.6 }); setShowSurrender(false); }}
                    className="flex-1 py-2.5 rounded-sm text-[12px] tracking-[0.22em] transition-all hover:scale-[1.03] active:scale-95"
                    style={{ background: "linear-gradient(180deg, rgba(38,30,18,0.9), rgba(20,14,8,0.9))", border: "1px solid rgba(160,128,48,0.45)", color: "#c9b896" }}
                  >
                    继续执笔
                  </button>
                  <HoldToSurrender
                    onComplete={() => {
                      AudioManager.playSfx("discard", { volume: 0.9 });
                      setShowSurrender(false);
                      surrender();
                    }}
                  />
                </div>
                <div className="font-cinzel text-[7.5px] tracking-[0.28em] text-[#5a3228] mt-2.5">长按以确认 · HOLD TO CONFIRM</div>
              </div>

              <div className="h-px" style={{ background: "linear-gradient(90deg, transparent, rgba(140,44,32,0.32), transparent)" }} />
              {[
                "top-0 left-0 border-t border-l",
                "top-0 right-0 border-t border-r",
                "bottom-0 left-0 border-b border-l",
                "bottom-0 right-0 border-b border-r",
              ].map((cls, i) => (
                <div key={i} className={`absolute w-6 h-6 pointer-events-none border-[#8a2c20]/50 ${cls}`} />
              ))}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {winner && <WinnerScreen onExit={onExit} />}

    </div>
  );
}

/* ──────────────────────────────────────────────
   Gothic Arch Card — merged single frame with
   multi-spike line-based top & bottom, low-freq glitch
   ────────────────────────────────────────────── */

function GothicArchCard({
  portrait,
  name,
  rank,
  isWinner,
  delay,
  stats,
  scale = 1,
}: {
  portrait: string;
  name: string;
  rank: number;
  isWinner: boolean;
  color: { primary: string; bright: string; glow: string; dim: string };
  delay: number;
  stats?: { kills: number; heals: number };
  scale?: number;
}) {
  const VW = 200;
  const VH = 520;

  const tint = isWinner ? "#f5d878" : "#d44848";
  const tintRgb = isWinner ? "245,216,120" : "212,72,72";
  const gold = "#c8a043";
  const goldBright = "#e8c870";

  // Three smooth Gothic arch frames, evenly spaced, merged for layered look
  // Outer frame
  const frameOuter = `
    M 100,2
    C 104,8 110,14 120,18
    C 150,32 178,60 178,110
    L 178,410
    C 178,460 150,488 120,502
    C 110,506 104,512 100,518
    C 96,512 90,506 80,502
    C 50,488 22,460 22,410
    L 22,110
    C 22,60 50,32 80,18
    C 90,14 96,8 100,2
    Z
  `;
  // Middle frame — evenly between outer & inner
  const frameMiddle = `
    M 100,8
    C 103,12 108,16 116,20
    C 144,33 170,60 170,110
    L 170,410
    C 170,458 144,485 116,498
    C 108,502 103,506 100,510
    C 97,506 92,502 84,498
    C 56,485 30,458 30,410
    L 30,110
    C 30,60 56,33 84,20
    C 92,16 97,12 100,8
    Z
  `;
  // Inner frame
  const frameInner = `
    M 100,14
    C 102,17 106,20 112,23
    C 138,35 162,62 162,110
    L 162,410
    C 162,456 138,481 112,494
    C 106,498 102,502 100,504
    C 98,502 94,498 88,494
    C 62,481 38,456 38,410
    L 38,110
    C 38,62 62,35 88,23
    C 94,20 98,17 100,14
    Z
  `;

  // Inner clip path (for portrait)
  const clipPath = frameInner;

  const uid = `g${rank}`;

  // Per-card glitch positions
  const glitchPositions = [
    { sliceY: [200, 150, 250, 180, 200], sliceX: [0, 3, -2, 1, 0], bar: [40, 35, 50, 40], barH: [42, 38, 52, 42], barShift: 2 },
    { sliceY: [120, 180, 90, 160, 120], sliceX: [0, -3, 2, -1, 0], bar: [25, 60, 30, 25], barH: [28, 62, 33, 28], barShift: -3 },
    { sliceY: [350, 300, 400, 320, 350], sliceX: [0, 2, -4, 1, 0], bar: [55, 20, 48, 55], barH: [58, 23, 50, 58], barShift: 3 },
    { sliceY: [280, 220, 340, 250, 280], sliceX: [0, -2, 4, -1, 0], bar: [15, 45, 22, 15], barH: [18, 48, 25, 18], barShift: -2 },
  ];
  const gp = glitchPositions[Math.min(rank - 1, glitchPositions.length - 1)];

  return (
    <div
      className="flex-shrink-0"
      style={{ width: `${VW * scale}px`, height: `${VH * scale}px` }}
    >
    <div
      style={{
        width: `${VW}px`,
        height: `${VH}px`,
        transform: `scale(${scale})`,
        transformOrigin: "top left",
      }}
    >
    <motion.div
      initial={{ opacity: 0, y: 80, scale: 0.7 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ delay, type: "spring", stiffness: 180, damping: 20 }}
      className="relative"
      style={{ width: `${VW}px`, height: `${VH}px` }}
    >
      {/* Tinted glow behind card */}
      <div
        className="absolute inset-0"
        style={{
          background: `radial-gradient(ellipse at 50% 50%, rgba(${tintRgb},0.15) 0%, transparent 55%)`,
          filter: "blur(24px)",
          transform: "scale(1.3)",
        }}
      />

      {/* ── Glitch layer: offset copy of frame — low frequency ── */}
      <motion.svg
        className="absolute inset-0 w-full h-full"
        viewBox={`0 0 ${VW} ${VH}`}
        style={{ filter: `drop-shadow(2px 0 0 rgba(${tintRgb},0.4))` }}
        animate={{ opacity: [0, 0, 0, 0, 0.6, 0, 0, 0, 0, 0, 0, 0, 0.4, 0, 0, 0, 0, 0, 0, 0] }}
        transition={{ duration: 8, repeat: Infinity, times: [0, 0.45, 0.46, 0.47, 0.48, 0.49, 0.5, 0.7, 0.71, 0.72, 0.73, 0.74, 0.75, 0.76, 0.77, 0.9, 0.91, 0.92, 0.93, 1] }}
      >
        <path d={frameOuter} fill="none" stroke={tint} strokeWidth="1" />
        <path d={frameMiddle} fill="none" stroke={tint} strokeWidth="0.6" opacity="0.5" />
        <path d={frameInner} fill="none" stroke={tint} strokeWidth="0.4" opacity="0.3" />
      </motion.svg>

      {/* Main card SVG */}
      <svg className="absolute inset-0 w-full h-full" viewBox={`0 0 ${VW} ${VH}`}>
        <defs>
          <clipPath id={`clip-${uid}`}>
            <path d={clipPath} />
          </clipPath>
          <linearGradient id={`gold-${uid}`} x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor={goldBright} stopOpacity="0.95" />
            <stop offset="50%" stopColor={gold} stopOpacity="0.7" />
            <stop offset="100%" stopColor={goldBright} stopOpacity="0.95" />
          </linearGradient>
          <linearGradient id={`btm-${uid}`} x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="transparent" />
            <stop offset="50%" stopColor="rgba(0,0,0,0.6)" />
            <stop offset="100%" stopColor="rgba(0,0,0,0.92)" />
          </linearGradient>
          <linearGradient id={`glitch-${uid}`} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor={`rgba(${tintRgb},0)`} />
            <stop offset="50%" stopColor={`rgba(${tintRgb},0.3)`} />
            <stop offset="100%" stopColor={`rgba(${tintRgb},0)`} />
          </linearGradient>
        </defs>

        {/* Dark background */}
        <path d={clipPath} fill="#0a0604" />

        {/* Portrait */}
        <image href={portrait} x="30" y="30" width={VW - 60} height={VH - 60} preserveAspectRatio="xMidYMid slice" clipPath={`url(#clip-${uid})`} />

        {/* Glitch slice — intermittent, low frequency */}
        <motion.g clipPath={`url(#clip-${uid})`}>
          <motion.rect
            x="30" y="0" width={VW - 60} height="20"
            fill={`url(#glitch-${uid})`}
            animate={{
              opacity: [0, 0, 0, 0, 0.8, 0, 0, 0, 0, 0, 0, 0, 0.6, 0, 0, 0, 0, 0],
              y: gp.sliceY,
              x: gp.sliceX,
            }}
            transition={{ duration: 8, repeat: Infinity, times: [0, 0.45, 0.46, 0.47, 0.48, 0.49, 0.5, 0.7, 0.71, 0.72, 0.73, 0.74, 0.75, 0.76, 0.77, 0.9, 0.91, 0.92, 1] }}
          />
        </motion.g>

        {/* Bottom text gradient */}
        <path d={`M 30,520 L 30,400 L 170,400 L 170,520 Z`} fill={`url(#btm-${uid})`} clipPath={`url(#clip-${uid})`} />

        {/* ═══ THREE MERGED FRAMES — smooth layered Gothic ═══ */}
        {/* Outer frame */}
        <path d={frameOuter} fill="none" stroke={`url(#gold-${uid})`} strokeWidth="1.2" strokeLinejoin="round" />
        {/* Middle frame */}
        <path d={frameMiddle} fill="none" stroke={gold} strokeWidth="0.9" strokeOpacity="0.6" strokeLinejoin="round" />
        {/* Inner frame */}
        <path d={frameInner} fill="none" stroke={gold} strokeWidth="0.7" strokeOpacity="0.4" strokeLinejoin="round" />

        {/* ── Top spike tracery — line-based pointed ornaments ── */}
        <g fill="none" stroke={gold} strokeWidth="0.5" opacity="0.5" strokeLinecap="butt">
          {/* Central spike internal lines */}
          <line x1="100" y1="0" x2="100" y2="8" />
          <line x1="96" y1="4" x2="104" y2="4" />
          {/* Second spike pair internal lines */}
          <line x1="84" y1="6" x2="84" y2="14" />
          <line x1="116" y1="6" x2="116" y2="14" />
          {/* Third spike pair */}
          <line x1="72" y1="10" x2="72" y2="20" />
          <line x1="128" y1="10" x2="128" y2="20" />
          {/* Cross connectors between spikes */}
          <line x1="84" y1="14" x2="100" y2="8" strokeOpacity="0.4" />
          <line x1="116" y1="14" x2="100" y2="8" strokeOpacity="0.4" />
          <line x1="72" y1="20" x2="84" y2="14" strokeOpacity="0.3" />
          <line x1="128" y1="20" x2="116" y2="14" strokeOpacity="0.3" />
          {/* Diagonal fill lines in spike bases */}
          <line x1="60" y1="24" x2="72" y2="20" strokeOpacity="0.3" />
          <line x1="140" y1="24" x2="128" y2="20" strokeOpacity="0.3" />
          {/* Inner geometric pattern below spikes */}
          <line x1="60" y1="30" x2="140" y2="30" strokeOpacity="0.3" />
          <line x1="70" y1="36" x2="130" y2="36" strokeOpacity="0.25" />
          {/* Diamond at center */}
          <path d="M 100,28 L 104,32 L 100,36 L 96,32 Z" strokeOpacity="0.4" />
        </g>

        {/* ── Bottom spike tracery — mirrored ── */}
        <g fill="none" stroke={gold} strokeWidth="0.5" opacity="0.5" strokeLinecap="butt">
          <line x1="100" y1="520" x2="100" y2="512" />
          <line x1="96" y1="516" x2="104" y2="516" />
          <line x1="84" y1="514" x2="84" y2="506" />
          <line x1="116" y1="514" x2="116" y2="506" />
          <line x1="72" y1="510" x2="72" y2="500" />
          <line x1="128" y1="510" x2="128" y2="500" />
          <line x1="84" y1="506" x2="100" y2="512" strokeOpacity="0.4" />
          <line x1="116" y1="506" x2="100" y2="512" strokeOpacity="0.4" />
          <line x1="72" y1="500" x2="84" y2="506" strokeOpacity="0.3" />
          <line x1="128" y1="500" x2="116" y2="506" strokeOpacity="0.3" />
          <line x1="60" y1="496" x2="72" y2="500" strokeOpacity="0.3" />
          <line x1="140" y1="496" x2="128" y2="500" strokeOpacity="0.3" />
          <line x1="60" y1="490" x2="140" y2="490" strokeOpacity="0.3" />
          <line x1="70" y1="484" x2="130" y2="484" strokeOpacity="0.25" />
          <path d="M 100,492 L 104,488 L 100,484 L 96,488 Z" strokeOpacity="0.4" />
        </g>

        {/* ── Side tracery ── */}
        {/* Left side */}
        <g fill="none" stroke={gold} strokeWidth="0.5" opacity="0.35">
          <line x1="18" y1="80" x2="18" y2="440" />
          <line x1="22" y1="80" x2="22" y2="440" strokeOpacity="0.3" />
          <line x1="14" y1="140" x2="26" y2="140" />
          <line x1="14" y1="200" x2="26" y2="200" strokeOpacity="0.6" />
          <line x1="14" y1="260" x2="26" y2="260" />
          <line x1="14" y1="320" x2="26" y2="320" strokeOpacity="0.6" />
          <line x1="14" y1="380" x2="26" y2="380" />
          <path d="M 20,230 L 24,236 L 20,242 L 16,236 Z" strokeOpacity="0.5" />
          <path d="M 20,350 L 24,356 L 20,362 L 16,356 Z" strokeOpacity="0.5" />
        </g>
        {/* Right side */}
        <g fill="none" stroke={gold} strokeWidth="0.5" opacity="0.35">
          <line x1="178" y1="80" x2="178" y2="440" />
          <line x1="182" y1="80" x2="182" y2="440" strokeOpacity="0.3" />
          <line x1="174" y1="140" x2="186" y2="140" />
          <line x1="174" y1="200" x2="186" y2="200" strokeOpacity="0.6" />
          <line x1="174" y1="260" x2="186" y2="260" />
          <line x1="174" y1="320" x2="186" y2="320" strokeOpacity="0.6" />
          <line x1="174" y1="380" x2="186" y2="380" />
          <path d="M 180,230 L 184,236 L 180,242 L 176,236 Z" strokeOpacity="0.5" />
          <path d="M 180,350 L 184,356 L 180,362 L 176,356 Z" strokeOpacity="0.5" />
        </g>

        {/* ═══ Rank badge — top center over portrait ═══ */}
        <g>
          <circle cx="100" cy="42" r="15" fill="rgba(10,6,4,0.88)" stroke={gold} strokeWidth="0.9" />
          <circle cx="100" cy="42" r="12" fill="none" stroke={gold} strokeWidth="0.4" strokeOpacity="0.55" />
          <text
            x="100" y="42"
            textAnchor="middle"
            dominantBaseline="central"
            fontFamily="'Cinzel', 'EB Garamond', 'Noto Serif SC', serif"
            fontSize="14"
            fontWeight="600"
            fill={tint}
          >
            {rank}
          </text>
        </g>

        {/* ═══ Player name — gothic calligraphy near bottom ═══ */}
        <text
          x="100" y="445"
          textAnchor="middle"
          fontFamily="'UnifrakturCook', 'UnifrakturMaguntia', 'Cinzel Decorative', 'Noto Serif SC', serif"
          fontSize="15"
          fontWeight="500"
          letterSpacing="0.5"
          fill={tint}
          style={{ filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.9))" }}
        >
          {name}
        </text>

        {/* ═══ WINNER / DEFEATED seal — 胜 / 败 ═══ */}
        <text
          x="100" y="475"
          textAnchor="middle"
          fontFamily="'Cinzel', 'EB Garamond', 'Noto Serif SC', serif"
          fontSize="11"
          letterSpacing="3"
          fill={isWinner ? goldBright : "#9a4040"}
          opacity="0.92"
        >
          {isWinner ? "胜" : "败"}
        </text>

        {/* ═══ Stats — kills & heals ═══ */}
        {stats && (
          <text
            x="100" y="498"
            textAnchor="middle"
            fontFamily="'Cormorant Garamond', 'Noto Serif SC', serif"
            fontSize="9"
            letterSpacing="0.5"
            fill={gold}
            opacity="0.78"
          >
            {`击杀 ${stats.kills} · 治疗 ${stats.heals}`}
          </text>
        )}
      </svg>

      {/* ── Glitch overlay: RGB split bars — low frequency ── */}
      <motion.div
        className="absolute inset-0 pointer-events-none overflow-hidden"
        style={{ clipPath: `polygon(0 ${gp.bar[0]}%, 100% ${gp.bar[0]}%, 100% ${gp.barH[0]}%, 0 ${gp.barH[0]}%)` }}
        animate={{
          opacity: [0, 0, 0, 0, 0.7, 0, 0, 0, 0, 0, 0, 0, 0.5, 0, 0, 0, 0, 0],
          clipPath: [
            `polygon(0 ${gp.bar[0]}%, 100% ${gp.bar[0]}%, 100% ${gp.barH[0]}%, 0 ${gp.barH[0]}%)`,
            `polygon(0 ${gp.bar[1]}%, 100% ${gp.bar[1]}%, 100% ${gp.barH[1]}%, 0 ${gp.barH[1]}%)`,
            `polygon(0 ${gp.bar[2]}%, 100% ${gp.bar[2]}%, 100% ${gp.barH[2]}%, 0 ${gp.barH[2]}%)`,
            `polygon(0 ${gp.bar[3]}%, 100% ${gp.bar[3]}%, 100% ${gp.barH[3]}%, 0 ${gp.barH[3]}%)`,
          ],
        }}
        transition={{ duration: 8, repeat: Infinity, times: [0, 0.45, 0.46, 0.47, 0.48, 0.49, 0.5, 0.7, 0.71, 0.72, 0.73, 0.74, 0.75, 0.76, 0.77, 0.9, 0.91, 0.92, 1] }}
      >
        <div className="absolute inset-0" style={{ background: `rgba(${tintRgb},0.08)`, transform: `translateX(${gp.barShift}px)` }} />
      </motion.div>
    </motion.div>
    </div>
    </div>
  );
}

/* ──────────────────────────────────────────────
   Winner Screen — redesigned with vertical Gothic arch cards
   ────────────────────────────────────────────── */

function WinnerScreen({ onExit }: { onExit: () => void }) {
  const winner = useGameStore((s) => s.winner);
  const players = useGameStore((s) => s.players);
  const round = useGameStore((s) => s.round ?? 0);

  // Play the victory SFX once when the winner screen appears
  useEffect(() => {
    AudioManager.playSfx("win");
  }, []);

  if (!winner) return null;

  const surrendered = winner.surrendered === true;
  const c = surrendered
    ? { primary: "#a02828", bright: "#d44848", glow: "rgba(180,40,40,", dim: "rgba(140,30,30," }
    : { primary: "#c8a043", bright: "#f5d878", glow: "rgba(200,160,67,", dim: "rgba(160,128,48," };

  const ranked = [...players].sort((a, b) => {
    const aWin = winner.seats.includes(a.seat) ? 1 : 0;
    const bWin = winner.seats.includes(b.seat) ? 1 : 0;
    if (aWin !== bWin) return bWin - aWin;
    if (a.alive !== b.alive) return a.alive ? -1 : 1;
    return b.fragments - a.fragments;
  });

  // Responsive scale: shrink cards when many players share the row
  const scale = players.length >= 4 ? 0.78 : players.length === 3 ? 0.9 : 1;

  // Winner name(s) for the subtitle
  const winnerNames = ranked
    .filter((p) => winner.seats.includes(p.seat))
    .map((p) => getCharacter(p.characterId).name)
    .join(" · ");

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="fixed inset-0 z-[90] flex flex-col items-center justify-center overflow-hidden"
      style={{
        backgroundImage: `url(${assetUrl("images/settlement_bg.jpg")})`,
        backgroundSize: "cover",
        backgroundPosition: "center",
        backgroundRepeat: "no-repeat",
      }}
    >
      {/* ── 多层氛围 ── */}
      {/* 底色暗化 */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: surrendered
            ? "radial-gradient(ellipse at 50% 40%, rgba(25,4,4,0.5) 0%, rgba(2,0,0,0.82) 75%)"
            : "radial-gradient(ellipse at 50% 35%, rgba(8,6,2,0.45) 0%, rgba(0,0,0,0.82) 75%)",
        }}
      />
      {/* 顶部光柱 */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.3, duration: 1.5 }}
        className="absolute top-0 left-1/2 -translate-x-1/2 pointer-events-none"
        style={{
          width: "600px", height: "70%",
          background: `radial-gradient(ellipse at 50% 0%, ${c.glow}0.15) 0%, ${c.glow}0.04) 30%, transparent 60%)`,
        }}
      />
      {/* 底部雾气 */}
      <div
        className="absolute bottom-0 left-0 right-0 pointer-events-none"
        style={{
          height: "35%",
          background: `linear-gradient(180deg, transparent 0%, rgba(0,0,0,0.5) 50%, rgba(0,0,0,0.9) 100%)`,
        }}
      />
      {/* 暗角 */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: "radial-gradient(ellipse 120% 100% at 50% 50%, transparent 40%, rgba(0,0,0,0.5) 80%, rgba(0,0,0,0.85) 100%)",
        }}
      />

      {/* ── 浮动余烬粒子 ── */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        {Array.from({ length: 18 }).map((_, i) => {
          const left = 8 + i * 5.2;
          const size = i % 3 === 0 ? 2.5 : 1.5;
          const dur = 9 + (i % 5) * 2.5;
          return (
            <span
              key={i}
              className="float-particle absolute rounded-full"
              style={{
                left: `${left}%`, bottom: "5%",
                width: size, height: size,
                background: i % 2 ? c.bright : "#c9b896",
                boxShadow: `0 0 ${size * 3}px ${c.glow}0.4)`,
                animationDuration: `${dur}s`,
                animationDelay: `${i * 0.5}s`,
                opacity: 0.5,
                ["--dx" as string]: `${(i % 2 ? 1 : -1) * (10 + (i % 4) * 8)}px`,
              }}
            />
          );
        })}
      </div>

      {/* ── 旋转星盘装饰（极淡）── */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] opacity-[0.04] pointer-events-none">
        <svg viewBox="0 0 200 200" className="w-full h-full animate-rotate-slow">
          <circle cx="100" cy="100" r="96" fill="none" stroke={c.primary} strokeWidth="0.3" />
          <circle cx="100" cy="100" r="72" fill="none" stroke={c.primary} strokeWidth="0.25" />
          <circle cx="100" cy="100" r="48" fill="none" stroke={c.primary} strokeWidth="0.2" />
          {Array.from({ length: 24 }).map((_, i) => (
            <line key={i} x1="100" y1="4" x2="100" y2="16" transform={`rotate(${i * 15} 100 100)`} stroke={c.primary} strokeWidth="0.3" />
          ))}
        </svg>
      </div>

      {/* Return button */}
      <button
        onClick={onExit}
        className="absolute top-6 right-6 flex items-center gap-2 px-5 py-2.5 rounded-full font-cinzel text-sm transition-all hover:scale-105 z-20"
        style={{ background: "rgba(10,8,6,0.85)", border: `1px solid ${c.dim}0.4)`, color: "#c9b896", backdropFilter: "blur(4px)" }}
      >
        <IconExit size={13} color="#c9b896" />
        <span>返回主菜单</span>
      </button>

      {/* ── 标题区 ── */}
      <motion.div
        initial={{ opacity: 0, y: -30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2, duration: 0.8 }}
        className="text-center mb-6 z-10"
      >
        {/* 上装饰线 */}
        <motion.div
          initial={{ scaleX: 0 }}
          animate={{ scaleX: 1 }}
          transition={{ delay: 0.5, duration: 0.8 }}
          className="flex items-center justify-center gap-3 mb-3"
        >
          <span className="block w-16 h-px" style={{ background: `linear-gradient(90deg, transparent, ${c.primary})` }} />
          <svg width="12" height="12" viewBox="0 0 12 12" style={{ color: c.primary }}>
            <path d="M6 0 L7.5 4.5 L12 6 L7.5 7.5 L6 12 L4.5 7.5 L0 6 L4.5 4.5 Z" fill="currentColor" opacity="0.6" />
          </svg>
          <span className="block w-16 h-px" style={{ background: `linear-gradient(90deg, ${c.primary}, transparent)` }} />
        </motion.div>

        {/* 主标题 */}
        <div
          className="font-caoshu text-4xl md:text-5xl tracking-[0.35em]"
          style={{ color: c.bright, textShadow: `0 0 30px ${c.glow}0.6), 0 2px 8px rgba(0,0,0,0.9)` }}
        >
          {surrendered ? "叙事终结" : "叙事已成"}
        </div>

        {/* 下装饰线 */}
        <motion.div
          initial={{ scaleX: 0 }}
          animate={{ scaleX: 1 }}
          transition={{ delay: 0.7, duration: 0.8 }}
          className="flex items-center justify-center gap-3 mt-3"
        >
          <span className="block w-20 h-px" style={{ background: `linear-gradient(90deg, transparent, ${c.dim}0.6))` }} />
          <span className="font-cinzel text-[9px] tracking-[0.4em]" style={{ color: `${c.dim}0.8)` }}>
            {surrendered ? "NARRATIVE · COLLAPSED" : "NARRATIVE · FULFILLED"}
          </span>
          <span className="block w-20 h-px" style={{ background: `linear-gradient(90deg, ${c.dim}0.6)), transparent)` }} />
        </motion.div>

        {/* 胜者名 */}
        {winnerNames && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1 }}
            className="font-cormorant text-base tracking-[0.2em] mt-4"
            style={{ color: `${c.dim}0.9)`, textShadow: `0 0 12px ${c.glow}0.3)` }}
          >
            {winnerNames}
          </motion.div>
        )}
      </motion.div>

      {/* ── 哥特拱门卡牌 ── */}
      <div className="flex items-center justify-center gap-3 md:gap-5 px-4 z-10">
        {ranked.map((p, i) => {
          const ch = getCharacter(p.characterId);
          const isWinner = winner.seats.includes(p.seat);
          return (
            <GothicArchCard
              key={p.seat}
              portrait={ch.portrait}
              name={ch.name}
              rank={i + 1}
              isWinner={isWinner}
              color={c}
              delay={0.6 + i * 0.3}
              scale={scale}
              stats={{ kills: p.stats.killedCount, heals: p.stats.totalHealed }}
            />
          );
        })}
      </div>

      {/* ── 底部叙事结语 ── */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 1.5 + ranked.length * 0.3, duration: 0.8 }}
        className="absolute bottom-8 left-1/2 -translate-x-1/2 text-center z-10 max-w-[600px]"
      >
        <p className="font-brush text-sm italic" style={{ color: "#8a7a5c" }}>
          {surrendered
            ? `「第 ${round} 回合，叙事崩解于绝望之中。」`
            : `「第 ${round} 回合，叙事于笔墨间终成定局。」`}
        </p>
      </motion.div>
    </motion.div>
  );
}

// Card play effect - card flies from player position to center using CardEffectConfig flight config; no text popups
// Faction info panel — gothic reliquary with parchment aesthetics
/* ────────────────────────────────────────────────────────────────
   阵营密令 —— 牛皮纸质地，关闭时自焚消散
   ----------------------------------------------------------------
   两个关键点：
   1) 真正的牛皮纸：暖褐底 + feTurbulence 纤维噪点 + 做旧茶渍与折痕，
      而不是原来那块半透明的深灰玻璃面板。
   2) 自焚：关闭不是淡出，而是一张纸被点燃。
      焚毁演出整体交给 PaperBurn —— 火从右下角那一点开始向外吃，
      洞、焦痕、火舌共用同一条湍流边界，最后连灰都不剩。
      密令阅后即焚，正符合它的身份。
   ──────────────────────────────────────────────────────────────── */
function FactionParchment({ factionName, factionCategory, winCondition, quote, onClose }: {
  factionName: string;
  factionCategory: FactionCategory;
  winCondition: string;
  quote: string;
  onClose: () => void;
}) {
  const cat = CATEGORY_META[factionCategory];
  const [burning, setBurning] = useState(false);
  // 悬停"阅后即焚"时右下角先阴燃起来：点火之前就给出即将发生什么的预告
  const [primed, setPrimed] = useState(false);

  // 点火 → 播放焚毁演出 → 演出结束由 PaperBurn 回调卸载
  const ignite = useCallback(() => {
    if (burning) return;
    setBurning(true);
    AudioManager.playSfx("discard", { volume: 0.85 });
  }, [burning]);

  return (
    <motion.div
      initial={{ opacity: 0, y: -14, rotate: -1.2, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, rotate: -0.4, scale: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.42, ease: [0.16, 1, 0.3, 1] }}
      className="absolute z-30"
      style={{ left: "12px", top: "96px", width: "300px", maxWidth: "calc(100vw - 24px)" }}
    >
      <PaperBurn
        active={burning}
        origin="bottom-right"
        durationMs={1700}
        density={62}
        onFinished={onClose}
      >
        <div
          className="relative"
          style={{
            background: "linear-gradient(158deg, #c9ab74 0%, #bb9a63 34%, #a8874f 68%, #93733f 100%)",
            boxShadow:
              "0 16px 42px rgba(0,0,0,0.7), 0 2px 0 rgba(255,240,205,0.22) inset, 0 -3px 10px rgba(60,36,12,0.4) inset",
            clipPath:
              "polygon(0.6% 1.2%, 12% 0.3%, 27% 1.4%, 43% 0.2%, 61% 1.3%, 78% 0.4%, 93% 1.5%, 99.4% 0.6%, 99% 14%, 99.7% 31%, 98.8% 49%, 99.6% 67%, 98.9% 84%, 99.4% 98.8%, 86% 99.6%, 70% 98.7%, 52% 99.7%, 35% 98.8%, 18% 99.6%, 4% 98.9%, 0.4% 86%, 1.1% 68%, 0.3% 50%, 1.2% 33%, 0.2% 16%)",
          }}
        >
          <div
            className="absolute inset-0 pointer-events-none mix-blend-multiply opacity-[0.3]"
            style={{
              backgroundImage:
                "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='260' height='260'%3E%3Cfilter id='f'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='5'/%3E%3C/filter%3E%3Crect width='260' height='260' filter='url(%23f)'/%3E%3C/svg%3E\")",
            }}
          />
          <div
            className="absolute inset-0 pointer-events-none mix-blend-multiply opacity-[0.42]"
            style={{
              background:
                "radial-gradient(ellipse 55% 40% at 14% 8%, rgba(96,60,22,0.5), transparent 62%), radial-gradient(ellipse 45% 55% at 92% 72%, rgba(84,50,18,0.45), transparent 60%), radial-gradient(ellipse 70% 30% at 50% 104%, rgba(70,40,14,0.55), transparent 58%)",
            }}
          />
          <div
            className="absolute inset-0 pointer-events-none opacity-[0.14]"
            style={{
              background:
                "linear-gradient(96deg, transparent 31%, rgba(60,36,12,0.85) 32%, rgba(255,240,205,0.5) 33%, transparent 34%), linear-gradient(184deg, transparent 57%, rgba(60,36,12,0.7) 58%, rgba(255,240,205,0.4) 59%, transparent 60%)",
            }}
          />
          <div
            className="absolute inset-0 pointer-events-none mix-blend-multiply opacity-[0.2]"
            style={{ background: `radial-gradient(ellipse at 50% 0%, ${cat.color}, transparent 70%)` }}
          />

          {/* 悬停即焚按钮时，右下角先透出一点将燃未燃的暗红 */}
          <div
            className="absolute inset-0 pointer-events-none transition-opacity duration-500"
            style={{
              opacity: primed && !burning ? 1 : 0,
              background:
                "radial-gradient(ellipse 42% 34% at 97% 96%, rgba(190,70,18,0.42), rgba(120,36,8,0.14) 46%, transparent 72%)",
              mixBlendMode: "multiply",
            }}
          />

          <div className="relative px-4 pt-4 pb-4">
            <div className="flex items-center gap-2 mb-2.5">
              <FactionIcon category={factionCategory} size={13} color="#4a2f10" />
              <span className="font-cinzel text-[8px] tracking-[0.34em]" style={{ color: "#5c3c16" }}>
                {cat.label.toUpperCase()} · ORDO
              </span>
              <div className="flex-1 h-px" style={{ background: "linear-gradient(90deg, rgba(74,47,16,0.5), transparent)" }} />
              {/* 火漆封缄：一枚已被挑开的印，暗示这封密令只读一次 */}
              <span
                className="w-3.5 h-3.5 rounded-full shrink-0"
                style={{
                  background: "radial-gradient(circle at 34% 30%, #a8321e, #5c1408 72%)",
                  boxShadow: "inset 0 -1px 2px rgba(0,0,0,0.5), 0 1px 1px rgba(255,240,205,0.25)",
                }}
              />
            </div>

            <h3
              className="font-caoshu text-[30px] leading-none tracking-[0.14em]"
              style={{ color: "#2a1a08", textShadow: "0 1px 0 rgba(255,240,205,0.35)" }}
            >
              <TypeOut text={factionName} perChar={72} delay={180} />
            </h3>
            <div className="mt-2 h-[1.5px]" style={{ background: "linear-gradient(90deg, rgba(50,30,10,0.62), rgba(50,30,10,0.12) 65%, transparent)" }} />

            <p className="font-brush text-[13px] leading-[1.85] mt-2.5 mb-3" style={{ color: "#4a3116" }}>
              「{quote}」
            </p>

            <div
              className="relative px-3 py-2.5 rounded-[2px]"
              style={{ background: "rgba(120,26,20,0.09)", border: "1px dashed rgba(122,30,22,0.42)" }}
            >
              <div className="flex items-center gap-2 mb-1.5">
                <span className="font-cinzel text-[7.5px] tracking-[0.34em]" style={{ color: "#7a1e16" }}>
                  VICTORIA OCCULTA
                </span>
                <div className="flex-1 h-px" style={{ background: "linear-gradient(90deg, rgba(122,30,22,0.35), transparent)" }} />
              </div>
              <p className="text-[12.5px] leading-[1.8]" style={{ color: "#3a2410" }}>
                {winCondition}
              </p>
            </div>

            <div className="flex items-center justify-between mt-3">
              <span className="font-cinzel text-[7.5px] tracking-[0.28em]" style={{ color: "#6a4a20" }}>
                SIGILLVM · 密令
              </span>
              <button
                onClick={ignite}
                onMouseEnter={() => { setPrimed(true); AudioManager.playSfx("hover", { volume: 0.4 }); }}
                onMouseLeave={() => setPrimed(false)}
                disabled={burning}
                title="点燃后不可恢复"
                className="group relative flex items-center gap-1.5 px-2.5 py-1 rounded-[2px] transition-all hover:scale-[1.04] active:scale-95 disabled:opacity-50"
                style={{
                  background: primed ? "rgba(150,40,24,0.24)" : "rgba(122,30,22,0.14)",
                  border: "1px solid rgba(122,30,22,0.45)",
                }}
              >
                <motion.span
                  animate={primed && !burning ? { rotate: [-4, 4, -3, 3, -4], y: [0, -0.6, 0] } : { rotate: 0, y: 0 }}
                  transition={{ duration: 0.5, repeat: primed && !burning ? Infinity : 0 }}
                  className="flex"
                >
                  <IconFlame size={11} color={primed ? "#b8391a" : "#8a2a14"} />
                </motion.span>
                <span className="text-[10.5px] tracking-[0.16em]" style={{ color: "#7a2010" }}>
                  {burning ? "焚毁中…" : "阅后即焚"}
                </span>
              </button>
            </div>
          </div>
        </div>
      </PaperBurn>
    </motion.div>
  );
}

/**
 * 长按确认投降。
 *
 * 投降不可逆，却只隔着一次点击 —— 误触的代价和收益完全不成比例。
 * 改成需要按住 900ms 才生效，并把进度画在按钮上：
 * 松手即中止，既避免误操作，也让"放弃"这个动作有该有的分量。
 */
function HoldToSurrender({ onComplete }: { onComplete: () => void }) {
  const HOLD_MS = 900;
  const [progress, setProgress] = useState(0);
  const rafRef = useRef<number | null>(null);
  const startRef = useRef(0);
  const doneRef = useRef(false);

  const stop = useCallback(() => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    if (!doneRef.current) setProgress(0);
  }, []);

  const begin = useCallback(() => {
    if (doneRef.current) return;
    startRef.current = performance.now();
    const tick = () => {
      const p = Math.min(1, (performance.now() - startRef.current) / HOLD_MS);
      setProgress(p);
      if (p >= 1) {
        doneRef.current = true;
        rafRef.current = null;
        onComplete();
        return;
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
  }, [onComplete]);

  useEffect(() => () => { if (rafRef.current !== null) cancelAnimationFrame(rafRef.current); }, []);

  return (
    <button
      onPointerDown={begin}
      onPointerUp={stop}
      onPointerLeave={stop}
      onPointerCancel={stop}
      className="relative flex-1 py-2.5 rounded-sm text-[12px] tracking-[0.22em] overflow-hidden transition-transform active:scale-95 select-none"
      style={{
        background: "linear-gradient(180deg, rgba(50,14,10,0.92), rgba(26,6,4,0.92))",
        border: "1px solid rgba(150,50,38,0.6)",
        color: "#e0a090",
        touchAction: "none",
      }}
    >
      {/* 按住时从左向右灌满的血色进度 */}
      <span
        className="absolute inset-y-0 left-0 pointer-events-none"
        style={{
          width: `${progress * 100}%`,
          background: "linear-gradient(90deg, rgba(150,30,22,0.85), rgba(200,60,44,0.9))",
          boxShadow: progress > 0 ? "0 0 18px rgba(200,60,44,0.55)" : "none",
          transition: progress === 0 ? "width 0.25s ease-out" : "none",
        }}
      />
      <span className="relative" style={{ color: progress > 0.55 ? "#fff0e8" : "#e0a090" }}>
        {progress > 0 ? "松手中止…" : "就此封笔"}
      </span>
    </button>
  );
}

/* ============================================================================
 * FactionGallery3D —— 势力环廊 · a corridor of shrines
 * ----------------------------------------------------------------------------
 * 22 altars stand on a ring, grouped into six domain arcs separated by boundary
 * pillars.  You walk the corridor by dragging, scrolling, or with the arrow
 * keys; the altar in front lights its candles and raises off the floor.
 *
 * Why it is built this way
 *   - Rotation lives in a *MotionValue*, never React state.  The previous
 *     revision called setRotation() inside requestAnimationFrame, which
 *     re-rendered 22 cards every single frame.  Now one rAF tick writes one
 *     number, each altar derives its own transform from it, and React only
 *     re-renders when the *focused index* changes (roughly once per second).
 *   - `perspective` is set on the stage — the element that directly parents the
 *     3D world.  It used to sit on the outer fixed container with a plain,
 *     flattening div in between, so the ring was rendered orthographically and
 *     every translateZ was silently thrown away.
 *   - Card, ring radius and perspective are all derived from a measured stage
 *     box, so the corridor is legible from a 380px phone to an ultrawide.
 * ==========================================================================*/

import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import {
  motion,
  AnimatePresence,
  animate,
  useMotionValue,
  useTransform,
  useAnimationFrame,
  useReducedMotion,
  type MotionValue,
} from "framer-motion";
import { FACTIONS, CATEGORY_META, type FactionCategory, type FactionDef } from "../data/factions";
import { FactionIcon, IconExit } from "./Icons";
import { playSound } from "./MainMenu";
import { assetUrl } from "../utils/assetUrl";
import {
  CAT_RING,
  CAT_DESC,
  CAT_EN,
  withAlpha,
  useBoxSize,
  FactionDossier,
} from "./FactionGallery";

/* 22 houses x 15deg + 6 boundaries x 5deg = exactly 360deg. */
const PER_FACTION = 15;
const DIVIDER = 5;
const DEG_PER_MS = 0.1 / 32;

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

interface Placement {
  faction: FactionDef;
  angle: number;
  cat: FactionCategory;
  indexInCat: number;
  catCount: number;
}
interface Divider {
  angle: number;
  /** the domain you are about to walk into */
  next: FactionCategory;
}

function useRingLayout(): { placements: Placement[]; dividers: Divider[] } {
  return useMemo(() => {
    const placements: Placement[] = [];
    const dividers: Divider[] = [];
    let cursor = 0;
    CAT_RING.forEach((cat, ci) => {
      const list = FACTIONS.filter((f) => f.category === cat);
      list.forEach((f, i) => {
        placements.push({ faction: f, angle: cursor, cat, indexInCat: i, catCount: list.length });
        cursor += PER_FACTION;
      });
      dividers.push({ angle: cursor + DIVIDER / 2, next: CAT_RING[(ci + 1) % CAT_RING.length] });
      cursor += DIVIDER;
    });
    return { placements, dividers };
  }, []);
}

/** Shortest signed route from `current` to `target` on a 360deg circle. */
function nearestRotation(current: number, target: number): number {
  const diff = ((((target - current) % 360) + 540) % 360) - 180;
  return current + diff;
}

function frontDistance(angle: number, rotation: number): number {
  const eff = (((angle + rotation) % 360) + 360) % 360;
  return Math.min(eff, 360 - eff);
}

/* ========================================================================== */

export default function FactionGallery3D({ onBack }: { onBack: () => void }) {
  const reduce = useReducedMotion() ?? false;
  const { placements, dividers } = useRingLayout();
  const total = placements.length;

  const [selected, setSelected] = useState<FactionDef | null>(null);
  const [focusedIndex, setFocusedIndex] = useState(0);
  const [autoRotate, setAutoRotate] = useState(!reduce);
  const [dragging, setDragging] = useState(false);
  const [ready, setReady] = useState(false);

  const stageRef = useRef<HTMLDivElement | null>(null);
  const box = useBoxSize(stageRef);

  /* ---- corridor dimensions, derived from the measured stage ---- */
  const cardW = box.w > 0 ? Math.round(clamp(Math.min(box.w * 0.16, box.h * 0.24), 96, 186)) : 0;
  const cardH = Math.round(cardW * 1.56);
  const radius = Math.round(cardW * 4.05);
  const persp = Math.round(radius * 3.2);

  /* ---- rotation: a MotionValue, so no frame ever touches React ---- */
  const rot = useMotionValue(reduce ? 0 : -86);
  const draggingRef = useRef(false);
  const movedRef = useRef(false);
  const startXRef = useRef(0);
  const startRotRef = useRef(0);
  const autoRef = useRef(!reduce);
  const modalRef = useRef(false);
  const focusRef = useRef(0);
  const settledRef = useRef(reduce);
  const snapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const runningAnim = useRef<{ stop: () => void } | null>(null);
  const boxWRef = useRef(1);

  // Mirror the pieces of state the rAF tick and the window-level pointer
  // handlers need, so neither has to be re-subscribed on every change.
  useEffect(() => {
    autoRef.current = autoRotate;
  }, [autoRotate]);
  useEffect(() => {
    modalRef.current = selected !== null;
  }, [selected]);
  useEffect(() => {
    boxWRef.current = Math.max(240, box.w);
  }, [box.w]);

  const stopAnim = useCallback(() => {
    runningAnim.current?.stop();
    runningAnim.current = null;
  }, []);

  /* ---- entrance: the corridor swings into view ---- */
  useEffect(() => {
    let cancelled = false;
    const t = setTimeout(() => {
      if (cancelled) return;
      setReady(true);
      playSound("open");
      if (reduce) {
        settledRef.current = true;
        return;
      }
      const controls = animate(rot, 0, { duration: 1.7, ease: [0.16, 1, 0.3, 1] });
      runningAnim.current = controls;
      controls.then(() => {
        settledRef.current = true;
        runningAnim.current = null;
      });
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ---- one rAF tick: advance the ring, publish the focused index ---- */
  const nearestIndex = useCallback(
    (r: number) => {
      let best = 0;
      let bestD = 361;
      for (let i = 0; i < placements.length; i++) {
        const d = frontDistance(placements[i].angle, r);
        if (d < bestD) {
          bestD = d;
          best = i;
        }
      }
      return best;
    },
    [placements],
  );

  useAnimationFrame((_, delta) => {
    if (
      autoRef.current &&
      settledRef.current &&
      !draggingRef.current &&
      !modalRef.current &&
      !reduce
    ) {
      // Clamp delta so a backgrounded tab does not fling the ring on return.
      rot.set(rot.get() + Math.min(delta, 48) * DEG_PER_MS);
    }
    const idx = nearestIndex(rot.get());
    if (idx !== focusRef.current) {
      focusRef.current = idx;
      setFocusedIndex(idx);
    }
  });

  const snapToNearest = useCallback(() => {
    const idx = nearestIndex(rot.get());
    stopAnim();
    runningAnim.current = animate(rot, nearestRotation(rot.get(), -placements[idx].angle), {
      type: "spring",
      stiffness: 90,
      damping: 20,
      restDelta: 0.05,
    });
  }, [nearestIndex, placements, rot, stopAnim]);

  const goTo = useCallback(
    (index: number) => {
      setAutoRotate(false);
      autoRef.current = false;
      stopAnim();
      playSound("click");
      runningAnim.current = animate(rot, nearestRotation(rot.get(), -placements[index].angle), {
        type: "spring",
        stiffness: 92,
        damping: 19,
        restDelta: 0.05,
      });
    },
    [placements, rot, stopAnim],
  );

  const goPrev = useCallback(
    () => goTo((focusedIndex - 1 + total) % total),
    [goTo, focusedIndex, total],
  );
  const goNext = useCallback(() => goTo((focusedIndex + 1) % total), [goTo, focusedIndex, total]);

  /* ---- drag: window-level so a pointer leaving the stage still ends it ---- */
  useEffect(() => {
    const move = (e: PointerEvent) => {
      if (!draggingRef.current) return;
      const dx = e.clientX - startXRef.current;
      if (Math.abs(dx) > 4) movedRef.current = true;
      rot.set(startRotRef.current + (dx * 240) / boxWRef.current);
    };
    const end = () => {
      if (!draggingRef.current) return;
      draggingRef.current = false;
      setDragging(false);
      if (movedRef.current) snapToNearest();
    };
    window.addEventListener("pointermove", move, { passive: true });
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
    };
  }, [rot, snapToNearest]);

  const onPointerDown = (e: React.PointerEvent) => {
    if (!ready || selected) return;
    draggingRef.current = true;
    movedRef.current = false;
    startXRef.current = e.clientX;
    startRotRef.current = rot.get();
    setDragging(true);
    setAutoRotate(false);
    autoRef.current = false;
    settledRef.current = true;
    stopAnim();
  };

  const onWheel = (e: React.WheelEvent) => {
    if (!ready || selected) return;
    setAutoRotate(false);
    autoRef.current = false;
    settledRef.current = true;
    stopAnim();
    rot.set(rot.get() + e.deltaY * 0.22);
    if (snapTimer.current) clearTimeout(snapTimer.current);
    snapTimer.current = setTimeout(snapToNearest, 160);
  };

  /* ---- keyboard ---- */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (selected) return;
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        goPrev();
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        goNext();
      } else if (e.key === "Escape") {
        onBack();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selected, goPrev, goNext, onBack]);

  useEffect(
    () => () => {
      stopAnim();
      if (snapTimer.current) clearTimeout(snapTimer.current);
    },
    [stopAnim],
  );

  /* ---- derived ---- */
  const catIndices = useMemo(() => {
    const m = {} as Record<FactionCategory, number[]>;
    CAT_RING.forEach((c) => {
      m[c] = [];
    });
    placements.forEach((p, i) => m[p.cat].push(i));
    return m;
  }, [placements]);

  const focused = placements[focusedIndex];
  const focusedCat = focused.cat;
  const focusedColor = CATEGORY_META[focusedCat].color;

  const jumpToCat = (c: FactionCategory) => {
    const idxs = catIndices[c];
    if (!idxs.length) return;
    const at = idxs.indexOf(focusedIndex);
    goTo(at === -1 ? idxs[0] : idxs[(at + 1) % idxs.length]);
  };

  return (
    <div
      className="fixed inset-0 overflow-hidden flex flex-col"
      style={{
        backgroundColor: "#070605",
        backgroundImage: `url(${assetUrl("images/bg-dark.jpg")})`,
        backgroundSize: "cover",
        backgroundPosition: "center",
      }}
    >
      {/* ambient colour grade — crossfades to the domain you are standing in */}
      <AnimatePresence>
        <motion.div
          key={focusedCat}
          initial={{ opacity: 0 }}
          animate={{ opacity: 0.2 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 1 }}
          className="absolute inset-0 pointer-events-none"
          style={{
            background: `radial-gradient(ellipse at 50% 46%, ${focusedColor} 0%, transparent 62%)`,
          }}
        />
      </AnimatePresence>

      {/* bg-dark.jpg carries a large mandala of its own; push it back so the
          corridor, not the wallpaper, is what the eye lands on */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse 66% 62% at 50% 46%, rgba(6,5,3,0.84) 0%, rgba(6,5,3,0.7) 44%, rgba(3,2,2,0.93) 86%)",
        }}
      />

      {/* ============ header ============ */}
      <div className="relative z-30 shrink-0 grid grid-cols-[auto_1fr_auto] items-center gap-2 px-3 sm:px-7 pt-3 sm:pt-4">
        <motion.button
          initial={{ opacity: 0, x: -14 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.6, delay: reduce ? 0 : 0.45 }}
          onClick={() => {
            playSound("click");
            onBack();
          }}
          className="group flex items-center gap-1.5 text-[#c9b896] hover:text-[#e8dfc8] transition-colors"
        >
          <IconExit size={13} color="currentColor" />
          <span className="font-cinzel text-[11px] sm:text-xs tracking-[0.18em] group-hover:-translate-x-0.5 transition-transform">
            返回<span className="hidden sm:inline">沙盘</span>
          </span>
        </motion.button>

        <div className="relative text-center min-w-0">
          <motion.h2
            initial={{ opacity: 0, filter: "blur(9px)", letterSpacing: "0.75em" }}
            animate={{ opacity: 1, filter: "blur(0px)", letterSpacing: "0.28em" }}
            transition={{
              duration: reduce ? 0.3 : 1.3,
              delay: reduce ? 0 : 0.25,
              ease: [0.16, 1, 0.3, 1],
            }}
            className="font-caoshu text-ink-gradient whitespace-nowrap leading-[1.15]"
            style={{ fontSize: "clamp(1.55rem, 5.4vw, 3.05rem)" }}
          >
            势力环廊
          </motion.h2>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.7, delay: reduce ? 0 : 0.7 }}
            className="flex items-center justify-center gap-2 mt-0.5"
          >
            <span className="block w-6 sm:w-14 h-px bg-gradient-to-r from-transparent to-[#a08030]" />
            <span className="font-cinzel text-[8px] sm:text-[10px] text-[#a08030] tracking-[0.3em] sm:tracking-[0.42em] whitespace-nowrap">
              FACTION CORRIDOR
            </span>
            <span className="block w-6 sm:w-14 h-px bg-gradient-to-l from-transparent to-[#a08030]" />
          </motion.div>
        </div>

        <div className="w-[52px] sm:w-24" />
      </div>

      {/* ============ domain rail ============ */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: reduce ? 0 : 0.6 }}
        className="relative z-30 shrink-0 mt-2"
      >
        <div
          className="flex items-center gap-1.5 overflow-x-auto px-4 pb-1 sm:justify-center"
          style={{
            scrollbarWidth: "none",
            maskImage: "linear-gradient(90deg, transparent, #000 3%, #000 97%, transparent)",
            WebkitMaskImage: "linear-gradient(90deg, transparent, #000 3%, #000 97%, transparent)",
          }}
        >
          {CAT_RING.map((c) => {
            const meta = CATEGORY_META[c];
            const active = focusedCat === c;
            return (
              <button
                key={c}
                onClick={() => jumpToCat(c)}
                title={`${meta.label} · ${CAT_DESC[c]}`}
                className="shrink-0 flex items-center gap-1.5 pl-2.5 pr-2 py-1 rounded-full transition-all duration-300"
                style={{
                  border: `1px solid ${active ? withAlpha(meta.color, 0.75) : "rgba(160,128,48,0.2)"}`,
                  background: active
                    ? `linear-gradient(180deg, ${withAlpha(meta.color, 0.28)}, ${withAlpha(meta.color, 0.08)})`
                    : "rgba(10,8,6,0.5)",
                  boxShadow: active ? `0 0 16px ${withAlpha(meta.color, 0.32)}` : "none",
                }}
              >
                <FactionIcon category={c} size={11} color={active ? meta.color : "#8a7a5c"} />
                <span
                  className="text-[11px] leading-none tracking-[0.08em]"
                  style={{ color: active ? "#f2ead6" : "rgba(201,184,150,0.62)" }}
                >
                  {meta.label}
                </span>
                <span
                  className="font-cinzel text-[7px] leading-none tracking-[0.22em] hidden md:inline"
                  style={{ color: active ? withAlpha(meta.color, 0.95) : "rgba(138,122,92,0.6)" }}
                >
                  {CAT_EN[c]}
                </span>
                <span
                  className="font-cinzel text-[9px] leading-none px-1 py-0.5 rounded-full"
                  style={{
                    background: active ? withAlpha(meta.color, 0.3) : "rgba(160,128,48,0.12)",
                    color: active ? "#f0c862" : "rgba(154,138,104,0.85)",
                  }}
                >
                  {catIndices[c].length}
                </span>
              </button>
            );
          })}
        </div>
      </motion.div>

      {/* ============ the corridor ============ */}
      <div
        ref={stageRef}
        className="relative z-10 flex-1 min-h-0 overflow-hidden select-none"
        style={{
          // perspective belongs on the element that directly parents the 3D
          // world — anything flat in between kills it.
          perspective: persp ? `${persp}px` : undefined,
          perspectiveOrigin: "50% 45%",
          touchAction: "pan-y",
          cursor: dragging ? "grabbing" : "grab",
        }}
        onPointerDown={onPointerDown}
        onWheel={onWheel}
      >
        {cardW > 0 && (
          /* No opacity animation on this node: an opacity below 1 forces the
             browser to flatten the whole 3D subtree, which would collapse the
             corridor and then pop it back at the end of the fade. The entrance
             is carried by the curtain and the rotation swing instead. */
          <div className="absolute inset-0" style={{ transformStyle: "preserve-3d" }}>
            {/* --- floor --- */}
            <div
              className="absolute left-1/2 top-1/2 pointer-events-none"
              style={{
                width: radius * 2.9,
                height: radius * 2.9,
                marginLeft: -radius * 1.45,
                marginTop: -radius * 1.45,
                transform: `rotateX(90deg) translateZ(${-cardH / 2 - 4}px)`,
                background: `radial-gradient(ellipse at center, ${withAlpha(focusedColor, 0.1)} 0%, rgba(200,160,67,0.07) 26%, rgba(30,22,12,0.05) 48%, transparent 68%)`,
                transition: "background 1s ease",
              }}
            />
            {/* --- ceiling --- */}
            <div
              className="absolute left-1/2 top-1/2 pointer-events-none"
              style={{
                width: radius * 2.9,
                height: radius * 2.9,
                marginLeft: -radius * 1.45,
                marginTop: -radius * 1.45,
                transform: `rotateX(-90deg) translateZ(${-cardH * 0.85}px)`,
                background:
                  "radial-gradient(ellipse at center, rgba(0,0,0,0.75) 0%, rgba(0,0,0,0.45) 40%, transparent 70%)",
              }}
            />

            {/* --- the rotating ring --- */}
            <motion.div
              className="absolute left-1/2 top-1/2"
              style={{ transformStyle: "preserve-3d", rotateY: rot }}
            >
              {placements.map((p, i) => (
                <Altar
                  key={p.faction.id}
                  p={p}
                  rot={rot}
                  radius={radius}
                  cardW={cardW}
                  cardH={cardH}
                  isFocused={i === focusedIndex}
                  reduce={reduce}
                  onActivate={() => {
                    if (movedRef.current) return;
                    if (i === focusedIndex) {
                      playSound("select");
                      setSelected(p.faction);
                    } else {
                      goTo(i);
                    }
                  }}
                />
              ))}

              {dividers.map((d) => (
                <Pillar key={`div-${d.next}`} d={d} rot={rot} radius={radius} cardH={cardH} />
              ))}
            </motion.div>
          </div>
        )}

        {/* --- corridor walls: flat overlays that frame the 3D space --- */}
        <div
          className="absolute inset-y-0 left-0 w-[18%] max-w-[220px] pointer-events-none"
          style={{ background: "linear-gradient(90deg, rgba(5,4,3,0.92), transparent)" }}
        />
        <div
          className="absolute inset-y-0 right-0 w-[18%] max-w-[220px] pointer-events-none"
          style={{ background: "linear-gradient(270deg, rgba(5,4,3,0.92), transparent)" }}
        />
        <div
          className="absolute inset-x-0 top-0 h-[22%] pointer-events-none"
          style={{ background: "linear-gradient(180deg, rgba(5,4,3,0.85), transparent)" }}
        />
        <div
          className="absolute inset-x-0 bottom-0 h-[26%] pointer-events-none"
          style={{ background: "linear-gradient(0deg, rgba(5,4,3,0.9), transparent)" }}
        />

        {/* --- depth haze drifting through the corridor --- */}
        {!reduce && (
          <div className="absolute inset-0 pointer-events-none overflow-hidden">
            <div
              className="absolute -inset-x-[25%] top-[38%] h-[46%] mist-layer"
              style={{
                background: `radial-gradient(ellipse, ${withAlpha(focusedColor, 0.07)} 0%, transparent 70%)`,
                filter: "blur(30px)",
              }}
            />
            <div
              className="absolute -inset-x-[25%] top-[56%] h-[44%] mist-layer"
              style={{
                background: "radial-gradient(ellipse, rgba(200,160,67,0.05) 0%, transparent 70%)",
                filter: "blur(34px)",
                animationDelay: "9s",
              }}
            />
          </div>
        )}

        {/* --- ambient embers --- */}
        {!reduce && (
          <div className="absolute inset-0 pointer-events-none overflow-hidden">
            {Array.from({ length: 14 }).map((_, i) => (
              <span
                key={i}
                className="float-particle absolute rounded-full"
                style={{
                  left: `${6 + i * 6.6}%`,
                  bottom: "6%",
                  width: i % 3 === 0 ? 2 : 1,
                  height: i % 3 === 0 ? 2 : 1,
                  background: i % 2 ? "#e8dfc8" : "#c8a043",
                  boxShadow: `0 0 ${i % 3 === 0 ? 7 : 3}px rgba(200,160,67,${i % 3 === 0 ? 0.6 : 0.3})`,
                  animationDuration: `${12 + (i % 5) * 2.2}s`,
                  animationDelay: `${i * 0.66}s`,
                  opacity: 0.45,
                  ["--dx" as string]: `${(i % 2 ? 1 : -1) * (16 + (i % 4) * 9)}px`,
                }}
              />
            ))}
          </div>
        )}

        {/* --- hint --- */}
        {ready && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.4 }}
            transition={{ delay: reduce ? 0 : 1.9, duration: 0.8 }}
            className="absolute top-2 left-1/2 -translate-x-1/2 text-center pointer-events-none px-4"
          >
            <span className="font-cinzel text-[#c9b896] text-[9px] sm:text-[11px] tracking-[0.32em] whitespace-nowrap">
              ◆ 拖拽巡廊 · 点击前方祭坛深入 ◆
            </span>
          </motion.div>
        )}
      </div>

      {/* ============ footer: HUD + controls (never overlaps the ring) ======= */}
      <div className="relative z-30 shrink-0 px-3 pb-2 pt-1">
        <div className="relative min-h-[86px] sm:min-h-[96px] flex flex-col items-center justify-end gap-2">
          <AnimatePresence mode="wait">
            <motion.div
              key={focused.faction.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.32 }}
              className="text-center pointer-events-none w-full max-w-[680px]"
            >
              <div
                className="inline-flex items-center gap-2 px-3 py-1 rounded-full mb-1"
                style={{
                  background: "rgba(8,6,4,0.78)",
                  border: `1px solid ${withAlpha(focusedColor, 0.6)}`,
                  boxShadow: `0 0 18px ${withAlpha(focusedColor, 0.22)}`,
                }}
              >
                <FactionIcon category={focusedCat} size={13} color={focusedColor} />
                <span
                  className="font-brush text-[13px] leading-none"
                  style={{ color: focusedColor }}
                >
                  {CATEGORY_META[focusedCat].label}
                </span>
                <span className="w-px h-3" style={{ background: withAlpha(focusedColor, 0.45) }} />
                <span className="font-cinzel text-[8px] leading-none tracking-[0.24em] text-[#8a7a5c]">
                  {focused.indexInCat + 1}/{focused.catCount}
                </span>
              </div>
              {/* 势力名统一用 font-caoshu。
                  这里原先没指定字体，中文会落回 Noto Serif SC，
                  和整屏其它中文标题的书法体对不上 —— 看起来就是"字体变了"。
                  分类简介与引言也已移除：它们在详情面板里都有，
                  HUD 上再来一遍只会把这一条挤成一堵字墙。 */}
              <h3
                className="font-caoshu leading-tight"
                style={{
                  fontSize: "clamp(1.35rem, 3.6vw, 2.1rem)",
                  letterSpacing: "0.2em",
                  color: "#f0e7d0",
                  textShadow: `0 0 22px ${withAlpha(focusedColor, 0.35)}, 0 2px 10px rgba(0,0,0,0.9)`,
                }}
              >
                {focused.faction.name}
              </h3>
            </motion.div>
          </AnimatePresence>

          <div className="flex items-center gap-2.5">
            <CircleBtn onClick={goPrev} label="上一势力">
              <path
                d="M10 12L6 8l4-4"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </CircleBtn>
            <button
              onClick={() => {
                setAutoRotate((v) => !v);
                autoRef.current = !autoRef.current;
                settledRef.current = true;
                stopAnim();
                playSound("click");
              }}
              className="px-4 py-1.5 rounded-full text-[11px] font-cinzel tracking-[0.16em] transition-all flex items-center gap-1.5"
              style={{
                background: autoRotate ? "rgba(160,128,48,0.22)" : "rgba(10,8,6,0.8)",
                border: `1px solid ${autoRotate ? "rgba(240,200,98,0.5)" : "rgba(160,128,48,0.4)"}`,
                color: autoRotate ? "#f0c862" : "#c9b896",
              }}
            >
              {autoRotate ? (
                <>
                  <svg width="9" height="9" viewBox="0 0 10 10" fill="currentColor">
                    <rect x="1" y="1" width="3" height="8" />
                    <rect x="6" y="1" width="3" height="8" />
                  </svg>
                  暂停
                </>
              ) : (
                <>
                  <svg width="9" height="9" viewBox="0 0 10 10" fill="currentColor">
                    <path d="M2 1l7 4-7 4V1z" />
                  </svg>
                  巡廊
                </>
              )}
            </button>
            <CircleBtn onClick={goNext} label="下一势力">
              <path
                d="M6 4l4 4-4 4"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </CircleBtn>
            <span className="font-cinzel text-[9px] tracking-[0.28em] text-[#a08030]/70 ml-1 tabular-nums">
              {String(focusedIndex + 1).padStart(2, "0")} / {total}
            </span>
          </div>
        </div>
      </div>

      {/* ============ curtain ============ */}
      {!reduce && (
        <>
          <motion.div
            className="absolute inset-x-0 top-0 h-1/2 z-[70] pointer-events-none origin-top"
            style={{ background: "#000" }}
            initial={{ scaleY: 1 }}
            animate={{ scaleY: 0 }}
            transition={{ duration: 1.3, delay: 0.05, ease: [0.76, 0, 0.24, 1] }}
          />
          <motion.div
            className="absolute inset-x-0 bottom-0 h-1/2 z-[70] pointer-events-none origin-bottom"
            style={{ background: "#000" }}
            initial={{ scaleY: 1 }}
            animate={{ scaleY: 0 }}
            transition={{ duration: 1.3, delay: 0.05, ease: [0.76, 0, 0.24, 1] }}
          />
        </>
      )}

      <AnimatePresence>
        {selected && (
          <FactionDossier
            key={selected.id}
            faction={selected}
            onClose={() => {
              playSound("click");
              setSelected(null);
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

/* ---------------------------------------------------------------- controls */

function CircleBtn({
  onClick,
  label,
  children,
}: {
  onClick: () => void;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      title={label}
      aria-label={label}
      className="w-9 h-9 rounded-full flex items-center justify-center text-[#c9b896] transition-all hover:text-[#f0c862] hover:border-[#c8a043]"
      style={{ background: "rgba(10,8,6,0.8)", border: "1px solid rgba(160,128,48,0.4)" }}
    >
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
        {children}
      </svg>
    </button>
  );
}

/* ------------------------------------------------------------------ altars */

function Altar({
  p,
  rot,
  radius,
  cardW,
  cardH,
  isFocused,
  reduce,
  onActivate,
}: {
  p: Placement;
  rot: MotionValue<number>;
  radius: number;
  cardW: number;
  cardH: number;
  isFocused: boolean;
  reduce: boolean;
  onActivate: () => void;
}) {
  const color = CATEGORY_META[p.cat].color;

  /* Every visual property is a pure function of the shared rotation value —
     no React state, no re-render, one write per frame per property. */
  const dist = useTransform(rot, (r) => frontDistance(p.angle, r));
  const scale = useTransform(dist, (d) => 1 - (d / 180) * 0.32);
  const z = useTransform(dist, (d) => radius + cardW * 0.5 * Math.max(0, 1 - d / 11));
  const lift = useTransform(dist, (d) => -cardH * 0.05 * Math.max(0, 1 - d / 11));
  const opacity = useTransform(dist, (d) => clamp01(1.06 - d / 96));
  const fog = useTransform(dist, (d) => clamp01(d / 82) * 0.92);
  const candle = useTransform(dist, (d) => clamp01(1 - d / 28));
  const rimGlow = useTransform(dist, (d) => clamp01(1 - d / 16));

  return (
    <motion.div
      className="absolute cursor-pointer"
      /* A carousel needs rotate-then-translateZ, which is the opposite of
         framer's default transform order, and handing it a pre-built
         `transform` string is unreliable (an altar sitting at exactly 0deg
         ends up with no transform at all and collapses to the ring's centre).
         `transformTemplate` is the supported way to control the order and it
         runs even when every value is at its default. */
      transformTemplate={({ rotateY, z: tz, y, scale: s }) =>
        `rotateY(${rotateY ?? "0deg"}) translateZ(${tz ?? "0px"}) translateY(${y ?? "0px"}) scale(${s ?? 1})`
      }
      style={{
        width: cardW,
        height: cardH,
        left: -cardW / 2,
        top: -cardH / 2,
        transformStyle: "preserve-3d",
        backfaceVisibility: "hidden",
        rotateY: p.angle,
        z,
        y: lift,
        scale,
        opacity,
      }}
      onClick={() => {
        // Far-side altars are invisible but still hit-testable; ignore them.
        if (dist.get() > 26) return;
        onActivate();
      }}
    >
      {/* ---- floor reflection ---- */}
      <div
        className="absolute left-0 right-0 overflow-hidden pointer-events-none"
        style={{
          top: "100%",
          height: cardH * 0.42,
          transform: "scaleY(-1)",
          opacity: 0.24,
          filter: "blur(2px)",
          maskImage: "linear-gradient(to bottom, transparent 8%, #000 100%)",
          WebkitMaskImage: "linear-gradient(to bottom, transparent 8%, #000 100%)",
        }}
      >
        <img
          src={p.faction.image}
          alt=""
          aria-hidden
          draggable={false}
          loading="lazy"
          decoding="async"
          className="absolute bottom-0 left-0 w-full object-cover"
          style={{ height: cardH }}
        />
        <div className="absolute inset-0" style={{ background: withAlpha(color, 0.25) }} />
      </div>

      {/* ---- candle pool on the floor ---- */}
      {!reduce && (
        <motion.div
          className="absolute left-1/2 -translate-x-1/2 pointer-events-none rounded-full"
          style={{
            bottom: -cardH * 0.06,
            width: cardW * 1.25,
            height: cardH * 0.14,
            background: `radial-gradient(ellipse, ${withAlpha(color, 0.5)} 0%, rgba(240,200,98,0.16) 42%, transparent 74%)`,
            filter: "blur(6px)",
            opacity: candle,
          }}
        />
      )}

      {/* ---- the altar itself ---- */}
      <div
        className="relative w-full h-full overflow-hidden"
        style={{
          // 上圆下方的拱形太"墓碑"了。改成上下都收尖的棱形塔身：
          // 顶点 → 肩 → 腰 → 胯 → 底尖，左右对称。
          clipPath:
            "polygon(50% 0%, 88% 11%, 100% 30%, 100% 70%, 88% 89%, 50% 100%, 12% 89%, 0% 70%, 0% 30%, 12% 11%)",
          background: "linear-gradient(150deg, #2c2418 0%, #191410 52%, #0a0806 100%)",
          border: `1px solid ${isFocused ? withAlpha(color, 0.75) : "rgba(46,39,30,0.7)"}`,
          boxShadow: isFocused
            ? `0 26px 62px rgba(0,0,0,0.8), 0 0 44px ${withAlpha(color, 0.34)}, inset 0 0 0 1px ${withAlpha(color, 0.2)}`
            : "0 14px 34px rgba(0,0,0,0.6)",
          transition: "box-shadow .45s ease, border-color .45s ease",
        }}
      >
        <div
          className="absolute inset-[3px] overflow-hidden bg-[#0a0806]"
          style={{
            clipPath:
              "polygon(50% 0%, 88% 11%, 100% 30%, 100% 70%, 88% 89%, 50% 100%, 12% 89%, 0% 70%, 0% 30%, 12% 11%)",
          }}
        >
          <img
            src={p.faction.image}
            alt={p.faction.name}
            draggable={false}
            loading="lazy"
            decoding="async"
            className="absolute inset-0 w-full h-full object-cover object-top"
          />
          {/* depth fog — the corridor swallows distant altars */}
          <motion.div
            className="absolute inset-0"
            style={{ background: "#080605", opacity: fog }}
          />
          {/* category wash + nameplate scrim */}
          <div
            className="absolute inset-0"
            style={{
              background: `linear-gradient(180deg, ${withAlpha(color, 0.16)} 0%, transparent 34%, rgba(0,0,0,0.55) 74%, rgba(0,0,0,0.92) 100%)`,
            }}
          />
          {/* rim light along the arch, brightest dead ahead */}
          <motion.div
            className="absolute inset-0 pointer-events-none"
            style={{
              borderRadius: "inherit",
              boxShadow: `inset 0 0 26px ${withAlpha(color, 0.55)}, inset 0 2px 0 ${withAlpha("#f0c862", 0.5)}`,
              opacity: rimGlow,
            }}
          />

          {/* 刻意不在牌面上写势力名。
              立绘本身已经印着名字，选中后的 HUD 与详情面板里还各有一次 ——
              原来同一个名字要出现三遍。这里只留一道分类色的底光收口。 */}
          <div
            className="absolute bottom-0 inset-x-0 pointer-events-none"
            style={{
              height: "18%",
              background: `linear-gradient(0deg, ${withAlpha(color, 0.5)} 0%, transparent 100%)`,
              opacity: isFocused ? 0.9 : 0.45,
              transition: "opacity .4s ease",
            }}
          />

          {/* focused frame ticks */}
          {isFocused && (
            <>
              <span
                className="absolute top-1.5 left-1.5 w-3 h-3 border-t border-l"
                style={{ borderColor: withAlpha(color, 0.8) }}
              />
              <span
                className="absolute top-1.5 right-1.5 w-3 h-3 border-t border-r"
                style={{ borderColor: withAlpha(color, 0.8) }}
              />
              <span
                className="absolute bottom-1.5 left-1.5 w-3 h-3 border-b border-l"
                style={{ borderColor: withAlpha(color, 0.8) }}
              />
              <span
                className="absolute bottom-1.5 right-1.5 w-3 h-3 border-b border-r"
                style={{ borderColor: withAlpha(color, 0.8) }}
              />
            </>
          )}
        </div>
      </div>

      {/* ---- votive candles flanking the altar ----
           Two nested nodes on purpose: a CSS @keyframes animation outranks an
           inline declaration for the same property, so the flicker (which
           animates opacity) has to live on a child or it would overwrite the
           distance-driven opacity coming from the motion value. */}
      {!reduce &&
        [-1, 1].map((s) => (
          <motion.span
            key={s}
            className="absolute block pointer-events-none"
            style={{
              width: cardW * 0.09,
              height: cardW * 0.09,
              bottom: cardH * 0.02,
              left: `calc(50% + ${s * cardW * 0.56}px)`,
              marginLeft: -cardW * 0.045,
              opacity: candle,
            }}
          >
            <span
              className="block w-full h-full rounded-full animate-candle"
              style={{
                background:
                  "radial-gradient(circle, #fff3cf 0%, #f0c862 38%, rgba(184,80,20,0) 72%)",
                boxShadow: `0 0 14px ${withAlpha("#f0c862", 0.85)}, 0 0 30px ${withAlpha(color, 0.5)}`,
                animationDelay: `${s > 0 ? 0.6 : 0}s`,
              }}
            />
          </motion.span>
        ))}
    </motion.div>
  );
}

/* -------------------------------------------------- domain boundary pillar */

function Pillar({
  d,
  rot,
  radius,
  cardH,
}: {
  d: Divider;
  rot: MotionValue<number>;
  radius: number;
  cardH: number;
}) {
  const meta = CATEGORY_META[d.next];
  const dist = useTransform(rot, (r) => frontDistance(d.angle, r));
  const opacity = useTransform(dist, (v) => clamp01(1 - v / 62));
  const scale = useTransform(dist, (v) => 1 - (v / 180) * 0.3);
  const h = cardH * 1.4;

  return (
    <motion.div
      className="absolute pointer-events-none"
      transformTemplate={({ rotateY, z: tz, scale: s }) =>
        `rotateY(${rotateY ?? "0deg"}) translateZ(${tz ?? "0px"}) scale(${s ?? 1})`
      }
      style={{
        width: 84,
        height: h,
        left: -42,
        top: -h / 2,
        backfaceVisibility: "hidden",
        rotateY: d.angle,
        z: radius,
        scale,
        opacity,
      }}
    >
      <div
        className="absolute inset-y-0 left-1/2 -translate-x-1/2 w-px"
        style={{
          background: `linear-gradient(180deg, transparent 0%, ${withAlpha(meta.color, 0.4)} 14%, rgba(200,160,67,0.6) 50%, ${withAlpha(meta.color, 0.4)} 86%, transparent 100%)`,
        }}
      />
      <div
        className="absolute top-0 left-1/2 -translate-x-1/2 w-6 h-px"
        style={{
          background: `linear-gradient(90deg, transparent, ${withAlpha(meta.color, 0.6)}, transparent)`,
        }}
      />
      <div
        className="absolute bottom-0 left-1/2 -translate-x-1/2 w-6 h-px"
        style={{
          background: `linear-gradient(90deg, transparent, ${withAlpha(meta.color, 0.6)}, transparent)`,
        }}
      />
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
        <div
          className="w-9 h-9 rotate-45 flex items-center justify-center"
          style={{
            border: `1px solid ${withAlpha(meta.color, 0.7)}`,
            background: "rgba(8,6,4,0.9)",
            boxShadow: `0 0 18px ${withAlpha(meta.color, 0.3)}`,
          }}
        >
          <div className="-rotate-45">
            <FactionIcon category={d.next} size={15} color={meta.color} />
          </div>
        </div>
        <span
          className="font-brush text-[15px] tracking-[0.2em] whitespace-nowrap leading-none"
          style={{ color: meta.color, textShadow: "0 2px 10px rgba(0,0,0,0.95)" }}
        >
          {meta.label}
        </span>
        <span className="font-cinzel text-[6.5px] tracking-[0.3em] text-[#8a7a5c] leading-none">
          {CAT_EN[d.next]}
        </span>
      </div>
    </motion.div>
  );
}

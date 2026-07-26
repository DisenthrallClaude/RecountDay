/* ============================================================================
 * FactionGallery —— 势力分布 · 领地沙盘 (2D ink atlas)
 * ----------------------------------------------------------------------------
 * Layout model
 *   The map lives in a *virtual unit plane* (160x100 landscape / 100x160
 *   portrait).  A ResizeObserver measures the stage once per resize and derives
 *   `unit` = px-per-map-unit; every size on the map (markers, sigils, type) is
 *   expressed as a multiple of `unit`, so the whole atlas scales continuously
 *   from a 380px phone to an ultrawide without a single media query.
 *
 *   Two domain constellations exist — a wide one and a tall one — and the stage
 *   picks whichever matches its own aspect.  That is what keeps 22 markers from
 *   piling on top of each other on a phone.
 *
 * Motion budget
 *   - Parallax runs on MotionValues (never setState), and only for a real mouse.
 *   - Territory ink stains use *static* SVG feTurbulence/feDisplacementMap
 *     filters (rasterised once); the breathing is done on unfiltered siblings so
 *     the filter is never re-evaluated per frame.
 *   - Tension arcs pulse with SMIL (`<animate>`) which runs off the main thread
 *     budget entirely.
 *   - Everything collapses to a plain fade under `prefers-reduced-motion`.
 * ==========================================================================*/

import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import {
  motion,
  AnimatePresence,
  useMotionValue,
  useSpring,
  useTransform,
  useReducedMotion,
} from "framer-motion";
import { FACTIONS, CATEGORY_META, type FactionCategory, type FactionDef } from "../data/factions";
import { FactionIcon, IconExit, IconScroll, IconCompass } from "./Icons";
import { playSound } from "./MainMenu";
import { assetUrl } from "../utils/assetUrl";

/* ------------------------------------------------------------------ shared */

export const CAT_RING: FactionCategory[] = [
  "ORDER",
  "SHADOW",
  "SEEKER",
  "TRANSCENDENT",
  "SANCTUARY",
  "COURIER",
];

/** Latin sub-label per domain — Cinzel only ever renders Latin, never 中文. */
export const CAT_EN: Record<FactionCategory, string> = {
  ORDER: "ORDER",
  SHADOW: "SHADOW",
  SEEKER: "SEEKER",
  TRANSCENDENT: "TRANSCENDENT",
  SANCTUARY: "SANCTUARY",
  COURIER: "COURIER",
};

export const CAT_DESC: Record<FactionCategory, string> = {
  ORDER: "维持秩序、守望监视",
  SHADOW: "潜行暗杀、销毁封印",
  SEEKER: "探索求知、研究古老",
  TRANSCENDENT: "超脱世俗、研究生死",
  SANCTUARY: "庇护迷途、守望互助",
  COURIER: "传递信息、纪念逝者",
};

export const CAT_STYLE_DESC: Record<FactionCategory, string> = {
  ORDER:
    "严谨有序，注重规则与秩序的维护。成员多为守序阵营的中坚力量，以监视与维稳为己任，在混沌中守护叙事的边界。",
  SHADOW:
    "隐秘果决，擅长在暗处行动。以激进手段消除威胁，行动不留痕迹，是叙事世界中令人闻风丧胆的存在。",
  SEEKER: "求知若渴，致力于探索叙事边界与未知领域。他们追寻古老的秘密，试图理解重叙日背后的真相。",
  TRANSCENDENT:
    "超然物外，研究生死与叙事的本质。他们追求超越凡俗的境界，在生死边界寻找叙事的终极意义。",
  SANCTUARY: "慈悲为怀，为迷失者提供庇护与指引。他们不参与纷争，只为乱世中保留一丝温暖与希望。",
  COURIER:
    "四处游走，传递信息与纪念逝者。他们是叙事世界的信使，连接各方势力，保存逝去叙事者的记忆。",
};

/** `#rrggbb` + alpha → rgba(). Clearer than string-concatenating hex suffixes. */
export function withAlpha(hex: string, a: number): string {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${a})`;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/**
 * How strongly a domain's ink should print.
 * TRANSCENDENT's grey has no saturation, so at a shared alpha it reads far
 * brighter than the coloured domains and becomes the loudest thing on the
 * plate. Scaling the stain by saturation puts every territory on equal footing.
 */
function inkWeight(hex: string): number {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16) / 255;
  const g = parseInt(h.slice(2, 4), 16) / 255;
  const b = parseInt(h.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const sat = max === 0 ? 0 : (max - min) / max;
  return 0.55 + 0.45 * sat;
}

/* ------------------------------------------------------------- map geometry */

interface DomainSpec {
  x: number;
  y: number;
  r: number;
}
interface MapSpec {
  w: number;
  h: number;
  /** marker diameter expressed in map units */
  markerU: number;
  dom: Record<FactionCategory, DomainSpec>;
}

/** Wide constellation — desktop / tablet-landscape. */
const MAP_WIDE: MapSpec = {
  w: 160,
  h: 100,
  markerU: 8.6,
  dom: {
    ORDER: { x: 34, y: 28, r: 21 },
    SHADOW: { x: 30, y: 74, r: 22 },
    SEEKER: { x: 126, y: 26, r: 21 },
    TRANSCENDENT: { x: 133, y: 71, r: 20 },
    SANCTUARY: { x: 82, y: 80, r: 19 },
    COURIER: { x: 84, y: 34, r: 19 },
  },
};

/** Tall constellation — phones and portrait tablets. */
const MAP_TALL: MapSpec = {
  w: 100,
  h: 160,
  markerU: 9,
  dom: {
    ORDER: { x: 30, y: 26, r: 21 },
    SEEKER: { x: 74, y: 47, r: 21 },
    SHADOW: { x: 26, y: 74, r: 22 },
    COURIER: { x: 72, y: 100, r: 19 },
    TRANSCENDENT: { x: 30, y: 125, r: 20 },
    SANCTUARY: { x: 74, y: 141, r: 19 },
  },
};

const BY_CAT = CAT_RING.reduce(
  (acc, c) => {
    acc[c] = FACTIONS.filter((f) => f.category === c);
    return acc;
  },
  {} as Record<FactionCategory, FactionDef[]>,
);
const MAX_CAT_COUNT = Math.max(...CAT_RING.map((c) => BY_CAT[c].length));

/** A domain claims ground in proportion to the number of houses it holds. */
function domainRadius(map: MapSpec, cat: FactionCategory): number {
  return map.dom[cat].r * Math.sqrt(BY_CAT[cat].length / MAX_CAT_COUNT);
}

/* --------------------------------------------------------------- relations */

type TensionType = "oppose" | "ally" | "flow";

interface TensionStyle {
  /** seconds for one pulse to travel the arc */
  speed: number;
  /** pulse length as a % of the normalised path */
  seg: number;
  width: number;
  bow: number;
  /** oppose fires two pulses that meet head-on */
  headOn: boolean;
  stroke: string;
}

const TENSION_STYLE: Record<TensionType, TensionStyle> = {
  oppose: { speed: 2.6, seg: 9, width: 0.34, bow: 13, headOn: true, stroke: "#b83030" },
  ally: { speed: 4.6, seg: 14, width: 0.3, bow: 9, headOn: false, stroke: "#c8a043" },
  flow: { speed: 3.2, seg: 5, width: 0.26, bow: 9, headOn: false, stroke: "#8fa7b8" },
};

const TENSION_LEGEND: Array<{ type: TensionType; label: string; en: string; note: string }> = [
  { type: "oppose", label: "对峙", en: "OPPOSE", note: "立场相斥" },
  { type: "ally", label: "结盟", en: "ALLY", note: "互为奥援" },
  { type: "flow", label: "往来", en: "FLOW", note: "信息流转" },
];

const TENSIONS: Array<{ from: FactionCategory; to: FactionCategory; type: TensionType }> = [
  { from: "ORDER", to: "SHADOW", type: "oppose" },
  { from: "SEEKER", to: "TRANSCENDENT", type: "ally" },
  { from: "ORDER", to: "SANCTUARY", type: "ally" },
  { from: "SHADOW", to: "COURIER", type: "flow" },
  { from: "COURIER", to: "SANCTUARY", type: "flow" },
  { from: "SEEKER", to: "COURIER", type: "flow" },
  { from: "TRANSCENDENT", to: "SANCTUARY", type: "ally" },
  { from: "SHADOW", to: "SEEKER", type: "oppose" },
];

const SQUASH = 0.85; // vertical flattening of every territory — reads as ground plane

function blobPath(cx: number, cy: number, r: number, seed: number, wob = 0.13): string {
  const n = 18;
  const pts: Array<[number, number]> = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const rr =
      r * (0.95 + wob * Math.sin(seed + i * 1.7) + wob * 0.4 * Math.cos(seed * 2.3 + i * 0.9));
    pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr * SQUASH]);
  }
  // Catmull-Rom → cubic bezier for an organic, closed outline.
  let d = `M ${pts[0][0].toFixed(2)} ${pts[0][1].toFixed(2)}`;
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n];
    const p1 = pts[i];
    const p2 = pts[(i + 1) % n];
    const p3 = pts[(i + 2) % n];
    const c1x = p1[0] + (p2[0] - p0[0]) / 6;
    const c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6;
    const c2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += ` C ${c1x.toFixed(2)} ${c1y.toFixed(2)}, ${c2x.toFixed(2)} ${c2y.toFixed(2)}, ${p2[0].toFixed(2)} ${p2[1].toFixed(2)}`;
  }
  return d + " Z";
}

/**
 * Markers orbit their domain centre on a ring sized so that neither the domain
 * banner (planted at the territory's north edge) nor the neighbouring markers
 * can ever collide — the phase is chosen per population so no house sits
 * directly under the banner.
 */
function useFactionPositions(map: MapSpec): Record<number, { x: number; y: number }> {
  return useMemo(() => {
    const out: Record<number, { x: number; y: number }> = {};
    CAT_RING.forEach((cat, ci) => {
      const dom = map.dom[cat];
      const list = BY_CAT[cat];
      // four-house domains need a wider orbit than three-house ones for the
      // same edge-to-edge gap between medallions.
      const ring = domainRadius(map, cat) * (list.length === 4 ? 0.6 : 0.62);
      const phase = (list.length === 4 ? Math.PI / 4 : Math.PI / 2) + ci * 0.06;
      list.forEach((f, i) => {
        const a = phase + (i / list.length) * Math.PI * 2;
        out[f.id] = {
          x: clamp(dom.x + Math.cos(a) * ring, 6, map.w - 6),
          y: clamp(dom.y + Math.sin(a) * ring * SQUASH, 7, map.h - 9),
        };
      });
    });
    return out;
  }, [map]);
}

/* ---------------------------------------------------------------- measuring */

export function useBoxSize<T extends HTMLElement>(ref: React.RefObject<T | null>) {
  const [box, setBox] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const apply = (w: number, h: number) =>
      setBox((prev) => (Math.abs(prev.w - w) < 1 && Math.abs(prev.h - h) < 1 ? prev : { w, h }));
    apply(el.clientWidth, el.clientHeight);
    const ro = new ResizeObserver((entries) => {
      const cr = entries[0].contentRect;
      apply(cr.width, cr.height);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return box;
}

/* --------------------------------------------------------- entrance timing */

const BEAT = {
  curtain: 0.05,
  title: 0.35,
  rail: 0.8,
  blob: 0.7,
  arc: 1.15,
  marker: 1.3,
  chrome: 1.95,
};

/* ========================================================================== */

export default function FactionGallery({
  onBack,
  onView3D,
}: {
  onBack: () => void;
  onView3D: () => void;
}) {
  const reduce = useReducedMotion() ?? false;
  const beat = useCallback((v: number) => (reduce ? 0 : v), [reduce]);

  const [selected, setSelected] = useState<FactionDef | null>(null);
  const [focusCat, setFocusCat] = useState<FactionCategory | "ALL">("ALL");

  const stageRef = useRef<HTMLDivElement | null>(null);
  const box = useBoxSize(stageRef);

  // Aspect decides the constellation; nothing downstream feeds back into the
  // measurement, so there is no resize loop.
  const tall = box.w > 0 && (box.w < 620 || box.h / box.w > 0.8);
  const map = tall ? MAP_TALL : MAP_WIDE;
  const unit = box.w > 0 ? Math.min(box.w / map.w, box.h / map.h) : 0;
  const planeW = map.w * unit;
  const planeH = map.h * unit;
  const markerPx = clamp(unit * map.markerU, 32, 92);
  const compact = markerPx < 44;

  const positions = useFactionPositions(map);

  /* ---- parallax (mouse only, MotionValues, never setState) ---- */
  const mx = useMotionValue(0);
  const my = useMotionValue(0);
  const smx = useSpring(mx, { stiffness: 45, damping: 20, mass: 0.6 });
  const smy = useSpring(my, { stiffness: 45, damping: 20, mass: 0.6 });

  const skyX = useTransform(smx, (v) => v * -7);
  const skyY = useTransform(smy, (v) => v * -7);
  const hazeX = useTransform(smx, (v) => v * 5);
  const dialX = useTransform(smx, (v) => v * 11);
  const dialY = useTransform(smy, (v) => v * 11);
  const planeX = useTransform(smx, (v) => v * 20);
  const planeY = useTransform(smy, (v) => v * 20);
  const dustX = useTransform(smx, (v) => v * 34);
  const dustY = useTransform(smy, (v) => v * 34);

  const parallaxOff = selected !== null || reduce;
  const recentre = useCallback(() => {
    mx.set(0);
    my.set(0);
  }, [mx, my]);

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (parallaxOff || e.pointerType !== "mouse") return;
    const r = e.currentTarget.getBoundingClientRect();
    if (!r.width || !r.height) return;
    mx.set(((e.clientX - r.left) / r.width - 0.5) * 2);
    my.set(((e.clientY - r.top) / r.height - 0.5) * 2);
  };

  useEffect(() => {
    if (parallaxOff) recentre();
  }, [parallaxOff, recentre]);

  /* ---- keyboard: Esc backs out one level ---- */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (selected) return; // the dossier handles its own Esc
      if (focusCat !== "ALL") setFocusCat("ALL");
      else onBack();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selected, focusCat, onBack]);

  const pickDomain = (c: FactionCategory) => {
    playSound("click");
    setFocusCat((prev) => (prev === c ? "ALL" : c));
  };

  const focusDom = focusCat === "ALL" ? null : map.dom[focusCat];

  return (
    <div
      className="fixed inset-0 overflow-hidden flex flex-col"
      style={{
        backgroundColor: "#0b0906",
        // 用阵法图当底，而不是接近纯黑的 bg-dark —— 后者太闷，撑不起"势力分布"
        backgroundImage: `url(${assetUrl("images/formation_bg.jpg")})`,
        backgroundSize: "cover",
        backgroundPosition: "center",
        touchAction: "manipulation",
      }}
      onPointerMove={onPointerMove}
      onPointerLeave={recentre}
      onPointerCancel={recentre}
    >
      {/* ============ depth layer 0 · sky, haze, vignette ============ */}
      <motion.div className="absolute inset-0 pointer-events-none" style={{ x: skyX, y: skyY }}>
        <div
          className="absolute -inset-8"
          style={{
            background:
              "radial-gradient(ellipse at 50% 34%, rgba(58,42,22,0.34) 0%, rgba(12,9,6,0.86) 58%, rgba(0,0,0,0.97) 100%)",
          }}
        />
        <div
          className="absolute -inset-8 opacity-[0.22]"
          style={{
            backgroundImage: `url(${assetUrl("textures/parchment.jpg")})`,
            backgroundSize: "cover",
            mixBlendMode: "overlay",
            filter: "blur(2px) contrast(1.2)",
          }}
        />
      </motion.div>

      {/* ============ depth layer 1 · drifting mist ============ */}
      {!reduce && (
        <motion.div
          className="absolute inset-0 pointer-events-none overflow-hidden"
          style={{ x: hazeX }}
        >
          <div
            className="absolute -inset-x-[25%] top-[24%] h-[42%] mist-layer"
            style={{
              background: "radial-gradient(ellipse, rgba(200,160,67,0.07) 0%, transparent 70%)",
              filter: "blur(26px)",
            }}
          />
          <div
            className="absolute -inset-x-[25%] top-[52%] h-[46%] mist-layer"
            style={{
              background: "radial-gradient(ellipse, rgba(58,38,78,0.09) 0%, transparent 70%)",
              filter: "blur(30px)",
              animationDelay: "7s",
            }}
          />
          <div
            className="absolute -inset-x-[25%] top-[68%] h-[40%] mist-layer"
            style={{
              background: "radial-gradient(ellipse, rgba(138,32,32,0.05) 0%, transparent 70%)",
              filter: "blur(34px)",
              animationDelay: "13s",
            }}
          />
        </motion.div>
      )}

      {/* ============ depth layer 2 · scrim ============
           bg-dark.jpg already carries a huge mandala. An extra drawn dial on
           top of it turned the plate into visual noise and swallowed the
           territories, so instead the artwork is pushed back behind a soft
           radial scrim and only a whisper of it survives around the edges. */}
      <motion.div
        className="absolute inset-0 pointer-events-none"
        style={{ x: dialX, y: dialY }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: reduce ? 0.4 : 2.2, delay: beat(0.1) }}
      >
        <div
          className="absolute -inset-10"
          style={{
            background:
              "radial-gradient(ellipse 62% 58% at 50% 48%, rgba(6,5,3,0.9) 0%, rgba(6,5,3,0.74) 46%, rgba(6,5,3,0.3) 76%, transparent 100%)",
          }}
        />
      </motion.div>

      {/* ============ header ============ */}
      <div className="relative z-30 shrink-0 grid grid-cols-[auto_1fr_auto] items-center gap-2 px-3 sm:px-7 pt-3 sm:pt-4">
        <motion.button
          initial={{ opacity: 0, x: -14 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.6, delay: beat(BEAT.title + 0.2) }}
          onClick={() => {
            playSound("click");
            onBack();
          }}
          className="group flex items-center gap-1.5 text-[#c9b896] hover:text-[#e8dfc8] transition-colors"
        >
          <IconExit size={13} color="currentColor" />
          <span className="font-cinzel text-[11px] sm:text-xs tracking-[0.18em] group-hover:-translate-x-0.5 transition-transform">
            返回<span className="hidden sm:inline">主菜单</span>
          </span>
        </motion.button>

        {/* inline-block so the illuminated band hugs the title instead of
            stretching the full width of the 1fr grid column */}
        <div className="relative text-center min-w-0 inline-block justify-self-center max-w-full">
          <motion.div
            initial={{ scaleX: 0, opacity: 0 }}
            animate={{ scaleX: 1, opacity: 1 }}
            transition={{
              duration: reduce ? 0.3 : 1.1,
              delay: beat(BEAT.title),
              ease: [0.16, 1, 0.3, 1],
            }}
            className="absolute -inset-x-3 sm:-inset-x-8 -inset-y-1 -z-10"
            style={{
              background:
                "linear-gradient(180deg, rgba(40,28,14,0) 0%, rgba(74,52,24,0.4) 48%, rgba(40,28,14,0) 100%)",
              borderTop: "1px solid rgba(160,128,48,0.24)",
              borderBottom: "1px solid rgba(160,128,48,0.24)",
            }}
          />
          <motion.h2
            initial={{ opacity: 0, filter: "blur(9px)", letterSpacing: "0.75em" }}
            animate={{ opacity: 1, filter: "blur(0px)", letterSpacing: "0.26em" }}
            transition={{
              duration: reduce ? 0.3 : 1.3,
              delay: beat(BEAT.title + 0.1),
              ease: [0.16, 1, 0.3, 1],
            }}
            className="font-caoshu text-ink-gradient whitespace-nowrap leading-[1.15]"
            style={{ fontSize: "clamp(1.55rem, 5.4vw, 3.05rem)", fontWeight: 400 }}
          >
            势力分布
          </motion.h2>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.7, delay: beat(BEAT.title + 0.5) }}
            className="flex items-center justify-center gap-2 mt-0.5"
          >
            <span className="block w-6 sm:w-14 h-px bg-gradient-to-r from-transparent to-[#a08030]" />
            <span className="font-cinzel text-[8px] sm:text-[10px] text-[#a08030] tracking-[0.3em] sm:tracking-[0.42em] whitespace-nowrap">
              FACTION ATLAS
            </span>
            <span className="block w-6 sm:w-14 h-px bg-gradient-to-l from-transparent to-[#a08030]" />
          </motion.div>
        </div>

        <motion.button
          initial={{ opacity: 0, x: 14 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.6, delay: beat(BEAT.title + 0.2) }}
          onClick={() => {
            playSound("click");
            onView3D();
          }}
          className="group flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-full border border-[#a08030]/45 text-[#c9b896] hover:border-[#c8a043] hover:bg-[#a08030]/12 hover:text-[#f0c862] transition-all"
          title="切换到 3D 环廊视图"
        >
          <svg
            width="13"
            height="13"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.3"
            className="group-hover:rotate-180 transition-transform duration-700 shrink-0"
          >
            <ellipse cx="12" cy="12" rx="10" ry="4" />
            <ellipse cx="12" cy="12" rx="10" ry="4" transform="rotate(60 12 12)" />
            <ellipse cx="12" cy="12" rx="10" ry="4" transform="rotate(120 12 12)" />
          </svg>
          <span className="font-cinzel text-[10px] sm:text-[11px] tracking-[0.14em] whitespace-nowrap">
            3D
          </span>
          <span className="hidden sm:inline font-cinzel text-[11px] tracking-[0.14em] -ml-1">
            环廊
          </span>
        </motion.button>
      </div>

      {/* ============ domain rail ============ */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: beat(BEAT.rail) }}
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
          <RailChip
            active={focusCat === "ALL"}
            color="#c8a043"
            label="全境"
            en="ALL"
            count={FACTIONS.length}
            onClick={() => {
              playSound("click");
              setFocusCat("ALL");
            }}
          />
          {CAT_RING.map((c) => (
            <RailChip
              key={c}
              active={focusCat === c}
              color={CATEGORY_META[c].color}
              label={CATEGORY_META[c].label}
              en={CAT_EN[c]}
              count={BY_CAT[c].length}
              icon={
                <FactionIcon
                  category={c}
                  size={11}
                  color={focusCat === c ? CATEGORY_META[c].color : "#8a7a5c"}
                />
              }
              onClick={() => pickDomain(c)}
            />
          ))}
        </div>
      </motion.div>

      {/* ============ the sandbox ============ */}
      <div ref={stageRef} className="relative z-10 flex-1 min-h-0 overflow-hidden px-1 sm:px-3">
        {unit > 0 && (
          <motion.div
            className="absolute"
            style={{
              left: "50%",
              top: "50%",
              width: planeW,
              height: planeH,
              marginLeft: -planeW / 2,
              marginTop: -planeH / 2,
              x: planeX,
              y: planeY,
            }}
            initial={{ opacity: 0, scale: reduce ? 1 : 1.09 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{
              duration: reduce ? 0.4 : 1.8,
              delay: beat(0.25),
              ease: [0.16, 1, 0.3, 1],
            }}
          >
            {/* ---- ink territories + relation arcs ---- */}
            <svg viewBox={`0 0 ${map.w} ${map.h}`} className="absolute inset-0 w-full h-full">
              <defs>
                {/* Static turbulence: rasterised once, never re-evaluated. */}
                <filter id="fg-ink-heavy" x="-30%" y="-30%" width="160%" height="160%">
                  <feTurbulence
                    type="fractalNoise"
                    baseFrequency="0.8 0.95"
                    numOctaves="3"
                    seed="17"
                    result="n"
                  />
                  <feDisplacementMap
                    in="SourceGraphic"
                    in2="n"
                    scale="1.8"
                    xChannelSelector="R"
                    yChannelSelector="G"
                  />
                </filter>
                <filter id="fg-ink-light" x="-25%" y="-25%" width="150%" height="150%">
                  <feTurbulence
                    type="fractalNoise"
                    baseFrequency="1.6 1.9"
                    numOctaves="2"
                    seed="43"
                    result="n"
                  />
                  <feDisplacementMap
                    in="SourceGraphic"
                    in2="n"
                    scale="0.8"
                    xChannelSelector="R"
                    yChannelSelector="G"
                  />
                </filter>

                {CAT_RING.map((c) => (
                  <radialGradient key={c} id={`fg-dom-${c}`} cx="50%" cy="50%" r="50%">
                    <stop offset="0%" stopColor={CATEGORY_META[c].color} stopOpacity="0.4" />
                    <stop offset="42%" stopColor={CATEGORY_META[c].color} stopOpacity="0.16" />
                    <stop offset="78%" stopColor={CATEGORY_META[c].color} stopOpacity="0.05" />
                    <stop offset="100%" stopColor={CATEGORY_META[c].color} stopOpacity="0" />
                  </radialGradient>
                ))}
                {/* one light-pool per domain, always declared so an exiting
                    <g> never loses its paint mid-fade */}
                {CAT_RING.map((c) => (
                  <radialGradient
                    key={`pool-${c}`}
                    id={`fg-pool-${c}`}
                    gradientUnits="userSpaceOnUse"
                    cx={map.dom[c].x}
                    cy={map.dom[c].y}
                    r={map.dom[c].r * 2.5}
                  >
                    <stop offset="0%" stopColor="#000" stopOpacity="0" />
                    <stop offset="46%" stopColor="#000" stopOpacity="0.28" />
                    <stop offset="100%" stopColor="#050403" stopOpacity="0.8" />
                  </radialGradient>
                ))}
              </defs>

              {/* territories */}
              {CAT_RING.map((c, i) => {
                const dom = map.dom[c];
                const r = domainRadius(map, c);
                const dim = focusCat !== "ALL" && focusCat !== c;
                const col = CATEGORY_META[c].color;
                const w = inkWeight(col);
                return (
                  <motion.g
                    key={c}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: reduce ? 0.3 : 1.5, delay: beat(BEAT.blob + i * 0.11) }}
                  >
                    {/* `dim` is a state change, not part of the entrance: it must
                        never inherit the entrance delay, so it lives on a nested
                        plain <g> driven by a CSS transition. */}
                    <g style={{ opacity: dim ? 0.28 : 1, transition: "opacity .5s ease" }}>
                      {/* soft ground pool — unfiltered, breathes */}
                      <motion.ellipse
                        cx={dom.x}
                        cy={dom.y}
                        rx={r * 1.12}
                        ry={r * SQUASH * 1.12}
                        fill={`url(#fg-dom-${c})`}
                        style={{ transformOrigin: `${dom.x}px ${dom.y}px` }}
                        animate={reduce ? undefined : { scale: [1, 1.045, 0.985, 1] }}
                        transition={{
                          duration: 11 + i * 1.6,
                          repeat: Infinity,
                          ease: "easeInOut",
                          delay: i * 0.9,
                        }}
                      />
                      {/* ink stain — heavy displacement, static filter */}
                      <g filter="url(#fg-ink-heavy)" opacity={0.5}>
                        <path
                          d={blobPath(dom.x, dom.y, r, i * 1.7 + 0.3)}
                          fill={withAlpha(col, 0.15 * w)}
                        />
                      </g>
                      {/* stain edge */}
                      <g filter="url(#fg-ink-light)">
                        <path
                          d={blobPath(dom.x, dom.y, r * 0.97, i * 2.9 + 1.4, 0.13)}
                          fill="none"
                          stroke={withAlpha(col, 0.55 * w)}
                          strokeWidth="0.3"
                        />
                        <path
                          d={blobPath(dom.x, dom.y, r * 0.6, i * 2.1 + 1.1, 0.2)}
                          fill={withAlpha(col, 0.1 * w)}
                          stroke={withAlpha(col, 0.24 * w)}
                          strokeWidth="0.16"
                        />
                      </g>
                      {/* splatter — the ink that jumped the border.
                        One shared filter region for all seven dots. */}
                      <g filter="url(#fg-ink-light)">
                        {Array.from({ length: 7 }).map((_, k) => {
                          const a = (k / 7) * Math.PI * 2 + i * 1.3;
                          const rr = r * (1.02 + ((k * 37) % 11) / 44);
                          const dotR = 0.22 + ((k * 53) % 7) / 22;
                          return (
                            <circle
                              key={k}
                              cx={dom.x + Math.cos(a) * rr}
                              cy={dom.y + Math.sin(a) * rr * SQUASH}
                              r={dotR}
                              fill={withAlpha(col, 0.42 * w)}
                            />
                          );
                        })}
                      </g>
                      {/* inner survey ring */}
                      {!reduce && (
                        <circle
                          cx={dom.x}
                          cy={dom.y}
                          r={r * 0.42}
                          fill="none"
                          stroke={withAlpha(col, 0.26)}
                          strokeWidth="0.14"
                          strokeDasharray="0.7 1.5"
                        >
                          <animate
                            attributeName="stroke-dashoffset"
                            values="0;-22"
                            dur={`${16 + i * 3}s`}
                            repeatCount="indefinite"
                          />
                        </circle>
                      )}
                    </g>
                  </motion.g>
                );
              })}

              {/* relation arcs */}
              {TENSIONS.map((t, i) => {
                const a = map.dom[t.from];
                const b = map.dom[t.to];
                const dx = b.x - a.x;
                const dy = b.y - a.y;
                const len = Math.hypot(dx, dy) || 1;
                const st = TENSION_STYLE[t.type];
                // Arcs used to run centre-to-centre, so they sliced straight
                // through the territories and their houses and read as random
                // laser streaks. They now start and stop just outside each
                // territory's ink, which is what makes them read as links.
                const ux = dx / len;
                const uy = dy / len;
                const ta = domainRadius(map, t.from) * 0.72;
                const tb = domainRadius(map, t.to) * 0.72;
                const ax = a.x + ux * ta;
                const ay = a.y + uy * ta * SQUASH;
                const bx = b.x - ux * tb;
                const by = b.y - uy * tb * SQUASH;
                const cx = (ax + bx) / 2 + -uy * st.bow;
                const cy = (ay + by) / 2 + ux * st.bow;
                const d = `M ${ax} ${ay} Q ${cx} ${cy} ${bx} ${by}`;
                const lit = focusCat === "ALL" || focusCat === t.from || focusCat === t.to;
                return (
                  <g
                    key={`${t.from}-${t.to}`}
                    style={{ transition: "opacity .45s ease" }}
                    opacity={lit ? 1 : 0.1}
                  >
                    {/* end caps anchor each arc to its territory */}
                    <motion.g
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ duration: 0.7, delay: beat(BEAT.arc + 0.5 + i * 0.07) }}
                    >
                      <circle
                        cx={ax}
                        cy={ay}
                        r={st.width * 1.5}
                        fill={withAlpha(st.stroke, 0.85)}
                      />
                      <circle
                        cx={bx}
                        cy={by}
                        r={st.width * 1.5}
                        fill={withAlpha(st.stroke, 0.85)}
                      />
                    </motion.g>
                    <motion.path
                      d={d}
                      fill="none"
                      stroke={withAlpha(st.stroke, 0.6)}
                      strokeWidth={st.width}
                      strokeLinecap="round"
                      initial={{ pathLength: 0, opacity: 0 }}
                      animate={{ pathLength: 1, opacity: 1 }}
                      transition={{
                        duration: reduce ? 0.3 : 1.4,
                        delay: beat(BEAT.arc + i * 0.07),
                        ease: "easeInOut",
                      }}
                    />
                    {!reduce && (
                      <motion.g
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ duration: 1, delay: beat(BEAT.arc + 0.9 + i * 0.07) }}
                      >
                        {/* A travelling pulse is built from three concentric
                            strokes rather than a Gaussian blur — an SMIL-animated
                            filter would have to re-rasterise every frame. */}
                        {(st.headOn ? ["100;0", "0;100"] : ["100;0"]).map((values, k) => (
                          <g key={k}>
                            <path
                              d={d}
                              pathLength={100}
                              fill="none"
                              stroke={withAlpha(st.stroke, 0.13)}
                              strokeWidth={st.width * 4.2}
                              strokeLinecap="round"
                              strokeDasharray={`${st.seg} ${100 - st.seg}`}
                            >
                              <animate
                                attributeName="stroke-dashoffset"
                                values={values}
                                dur={`${st.speed}s`}
                                repeatCount="indefinite"
                              />
                            </path>
                            <path
                              d={d}
                              pathLength={100}
                              fill="none"
                              stroke={withAlpha(st.stroke, 0.62)}
                              strokeWidth={st.width * 1.6}
                              strokeLinecap="round"
                              strokeDasharray={`${st.seg} ${100 - st.seg}`}
                            >
                              <animate
                                attributeName="stroke-dashoffset"
                                values={values}
                                dur={`${st.speed}s`}
                                repeatCount="indefinite"
                              />
                            </path>
                            <path
                              d={d}
                              pathLength={100}
                              fill="none"
                              stroke="#f7ecd2"
                              strokeWidth={st.width * 0.7}
                              strokeLinecap="round"
                              strokeDasharray={`${st.seg * 0.42} ${100 - st.seg * 0.42}`}
                              opacity={0.55}
                            >
                              <animate
                                attributeName="stroke-dashoffset"
                                values={values}
                                dur={`${st.speed}s`}
                                repeatCount="indefinite"
                              />
                            </path>
                          </g>
                        ))}
                      </motion.g>
                    )}
                  </g>
                );
              })}

              {/* light pooling — everything outside the focused domain sinks */}
              <AnimatePresence>
                {focusDom && (
                  <motion.g
                    key={focusCat}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.55 }}
                  >
                    <rect
                      x="0"
                      y="0"
                      width={map.w}
                      height={map.h}
                      fill={`url(#fg-pool-${focusCat})`}
                    />
                    <ellipse
                      cx={focusDom.x}
                      cy={focusDom.y}
                      rx={focusDom.r * 1.5}
                      ry={focusDom.r * SQUASH * 1.5}
                      fill={withAlpha(CATEGORY_META[focusCat as FactionCategory].color, 0.09)}
                    />
                  </motion.g>
                )}
              </AnimatePresence>
            </svg>

            {/* ---- domain banners ---- */}
            {CAT_RING.map((c, i) => {
              const dom = map.dom[c];
              const r = domainRadius(map, c);
              const dim = focusCat !== "ALL" && focusCat !== c;
              return (
                <DomainBanner
                  key={c}
                  cat={c}
                  active={focusCat === c}
                  dim={dim}
                  compact={compact}
                  unit={unit}
                  left={dom.x * unit}
                  top={(dom.y - r * 0.82) * unit}
                  sigilPx={Math.max(r * 1.25 * unit, 40)}
                  centreTop={dom.y * unit}
                  delay={beat(BEAT.blob + 0.5 + i * 0.09)}
                  reduce={reduce}
                  onClick={() => pickDomain(c)}
                />
              );
            })}

            {/* ---- houses ---- */}
            {CAT_RING.map((c, ci) =>
              BY_CAT[c].map((f, fi) => {
                const pos = positions[f.id];
                if (!pos) return null;
                return (
                  <FactionMarker
                    key={f.id}
                    faction={f}
                    left={pos.x * unit}
                    top={pos.y * unit}
                    size={markerPx}
                    compact={compact}
                    color={CATEGORY_META[f.category].color}
                    dim={focusCat !== "ALL" && focusCat !== f.category}
                    lit={focusCat === f.category}
                    flip={pos.y > map.h * 0.68}
                    delay={beat(BEAT.marker + ci * 0.09 + fi * 0.05)}
                    reduce={reduce}
                    onSelect={() => {
                      playSound("select");
                      setSelected(f);
                    }}
                  />
                );
              }),
            )}
          </motion.div>
        )}

        {/* foreground dust — fastest parallax layer */}
        {!reduce && (
          <motion.div
            className="absolute inset-0 pointer-events-none overflow-hidden"
            style={{ x: dustX, y: dustY }}
          >
            {Array.from({ length: 16 }).map((_, i) => (
              <span
                key={i}
                className="float-particle absolute rounded-full"
                style={{
                  left: `${4 + i * 6.1}%`,
                  bottom: "4%",
                  width: i % 3 === 0 ? 2 : 1,
                  height: i % 3 === 0 ? 2 : 1,
                  background: i % 2 ? "#e8dfc8" : "#c8a043",
                  boxShadow: `0 0 ${i % 3 === 0 ? 7 : 3}px rgba(200,160,67,${i % 3 === 0 ? 0.65 : 0.3})`,
                  animationDuration: `${11 + (i % 5) * 2.4}s`,
                  animationDelay: `${i * 0.62}s`,
                  opacity: 0.5,
                  ["--dx" as string]: `${(i % 2 ? 1 : -1) * (18 + (i % 4) * 9)}px`,
                }}
              />
            ))}
          </motion.div>
        )}

        {/* edge vignette so markers never touch a hard screen edge */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              "radial-gradient(ellipse at 50% 50%, transparent 52%, rgba(5,4,3,0.55) 88%, rgba(5,4,3,0.85) 100%)",
          }}
        />
      </div>

      {/* ============ footer · hint + relation legend ============ */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, delay: beat(BEAT.chrome) }}
        className="relative z-30 shrink-0 flex items-end justify-between gap-3 px-3 sm:px-6 pb-2 pt-1"
      >
        <div className="flex items-center gap-2 min-w-0">
          <IconCompass size={13} color="#8a7a5c" />
          <span className="font-cinzel text-[8px] tracking-[0.3em] text-[#a08030]/80 hidden sm:inline">
            N
          </span>
          <span className="text-[9px] sm:text-[10px] text-[#c9b896]/45 tracking-[0.1em] truncate">
            {focusCat === "ALL"
              ? "点选领徽聚焦疆域 · 点选家徽阅读卷宗"
              : `${CATEGORY_META[focusCat].label}疆域 · 再次点选领徽返回全境`}
          </span>
        </div>
        <TensionLegend compact={compact} />
      </motion.div>

      {/* ============ cinematic curtain ============ */}
      {!reduce && (
        <>
          <motion.div
            className="absolute inset-x-0 top-0 h-1/2 z-[70] pointer-events-none origin-top"
            style={{ background: "linear-gradient(180deg,#000 60%,#050403 100%)" }}
            initial={{ scaleY: 1 }}
            animate={{ scaleY: 0 }}
            transition={{ duration: 1.35, delay: BEAT.curtain, ease: [0.76, 0, 0.24, 1] }}
          />
          <motion.div
            className="absolute inset-x-0 bottom-0 h-1/2 z-[70] pointer-events-none origin-bottom"
            style={{ background: "linear-gradient(0deg,#000 60%,#050403 100%)" }}
            initial={{ scaleY: 1 }}
            animate={{ scaleY: 0 }}
            transition={{ duration: 1.35, delay: BEAT.curtain, ease: [0.76, 0, 0.24, 1] }}
          />
          <motion.div
            className="absolute inset-x-0 top-1/2 h-px z-[71] pointer-events-none"
            style={{
              background:
                "linear-gradient(90deg, transparent, rgba(240,200,98,0.95) 50%, transparent)",
            }}
            initial={{ opacity: 0, scaleX: 0.15 }}
            animate={{ opacity: [0, 1, 0], scaleX: [0.15, 1, 1] }}
            transition={{
              duration: 1.5,
              times: [0, 0.28, 1],
              delay: BEAT.curtain,
              ease: "easeOut",
            }}
          />
        </>
      )}

      <AnimatePresence>
        {selected && (
          <FactionDossier
            key={selected.id}
            faction={selected}
            originX={((positions[selected.id]?.x ?? map.w / 2) / map.w - 0.5) * 2}
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

/* ------------------------------------------------------------------- chips */

function RailChip({
  active,
  color,
  label,
  en,
  count,
  icon,
  onClick,
}: {
  active: boolean;
  color: string;
  label: string;
  en: string;
  count: number;
  icon?: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      title={`${label} · ${count}`}
      className="group relative shrink-0 flex items-center gap-1.5 pl-2.5 pr-2 py-1 rounded-full transition-all duration-300"
      style={{
        border: `1px solid ${active ? withAlpha(color, 0.72) : "rgba(160,128,48,0.2)"}`,
        background: active
          ? `linear-gradient(180deg, ${withAlpha(color, 0.26)}, ${withAlpha(color, 0.08)})`
          : "rgba(10,8,6,0.5)",
        boxShadow: active
          ? `0 0 16px ${withAlpha(color, 0.3)}, inset 0 0 12px ${withAlpha(color, 0.16)}`
          : "none",
      }}
    >
      {icon}
      <span
        className="text-[11px] leading-none tracking-[0.08em] whitespace-nowrap"
        style={{ color: active ? "#f2ead6" : "rgba(201,184,150,0.62)" }}
      >
        {label}
      </span>
      <span
        className="font-cinzel text-[7px] leading-none tracking-[0.22em] hidden md:inline"
        style={{ color: active ? withAlpha(color, 0.95) : "rgba(138,122,92,0.6)" }}
      >
        {en}
      </span>
      <span
        className="font-cinzel text-[9px] leading-none px-1 py-0.5 rounded-full"
        style={{
          background: active ? withAlpha(color, 0.3) : "rgba(160,128,48,0.12)",
          color: active ? "#f0c862" : "rgba(154,138,104,0.85)",
        }}
      >
        {count}
      </span>
    </button>
  );
}

/* --------------------------------------------------------- domain banner */

function DomainBanner({
  cat,
  active,
  dim,
  compact,
  unit,
  left,
  top,
  centreTop,
  sigilPx,
  delay,
  reduce,
  onClick,
}: {
  cat: FactionCategory;
  active: boolean;
  dim: boolean;
  compact: boolean;
  unit: number;
  left: number;
  top: number;
  centreTop: number;
  sigilPx: number;
  delay: number;
  reduce: boolean;
  onClick: () => void;
}) {
  const meta = CATEGORY_META[cat];
  const nameSize = clamp(unit * 2.2, 11, 20);

  return (
    <>
      {/* territory watermark — sits behind the houses, never collides */}
      <motion.div
        className="absolute pointer-events-none"
        style={{
          left,
          top: centreTop,
          width: sigilPx,
          height: sigilPx,
          marginLeft: -sigilPx / 2,
          marginTop: -sigilPx / 2,
        }}
        initial={{ opacity: 0, scale: 0.7 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: reduce ? 0.3 : 1.6, delay, ease: [0.16, 1, 0.3, 1] }}
      >
        <div
          className={reduce ? "" : "animate-rotate-slow"}
          style={{
            width: "100%",
            height: "100%",
            opacity: dim ? 0.05 : active ? 0.2 : 0.11,
            transition: "opacity .5s ease",
          }}
        >
          <FactionIcon category={cat} size={sigilPx} color={meta.color} />
        </div>
      </motion.div>

      {/* The anchor owns the centring translate; the button owns the framer
          transform. Mixing the two on one node makes framer clobber the
          -50%/-50% offset the moment the entrance plays. */}
      <div className="absolute z-20 -translate-x-1/2 -translate-y-1/2" style={{ left, top }}>
        <motion.button
          onClick={onClick}
          className="group relative block"
          initial={{ opacity: 0, y: -10, scale: 0.86 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: reduce ? 0.3 : 0.9, delay, ease: [0.16, 1, 0.3, 1] }}
          aria-pressed={active}
        >
          <div
            className="flex flex-col items-center"
            style={{ opacity: dim ? 0.32 : 1, transition: "opacity .5s ease" }}
          >
            <div
              className="relative flex items-center gap-1.5 px-2 py-1 rounded-[3px] transition-all duration-300"
              style={{
                background: active
                  ? `linear-gradient(180deg, ${withAlpha(meta.color, 0.34)}, rgba(8,6,4,0.92))`
                  : "rgba(8,6,4,0.78)",
                border: `1px solid ${withAlpha(meta.color, active ? 0.85 : 0.4)}`,
                boxShadow: active
                  ? `0 0 22px ${withAlpha(meta.color, 0.45)}, 0 4px 14px rgba(0,0,0,0.7)`
                  : "0 3px 10px rgba(0,0,0,0.6)",
                backdropFilter: "blur(3px)",
                WebkitBackdropFilter: "blur(3px)",
              }}
            >
              {/* banner tails */}
              <span
                className="absolute right-full top-1/2 -translate-y-1/2 block"
                style={{
                  width: clamp(unit * 1.6, 6, 16),
                  height: 1,
                  background: `linear-gradient(90deg, transparent, ${withAlpha(meta.color, 0.75)})`,
                }}
              />
              <span
                className="absolute left-full top-1/2 -translate-y-1/2 block"
                style={{
                  width: clamp(unit * 1.6, 6, 16),
                  height: 1,
                  background: `linear-gradient(270deg, transparent, ${withAlpha(meta.color, 0.75)})`,
                }}
              />
              <FactionIcon
                category={cat}
                size={Math.round(nameSize * 0.78)}
                color={active ? "#f0c862" : meta.color}
              />
              <span
                className="font-brush leading-none whitespace-nowrap"
                style={{
                  fontSize: nameSize,
                  color: active ? "#f4ecd8" : "#e0d5ba",
                  textShadow: "0 1px 6px rgba(0,0,0,0.95)",
                }}
              >
                {meta.label}
              </span>
              {!compact && (
                <span
                  className="font-cinzel leading-none tracking-[0.24em]"
                  style={{
                    fontSize: Math.max(6, nameSize * 0.42),
                    color: withAlpha(meta.color, 0.95),
                  }}
                >
                  {CAT_EN[cat]}
                </span>
              )}
            </div>
            {/* stake driven into the ground */}
            <span
              className="block"
              style={{
                width: 1,
                height: clamp(unit * 1.4, 5, 14),
                background: `linear-gradient(180deg, ${withAlpha(meta.color, 0.7)}, transparent)`,
              }}
            />
          </div>
        </motion.button>
      </div>
    </>
  );
}

/* -------------------------------------------------------------- the houses */

const OCTAGON = "polygon(30% 0%, 70% 0%, 100% 30%, 100% 70%, 70% 100%, 30% 100%, 0% 70%, 0% 30%)";

function FactionMarker({
  faction,
  left,
  top,
  size,
  compact,
  color,
  dim,
  lit,
  flip,
  delay,
  reduce,
  onSelect,
}: {
  faction: FactionDef;
  left: number;
  top: number;
  size: number;
  compact: boolean;
  color: string;
  dim: boolean;
  lit: boolean;
  flip: boolean;
  delay: number;
  reduce: boolean;
  onSelect: () => void;
}) {
  const [hover, setHover] = useState(false);
  const frameStroke = (1.15 / size) * 100;
  const labelSize = clamp(size * 0.24, 9, 14);

  return (
    <motion.button
      onClick={onSelect}
      onPointerEnter={(e) => {
        if (e.pointerType !== "mouse") return;
        playSound("hover");
        setHover(true);
      }}
      onPointerLeave={() => setHover(false)}
      className="group absolute"
      style={{
        left: left - size / 2,
        top: top - size / 2,
        width: size,
        height: size,
        zIndex: hover ? 45 : lit ? 34 : 30,
        // `dim` must react instantly, so it is a CSS transition rather than a
        // framer target that would inherit the staggered entrance delay.
        // left/top glide so switching between the wide and tall constellations
        // (on rotate / window resize) reads as the map redrawing itself.
        filter: dim ? "grayscale(0.9) brightness(0.6)" : "grayscale(0) brightness(1)",
        transition: reduce
          ? "filter .45s ease"
          : "filter .45s ease, left .6s cubic-bezier(0.16,1,0.3,1), top .6s cubic-bezier(0.16,1,0.3,1), width .4s ease, height .4s ease",
      }}
      initial={{ opacity: 0, scale: 0.35, y: reduce ? 0 : size * 0.5 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ duration: reduce ? 0.3 : 0.85, delay, ease: [0.16, 1, 0.3, 1] }}
      aria-label={faction.name}
    >
      <span
        className="absolute inset-0 block"
        style={{ opacity: dim ? 0.26 : 1, transition: "opacity .45s ease" }}
      >
        {/* ground shadow — stays put while the medallion lifts */}
        <span
          className="absolute left-1/2 -translate-x-1/2 pointer-events-none transition-all duration-300 group-hover:opacity-95 group-hover:w-[85%]"
          style={{
            bottom: -size * 0.1,
            width: "62%",
            height: size * 0.16,
            borderRadius: "50%",
            background: "radial-gradient(ellipse, rgba(0,0,0,0.72) 0%, transparent 72%)",
            filter: "blur(2px)",
            opacity: 0.7,
          }}
        />

        {/* halo for the focused domain */}
        {lit && !reduce && (
          <span
            className="absolute inset-[-22%] pointer-events-none rounded-full animate-pulse-soft"
            style={{
              background: `radial-gradient(circle, ${withAlpha(color, 0.3)} 0%, transparent 68%)`,
            }}
          />
        )}

        {/* medallion — the only thing that lifts */}
        <div className="relative w-full h-full transition-transform duration-300 ease-out group-hover:-translate-y-1.5 group-hover:scale-[1.14]">
          <div
            className="absolute inset-0 overflow-hidden"
            style={{
              clipPath: OCTAGON,
              background: "#0a0806",
              boxShadow: hover
                ? `0 10px 22px rgba(0,0,0,0.75), 0 0 26px ${withAlpha(color, 0.6)}`
                : `0 5px 12px rgba(0,0,0,0.65), 0 0 10px ${withAlpha(color, 0.28)}`,
              transition: "box-shadow .3s ease",
            }}
          >
            <img
              src={faction.image}
              alt=""
              loading="lazy"
              decoding="async"
              draggable={false}
              className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
            />
            {/* category rim light + ground shade */}
            <span
              className="absolute inset-0"
              style={{
                background: `radial-gradient(circle at 50% 22%, ${withAlpha(color, 0)} 32%, ${withAlpha(color, 0.5)} 100%)`,
              }}
            />
            <span
              className="absolute inset-0"
              style={{
                background: "linear-gradient(180deg, rgba(0,0,0,0) 45%, rgba(0,0,0,0.62) 100%)",
              }}
            />
            <span
              className="absolute inset-0 transition-opacity duration-300"
              style={{
                background: "linear-gradient(125deg, rgba(255,244,214,0.3) 0%, transparent 42%)",
                opacity: hover ? 0.9 : 0.35,
              }}
            />
          </div>

          {/* ornate frame */}
          <svg
            viewBox="0 0 100 100"
            className="absolute inset-0 w-full h-full pointer-events-none"
            style={{ overflow: "visible" }}
          >
            <polygon
              points="30,0 70,0 100,30 100,70 70,100 30,100 0,70 0,30"
              fill="none"
              stroke={withAlpha(color, hover ? 1 : 0.8)}
              strokeWidth={frameStroke}
              style={{ transition: "stroke .3s ease" }}
            />
            <polygon
              points="30,0 70,0 100,30 100,70 70,100 30,100 0,70 0,30"
              fill="none"
              stroke={withAlpha("#f0c862", hover ? 0.55 : 0.22)}
              strokeWidth={frameStroke * 0.6}
              transform="translate(50,50) scale(0.88) translate(-50,-50)"
              style={{ transition: "stroke .3s ease" }}
            />
            {/* corner nails */}
            {[
              [30, 0],
              [70, 0],
              [100, 30],
              [100, 70],
              [70, 100],
              [30, 100],
              [0, 70],
              [0, 30],
            ].map(([x, y], k) => (
              <circle
                key={k}
                cx={x}
                cy={y}
                r={frameStroke * 1.5}
                fill={withAlpha(color, hover ? 1 : 0.6)}
              />
            ))}
          </svg>

          {/* rotating survey ticks when the domain is focused */}
          {lit && !reduce && (
            <svg
              viewBox="0 0 100 100"
              className="absolute inset-[-16%] w-[132%] h-[132%] pointer-events-none animate-rotate-slow"
            >
              <circle
                cx="50"
                cy="50"
                r="47"
                fill="none"
                stroke={withAlpha(color, 0.5)}
                strokeWidth="0.9"
                strokeDasharray="2 6"
              />
            </svg>
          )}

          {/* category seal */}
          {!compact && (
            <span
              className="absolute flex items-center justify-center rounded-full pointer-events-none"
              style={{
                width: size * 0.36,
                height: size * 0.36,
                right: -size * 0.06,
                bottom: -size * 0.04,
                background: "rgba(6,4,3,0.95)",
                border: `1px solid ${withAlpha(color, hover ? 1 : 0.75)}`,
                boxShadow: hover
                  ? `0 0 12px ${withAlpha(color, 0.65)}`
                  : "0 1px 4px rgba(0,0,0,0.85)",
                transition: "border-color .3s ease, box-shadow .3s ease",
              }}
            >
              <FactionIcon
                category={faction.category}
                size={Math.round(size * 0.21)}
                color={color}
              />
            </span>
          )}
        </div>

        {/* nameplate */}
        <span
          className="absolute left-1/2 -translate-x-1/2 whitespace-nowrap pointer-events-none transition-all duration-300"
          style={{
            top: "104%",
            fontSize: labelSize,
            letterSpacing: "0.08em",
            color: hover || lit ? "#f2ead6" : "#c9b896",
            opacity: dim ? 0 : hover || lit ? 1 : 0.72,
            textShadow: "0 1px 5px rgba(0,0,0,0.95), 0 0 10px rgba(0,0,0,0.8)",
          }}
        >
          {faction.name}
        </span>
      </span>

      {/* quote whisper — flips above the marker for southern territories so it
          never falls off the bottom of the plane */}
      <AnimatePresence>
        {hover && (
          <motion.span
            initial={{ opacity: 0, x: "-50%", y: flip ? 4 : -4, scale: 0.94 }}
            animate={{ opacity: 1, x: "-50%", y: 0, scale: 1 }}
            exit={{ opacity: 0, x: "-50%", scale: 0.94 }}
            transition={{ duration: 0.18 }}
            className="absolute left-1/2 px-2.5 py-1 rounded-[3px] pointer-events-none z-50 block"
            style={{
              top: flip ? undefined : `calc(104% + ${labelSize + 8}px)`,
              bottom: flip ? "112%" : undefined,
              background: "rgba(6,5,3,0.94)",
              border: `1px solid ${withAlpha(color, 0.55)}`,
              boxShadow: `0 6px 18px rgba(0,0,0,0.7), 0 0 14px ${withAlpha(color, 0.22)}`,
              maxWidth: "44vw",
            }}
          >
            <span className="font-brush text-[11px] text-[#e8dfc8] block truncate">
              「{faction.quote}」
            </span>
          </motion.span>
        )}
      </AnimatePresence>
    </motion.button>
  );
}

/* ------------------------------------------------------------- the legend */

function TensionLegend({ compact }: { compact: boolean }) {
  return (
    <div
      className="shrink-0 rounded-[4px] px-2 py-1 sm:px-3 sm:py-1.5 pointer-events-none"
      style={{
        background: "rgba(8,6,4,0.7)",
        border: "1px solid rgba(160,128,48,0.24)",
        boxShadow: "0 6px 18px rgba(0,0,0,0.5)",
        backdropFilter: "blur(4px)",
        WebkitBackdropFilter: "blur(4px)",
      }}
    >
      {!compact && (
        <div className="flex items-center gap-2 mb-1">
          <span className="font-cinzel text-[7px] tracking-[0.32em] text-[#a08030]">
            DOMAIN RELATIONS
          </span>
          <span
            className="flex-1 h-px"
            style={{ background: "linear-gradient(90deg, rgba(160,128,48,0.35), transparent)" }}
          />
        </div>
      )}
      <div className={compact ? "flex items-center gap-2.5" : "flex flex-col gap-0.5"}>
        {TENSION_LEGEND.map((l) => {
          const st = TENSION_STYLE[l.type];
          const count = TENSIONS.filter((t) => t.type === l.type).length;
          return (
            <div key={l.type} className="flex items-center gap-1.5">
              <svg width="26" height="6" viewBox="0 0 26 6" className="shrink-0 overflow-visible">
                <line
                  x1="0"
                  y1="3"
                  x2="26"
                  y2="3"
                  stroke={withAlpha(st.stroke, 0.3)}
                  strokeWidth="1"
                />
                <line
                  x1="0"
                  y1="3"
                  x2="26"
                  y2="3"
                  stroke={st.stroke}
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  pathLength={100}
                  strokeDasharray={`${st.seg} ${100 - st.seg}`}
                >
                  <animate
                    attributeName="stroke-dashoffset"
                    values="100;0"
                    dur={`${st.speed}s`}
                    repeatCount="indefinite"
                  />
                </line>
              </svg>
              <span className="font-brush text-[10px] leading-none text-[#e8dfc8]">{l.label}</span>
              {!compact && (
                <>
                  <span className="font-cinzel text-[6px] tracking-[0.2em] text-[#a08030]/70 leading-none">
                    {l.en}
                  </span>
                  <span className="text-[9px] leading-none text-[#c9b896]/45">{l.note}</span>
                  <span className="font-cinzel text-[8px] leading-none text-[#8a7a5c]/80 ml-auto pl-1">
                    ×{count}
                  </span>
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ==========================================================================
 * FactionDossier —— the dive panel.
 * Shared with the 3D corridor so both screens read identically.
 * The reveal is a scroll being unfurled: the sheet snaps open vertically, ink
 * bleeds across the parchment, then the sections settle in reading order and
 * the hidden win condition breaks its seal last — the dramatic payoff.
 * ==========================================================================*/

export function FactionDossier({
  faction,
  onClose,
  originX = 0,
}: {
  faction: FactionDef;
  onClose: () => void;
  /** -1 … 1 — which side of the screen the card flew in from. */
  originX?: number;
}) {
  const reduce = useReducedMotion() ?? false;
  const cat = CATEGORY_META[faction.category];
  const dir = originX >= 0 ? 1 : -1;
  const panelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose]);

  useEffect(() => {
    panelRef.current?.focus({ preventScroll: true });
  }, []);

  const t = (v: number) => (reduce ? 0 : v);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.32 }}
      className="fixed inset-0 z-[80] flex items-center justify-center p-2 sm:p-6"
      style={{
        perspective: "1900px",
        background: "rgba(4,3,2,0.66)",
        backdropFilter: "blur(16px)",
        WebkitBackdropFilter: "blur(16px)",
      }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={faction.name}
    >
      {/* ink bleeding outward from the centre */}
      <motion.div
        className="absolute inset-0 pointer-events-none"
        initial={{ opacity: 0, scale: 0.5 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: reduce ? 0.3 : 1.1, ease: [0.16, 1, 0.3, 1] }}
        style={{
          background: `radial-gradient(ellipse at 50% 45%, ${withAlpha(cat.color, 0.16)} 0%, transparent 58%)`,
        }}
      />
      {!reduce &&
        Array.from({ length: 10 }).map((_, i) => (
          <span
            key={i}
            className="float-particle absolute rounded-full pointer-events-none"
            style={{
              left: `${9 + i * 8.6}%`,
              bottom: "8%",
              width: 2,
              height: 2,
              background: cat.color,
              boxShadow: `0 0 7px ${cat.color}`,
              animationDuration: `${9 + (i % 4) * 2}s`,
              animationDelay: `${i * 0.55}s`,
              opacity: 0.45,
              ["--dx" as string]: `${(i % 2 ? 1 : -1) * 24}px`,
            }}
          />
        ))}

      <motion.div
        ref={panelRef}
        tabIndex={-1}
        initial={{
          opacity: 0,
          scaleY: reduce ? 1 : 0.04,
          scaleX: reduce ? 1 : 0.82,
          rotateY: reduce ? 0 : dir * 16,
        }}
        animate={{ opacity: 1, scaleY: 1, scaleX: 1, rotateY: 0 }}
        exit={{
          opacity: 0,
          scaleY: reduce ? 1 : 0.08,
          scaleX: reduce ? 1 : 0.9,
          transition: { duration: 0.28 },
        }}
        transition={{
          opacity: { duration: 0.25 },
          scaleX: { duration: reduce ? 0.2 : 0.55, ease: [0.16, 1, 0.3, 1] },
          scaleY: { duration: reduce ? 0.2 : 0.78, delay: t(0.12), ease: [0.16, 1, 0.3, 1] },
          rotateY: { duration: reduce ? 0.2 : 0.9, ease: [0.16, 1, 0.3, 1] },
        }}
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-[1020px] rounded-md sm:rounded-xl overflow-hidden flex flex-col md:flex-row outline-none"
        style={{
          maxHeight: "94dvh",
          transformOrigin: "center",
          background: "linear-gradient(150deg, rgba(24,19,14,0.985) 0%, rgba(9,7,5,0.985) 100%)",
          border: `1px solid ${withAlpha(cat.color, 0.45)}`,
          boxShadow: `0 34px 100px rgba(0,0,0,0.88), 0 0 70px ${withAlpha(cat.color, 0.16)}, inset 0 0 0 1px rgba(240,200,98,0.06)`,
        }}
      >
        {/* scroll rods */}
        <div
          className="absolute top-0 inset-x-0 h-[2px] z-30"
          style={{
            background: `linear-gradient(90deg, transparent, ${withAlpha(cat.color, 0.85)} 50%, transparent)`,
          }}
        />
        <div
          className="absolute bottom-0 inset-x-0 h-[2px] z-30"
          style={{
            background:
              "linear-gradient(90deg, transparent, rgba(160,128,48,0.5) 50%, transparent)",
          }}
        />
        <div
          className="absolute top-0 left-0 w-7 h-7 z-30 pointer-events-none"
          style={{
            borderTop: `1px solid ${withAlpha(cat.color, 0.7)}`,
            borderLeft: `1px solid ${withAlpha(cat.color, 0.7)}`,
          }}
        />
        <div
          className="absolute top-0 right-0 w-7 h-7 z-30 pointer-events-none"
          style={{
            borderTop: `1px solid ${withAlpha(cat.color, 0.7)}`,
            borderRight: `1px solid ${withAlpha(cat.color, 0.7)}`,
          }}
        />
        <div
          className="absolute bottom-0 left-0 w-7 h-7 z-30 pointer-events-none"
          style={{
            borderBottom: "1px solid rgba(160,128,48,0.38)",
            borderLeft: "1px solid rgba(160,128,48,0.38)",
          }}
        />
        <div
          className="absolute bottom-0 right-0 w-7 h-7 z-30 pointer-events-none"
          style={{
            borderBottom: "1px solid rgba(160,128,48,0.38)",
            borderRight: "1px solid rgba(160,128,48,0.38)",
          }}
        />

        {/* ---------------- portrait ---------------- */}
        {/* Portrait: a banner strip above the text on phones, a full-height
            column beside it from md up. The height must come from a class (not
            an inline style) so `md:h-auto` can win and let flex stretch it. */}
        {/* 立绘占主导：桌面端约占面板一半宽度（原来只有 26vw / 320px 上限），
            文字退为右侧的注解栏。 */}
        <div className="relative shrink-0 overflow-hidden self-center md:self-stretch
                        w-[min(70vw,300px)] aspect-[9/16] max-h-[46dvh]
                        md:w-[clamp(320px,38vw,470px)] md:aspect-auto md:max-h-none">
          <div className="absolute inset-0">
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-[0.08] z-10">
              <FactionIcon category={faction.category} size={220} color={cat.color} />
            </div>
            <motion.img
              src={faction.image}
              alt={faction.name}
              draggable={false}
              className="absolute inset-0 w-full h-full object-cover object-top"
              initial={{ scale: reduce ? 1 : 1.16, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: reduce ? 0.3 : 1.5, delay: t(0.2), ease: [0.16, 1, 0.3, 1] }}
            />
            <div
              className="absolute inset-0"
              style={{
                background: `linear-gradient(140deg, ${withAlpha(cat.color, 0.2)} 0%, transparent 46%, ${withAlpha(cat.color, 0.26)} 100%)`,
              }}
            />
            <div
              className="absolute inset-0"
              style={{
                background:
                  "linear-gradient(180deg, rgba(0,0,0,0.35) 0%, transparent 26%, rgba(0,0,0,0.92) 100%)",
              }}
            />
            <div
              className="absolute inset-y-0 right-0 w-16 hidden md:block"
              style={{ background: "linear-gradient(90deg, transparent, rgba(9,7,5,0.9))" }}
            />
          </div>

          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: t(0.35), duration: 0.5 }}
            className="absolute top-3 left-3 z-20 flex items-center gap-1.5 px-2.5 py-1 rounded-full"
            style={{
              background: "rgba(0,0,0,0.72)",
              border: `1px solid ${withAlpha(cat.color, 0.55)}`,
            }}
          >
            <FactionIcon category={faction.category} size={11} color={cat.color} />
            <span className="font-brush text-[11px] leading-none" style={{ color: cat.color }}>
              {cat.label}
            </span>
            <span className="font-cinzel text-[7px] tracking-[0.24em] leading-none text-[#8a7a5c]">
              {CAT_EN[faction.category]}
            </span>
          </motion.div>
        </div>

        {/* ---------------- dossier ---------------- */}
        <div
          className="flex-1 min-h-0 min-w-0 md:max-w-[440px] overflow-y-auto relative p-3.5 sm:p-4.5 custom-scroll-parchment"
          onClick={(e) => e.stopPropagation()}
        >
          <div
            className="absolute inset-0 pointer-events-none opacity-[0.07]"
            style={{
              backgroundImage: `url(${assetUrl("textures/parchment.jpg")})`,
              backgroundSize: "cover",
              mixBlendMode: "overlay",
            }}
          />
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              background: `linear-gradient(165deg, ${withAlpha(cat.color, 0.09)}, transparent 55%)`,
            }}
          />

          <div className="relative z-10 flex flex-col gap-4">
            {/* name */}
            <motion.div
              initial={{ opacity: 0, x: reduce ? 0 : 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: t(0.3), duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
            >
              <h3
                className="text-ink-gradient leading-tight"
                style={{ fontSize: "clamp(1.7rem, 4.6vw, 2.6rem)", letterSpacing: "0.1em" }}
              >
                {faction.name}
              </h3>
              <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                <span
                  className="h-px w-8"
                  style={{ background: `linear-gradient(90deg, ${cat.color}, transparent)` }}
                />
                <span className="font-brush text-[12px] text-[#c9b896]/75">
                  {CAT_DESC[faction.category]}
                </span>
              </div>
            </motion.div>

            {/* creed */}
            <motion.div
              initial={{ opacity: 0, y: reduce ? 0 : 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: t(0.4), duration: 0.5 }}
              className="relative px-4 py-3 rounded-[3px]"
              style={{
                background: `linear-gradient(100deg, ${withAlpha(cat.color, 0.14)}, rgba(0,0,0,0))`,
                borderLeft: `3px solid ${withAlpha(cat.color, 0.75)}`,
              }}
            >
              <span
                className="absolute -top-1 left-2 font-brush text-2xl leading-none select-none"
                style={{ color: withAlpha(cat.color, 0.28) }}
              >
                「
              </span>
              <p
                className="font-brush text-[#e8dfc8] leading-relaxed relative"
                style={{ fontSize: "clamp(15px,2.2vw,18px)" }}
              >
                {faction.quote}
              </p>
            </motion.div>

            {/* lore */}
            <motion.section
              initial={{ opacity: 0, y: reduce ? 0 : 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: t(0.5), duration: 0.5 }}
            >
              <SectionHead
                icon={<IconScroll size={12} color="#c8a043" />}
                zh="势力介绍"
                en="DOSSIER"
                color="#c8a043"
              />
              <p className="text-[13.5px] sm:text-[14px] text-[#ded3b8] leading-[1.95] mt-2">
                {faction.intro}
              </p>
            </motion.section>

            {/* ---- the payoff ---- */}
            <motion.section
              initial={{ opacity: 0, y: reduce ? 0 : 14, filter: reduce ? "none" : "blur(6px)" }}
              animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              transition={{ delay: t(0.72), duration: reduce ? 0.3 : 0.8, ease: [0.16, 1, 0.3, 1] }}
              className="relative rounded-[5px] overflow-hidden"
              style={{
                background:
                  "linear-gradient(150deg, rgba(58,42,14,0.55) 0%, rgba(24,18,8,0.85) 45%, rgba(12,9,5,0.9) 100%)",
                border: "1px solid rgba(240,200,98,0.42)",
                boxShadow: "inset 0 0 34px rgba(240,200,98,0.09), 0 8px 26px rgba(0,0,0,0.55)",
              }}
            >
              {/* gold sweep across the seal */}
              {!reduce && (
                <motion.span
                  className="absolute inset-0 pointer-events-none"
                  style={{
                    background:
                      "linear-gradient(105deg, transparent 32%, rgba(240,200,98,0.3) 50%, transparent 68%)",
                  }}
                  initial={{ x: "-120%" }}
                  animate={{ x: "120%" }}
                  transition={{ delay: t(0.95), duration: 1.25, ease: "easeInOut" }}
                />
              )}
              <div className="relative p-4">
                <div className="flex items-center gap-2 mb-2.5">
                  {/* 原本这里有一枚红色钥匙火漆印。整屏是黑金调，
                      突然插一块饱和的正红非常跳，已去掉，改用一道细金竖线收口。 */}
                  <span
                    className="shrink-0 rounded-full"
                    style={{
                      width: 2,
                      height: 26,
                      background: "linear-gradient(180deg, rgba(240,200,98,0.9), rgba(160,128,48,0.15))",
                    }}
                  />
                  <div className="min-w-0">
                    <div
                      className="font-brush text-[15px] leading-none"
                      style={{ color: "#f0c862" }}
                    >
                      隐藏胜利条件
                    </div>
                    <div className="font-cinzel text-[7.5px] tracking-[0.36em] text-[#a08030] mt-1 leading-none">
                      HIDDEN VICTORY
                    </div>
                  </div>
                  <span
                    className="flex-1 h-px"
                    style={{
                      background: "linear-gradient(90deg, rgba(240,200,98,0.45), transparent)",
                    }}
                  />
                </div>
                <motion.p
                  className="font-serif-display text-[#f5ecd3] leading-[1.85]"
                  style={{
                    fontSize: "clamp(13px,1.7vw,15px)",
                    textShadow: "0 0 18px rgba(240,200,98,0.18)",
                  }}
                  initial={{ opacity: 0, letterSpacing: reduce ? "0.03em" : "0.3em" }}
                  animate={{ opacity: 1, letterSpacing: "0.03em" }}
                  transition={{
                    delay: t(0.9),
                    duration: reduce ? 0.3 : 0.95,
                    ease: [0.16, 1, 0.3, 1],
                  }}
                >
                  {faction.win}
                </motion.p>
              </div>
            </motion.section>

            {/* footnote */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: t(1.05), duration: 0.6 }}
              className="pt-3"
              style={{ borderTop: "1px dashed rgba(160,128,48,0.22)" }}
            >
              <div className="flex items-center gap-1.5 mb-1.5 flex-wrap">
                <FactionIcon category={faction.category} size={10} color="#8a7a5c" />
                <span className="font-cinzel text-[7.5px] text-[#8a7a5c] tracking-[0.3em]">
                  SHARED TRAIT
                </span>
                <span className="text-[10px] text-[#8a7a5c]">{cat.label}阵营共通 · 行事风格</span>
              </div>
              <p className="text-[11px] text-[#c9b896]/45 leading-[1.75]">
                {CAT_STYLE_DESC[faction.category]}
              </p>
            </motion.div>
          </div>
        </div>

        <button
          onClick={onClose}
          aria-label="关闭"
          className="absolute top-2.5 right-2.5 z-40 w-8 h-8 rounded-full flex items-center justify-center transition-all hover:scale-110 hover:border-[#c8a043]"
          style={{ background: "rgba(0,0,0,0.7)", border: "1px solid rgba(160,128,48,0.45)" }}
        >
          <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
            <path d="M2 2l8 8M10 2l-8 8" stroke="#c9b896" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        </button>
      </motion.div>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 0.42 }}
        exit={{ opacity: 0 }}
        transition={{ delay: t(0.8) }}
        className="absolute bottom-1.5 left-1/2 -translate-x-1/2 font-cinzel text-[9px] tracking-[0.34em] text-[#c9b896] pointer-events-none whitespace-nowrap"
      >
        ◆ ESC / 点击空白处返回 ◆
      </motion.div>
    </motion.div>
  );
}

function SectionHead({
  icon,
  zh,
  en,
  color,
}: {
  icon: React.ReactNode;
  zh: string;
  en: string;
  color: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <span
        className="w-1 h-3.5 rounded-sm shrink-0"
        style={{ background: `linear-gradient(180deg, ${color}, #6a5418)` }}
      />
      {icon}
      <span className="font-brush text-[13px] leading-none" style={{ color }}>
        {zh}
      </span>
      <span
        className="font-cinzel text-[7px] tracking-[0.32em] leading-none"
        style={{ color: withAlpha(color, 0.6) }}
      >
        {en}
      </span>
      <span
        className="flex-1 h-px"
        style={{ background: `linear-gradient(90deg, ${withAlpha(color, 0.4)}, transparent)` }}
      />
    </div>
  );
}

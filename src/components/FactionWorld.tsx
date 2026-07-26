/**
 * FactionWorld.tsx —— 势力分布
 * ============================================================================
 * 取代原来的星盘/领地分类图。
 *
 * 两点设计取向：
 *  1. 不再展示"守序/暗影/求知/超然/庇护/传递"这套分类。
 *     玩家在这一屏要认的是 22 个具体势力，而不是先学一套分类学；
 *     类别信息在游戏内自有用处，但不该成为浏览势力的前置门槛。
 *  2. 用一颗真实可转的星球承载据点，让"分布"这件事本身可被操作 ——
 *     拖动、缩放、点选，而不是看一张静态示意图。
 * ============================================================================
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { FACTIONS, type FactionDef } from "../data/factions";
import { FACTION_LINKS, FACTION_SITES } from "../data/factionGeo";
import FactionGlobe from "./FactionGlobe";
import { assetUrl } from "../utils/assetUrl";
import { AudioManager } from "../audio/AudioManager";
import { IconExit } from "./Icons";

type Projected = { id: number; x: number; y: number; vis: boolean };

const GOLD = "#c8a043";
const GOLD_HI = "#f0c862";
const INK = "#e8dfc8";
const MUTE = "#8a7a5c";

export default function FactionWorld({ onBack, onView3D }: { onBack: () => void; onView3D: () => void }) {
  const reduce = !!useReducedMotion();
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [hoveredId, setHoveredId] = useState<number | null>(null);
  const [autoRotate, setAutoRotate] = useState(true);
  const [query, setQuery] = useState("");

  // 据点投影结果写进 ref 而不是 state：它每帧都在变，
  // 走 state 会把整棵树每秒重渲染 60 次。
  const projRef = useRef<Projected[]>([]);
  const labelHost = useRef<HTMLDivElement | null>(null);
  const handleProject = useCallback((pts: Projected[]) => {
    projRef.current = pts;
    const host = labelHost.current;
    if (!host) return;
    for (const p of pts) {
      const el = host.querySelector<HTMLElement>(`[data-site="${p.id}"]`);
      if (!el) continue;
      el.style.transform = `translate3d(${p.x + 13}px, ${p.y - 11}px, 0)`;
      el.style.opacity = p.vis ? "1" : "0";
    }
  }, []);

  const selected = useMemo(
    () => (selectedId != null ? FACTIONS.find((f) => f.id === selectedId) ?? null : null),
    [selectedId],
  );
  const hovered = useMemo(
    () => (hoveredId != null ? FACTIONS.find((f) => f.id === hoveredId) ?? null : null),
    [hoveredId],
  );

  const filtered = useMemo(() => {
    const q = query.trim();
    if (!q) return FACTIONS;
    return FACTIONS.filter((f) => f.name.includes(q) || f.intro.includes(q) || f.win.includes(q));
  }, [query]);

  const pick = useCallback((id: number) => {
    AudioManager.playSfx("select", { volume: 0.7 });
    setSelectedId(id);
    setAutoRotate(false);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (selectedId != null) setSelectedId(null);
        else onBack();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedId, onBack]);

  return (
    <div className="fixed inset-0 overflow-hidden flex flex-col" style={{ background: "#06050a" }}>
      {/* 深空底：极暗的蓝紫，让暖金的星球浮出来 */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse 70% 60% at 50% 44%, rgba(34,30,44,0.9) 0%, rgba(10,9,14,0.96) 58%, #040407 100%)",
        }}
      />
      {/* 阵法图作为极淡的底纹，暗示这颗星球本身是一份被书写的文本 */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage: `url(${assetUrl("images/formation_bg.jpg")})`,
          backgroundSize: "cover",
          backgroundPosition: "center",
          filter: "grayscale(0.75) brightness(0.5) contrast(1.1)",
          opacity: 0.22,
          mixBlendMode: "screen",
        }}
      />
      <Starfield reduce={reduce} />

      {/* ══ 顶栏 ══ */}
      <header className="relative z-30 shrink-0 flex items-center gap-3 px-4 sm:px-6 pt-3 sm:pt-4">
        <button
          onClick={() => { AudioManager.playSfx("click", { volume: 0.6 }); onBack(); }}
          className="group flex items-center gap-1.5 px-3 py-1.5 rounded-full transition-all hover:scale-[1.04]"
          style={{ background: "rgba(12,10,8,0.72)", border: `1px solid ${GOLD}55`, color: MUTE }}
        >
          <IconExit size={12} color="currentColor" />
          <span className="font-cinzel text-[10px] tracking-[0.2em]">返回</span>
        </button>

        <div className="flex-1 text-center min-w-0">
          <div className="font-caoshu text-[clamp(20px,3.4vw,32px)] tracking-[0.34em] leading-none" style={{ color: INK, textShadow: `0 0 26px ${GOLD}44` }}>
            势力分布
          </div>
          <div className="font-cinzel text-[8px] tracking-[0.46em] mt-1.5" style={{ color: "#5a4818" }}>
            ORBIS NARRATIONIS · {FACTION_SITES.length} SITES
          </div>
        </div>

        <button
          onClick={() => { AudioManager.playSfx("click", { volume: 0.6 }); onView3D(); }}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full transition-all hover:scale-[1.04]"
          style={{ background: "rgba(12,10,8,0.72)", border: `1px solid ${GOLD}55`, color: MUTE }}
          title="切换到势力环廊"
        >
          <span className="font-cinzel text-[10px] tracking-[0.2em]">环廊</span>
        </button>
      </header>

      {/* ══ 星球 ══ */}
      <div className="relative flex-1 min-h-0">
        <FactionGlobe
          selectedId={selectedId}
          hoveredId={hoveredId}
          autoRotate={autoRotate && !selected}
          onSelect={pick}
          onHover={setHoveredId}
          onProject={handleProject}
          reduce={reduce}
        />

        {/* 据点标签层：位置由 canvas 每帧直接写 transform，不经过 React */}
        <div ref={labelHost} className="absolute inset-0 pointer-events-none">
          {FACTION_SITES.map((site) => {
            const f = FACTIONS.find((x) => x.id === site.id)!;
            const isSel = selectedId === site.id;
            const isHov = hoveredId === site.id;
            const linked = selectedId != null && (FACTION_LINKS[selectedId] ?? []).includes(site.id);
            const show = isSel || isHov || linked;
            return (
              <div
                key={site.id}
                data-site={site.id}
                className="absolute top-0 left-0 whitespace-nowrap will-change-transform"
                style={{ opacity: 0, transition: "opacity .2s ease" }}
              >
                <div
                  className="px-2 py-0.5 rounded-sm"
                  style={{
                    background: show ? "rgba(10,8,6,0.9)" : "transparent",
                    border: show ? `1px solid ${isSel ? GOLD_HI : GOLD}66` : "1px solid transparent",
                    opacity: show ? 1 : 0.28,
                    transition: "all .22s ease",
                  }}
                >
                  <span
                    className="text-[11px] tracking-[0.1em]"
                    style={{ color: isSel ? GOLD_HI : show ? INK : MUTE }}
                  >
                    {f.name}
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        {/* 悬停速览 */}
        <AnimatePresence>
          {hovered && !selected && (
            <motion.div
              key={hovered.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 6 }}
              transition={{ duration: 0.2 }}
              className="absolute bottom-4 left-1/2 -translate-x-1/2 pointer-events-none px-4 py-2 rounded-md text-center"
              style={{
                background: "linear-gradient(150deg, rgba(18,15,11,0.95), rgba(8,6,5,0.95))",
                border: `1px solid ${GOLD}44`,
                maxWidth: "min(90vw, 520px)",
              }}
            >
              <div className="font-caoshu text-[17px] tracking-[0.16em]" style={{ color: INK }}>
                {hovered.name}
              </div>
              <div className="font-brush text-[11px] mt-0.5 truncate" style={{ color: MUTE }}>
                「{hovered.quote}」
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* 操作提示 */}
        {!selected && (
          <div className="absolute bottom-3 right-4 pointer-events-none font-cinzel text-[8px] tracking-[0.26em]" style={{ color: "#4a3f2c" }}>
            拖动旋转 · 滚轮缩放 · 点选据点
          </div>
        )}
      </div>

      {/* ══ 势力索引（不按类别，只是一列可搜索的名录） ══ */}
      <div className="relative z-20 shrink-0 px-3 sm:px-5 pb-3">
        <div className="flex items-center gap-2 mb-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="检索势力…"
            className="flex-1 min-w-0 px-3 py-1.5 rounded-full text-[12px] outline-none"
            style={{
              background: "rgba(10,8,6,0.8)",
              border: `1px solid ${GOLD}33`,
              color: INK,
            }}
          />
          <button
            onClick={() => setAutoRotate((v) => !v)}
            className="px-3 py-1.5 rounded-full font-cinzel text-[9px] tracking-[0.2em] shrink-0 transition-all hover:scale-105"
            style={{
              background: autoRotate ? "rgba(60,46,22,0.85)" : "rgba(10,8,6,0.8)",
              border: `1px solid ${autoRotate ? GOLD : GOLD + "33"}`,
              color: autoRotate ? GOLD_HI : MUTE,
            }}
          >
            {autoRotate ? "自转中" : "已停转"}
          </button>
        </div>
        <div className="flex gap-1.5 overflow-x-auto pb-1" style={{ scrollbarWidth: "thin" }}>
          {filtered.map((f) => {
            const on = selectedId === f.id;
            return (
              <button
                key={f.id}
                onClick={() => pick(f.id)}
                onMouseEnter={() => setHoveredId(f.id)}
                onMouseLeave={() => setHoveredId((h) => (h === f.id ? null : h))}
                className="shrink-0 px-2.5 py-1 rounded-sm text-[11px] transition-all"
                style={{
                  background: on ? "linear-gradient(180deg, rgba(62,48,22,0.95), rgba(28,21,10,0.95))" : "rgba(10,8,6,0.62)",
                  border: `1px solid ${on ? GOLD : "rgba(90,72,24,0.32)"}`,
                  color: on ? GOLD_HI : "#9c8f78",
                }}
              >
                {f.name}
              </button>
            );
          })}
          {filtered.length === 0 && (
            <span className="text-[11px] px-2 py-1" style={{ color: MUTE }}>没有匹配的势力</span>
          )}
        </div>
      </div>

      {/* ══ 势力详情 ══ */}
      <AnimatePresence>
        {selected && (
          <SiteDossier
            key={selected.id}
            faction={selected}
            onClose={() => { AudioManager.playSfx("click", { volume: 0.6 }); setSelectedId(null); }}
            onJump={(id) => pick(id)}
            reduce={reduce}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────
   势力详情：右侧内嵌卷宗
   ──────────────────────────────────────────────────────────── */
function SiteDossier({
  faction, onClose, onJump, reduce,
}: {
  faction: FactionDef;
  onClose: () => void;
  onJump: (id: number) => void;
  reduce: boolean;
}) {
  const site = FACTION_SITES.find((s) => s.id === faction.id);
  const links = (FACTION_LINKS[faction.id] ?? [])
    .map((id) => FACTIONS.find((f) => f.id === id))
    .filter(Boolean) as FactionDef[];

  return (
    <motion.aside
      className="fixed z-[60] flex flex-col overflow-hidden rounded-md"
      style={{
        top: "clamp(12px, 3vh, 34px)",
        bottom: "clamp(12px, 3vh, 34px)",
        right: "clamp(12px, 2vw, 28px)",
        width: "min(calc(100vw - 24px), 400px)",
        background: "linear-gradient(160deg, rgba(22,18,13,0.975) 0%, rgba(8,6,4,0.985) 62%)",
        border: `1px solid ${GOLD}55`,
        boxShadow: `0 30px 90px rgba(0,0,0,0.8), 0 0 50px ${GOLD}12`,
        backdropFilter: "blur(14px)",
      }}
      initial={{ opacity: 0, x: reduce ? 0 : 42 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: reduce ? 0 : 36 }}
      transition={{ type: "spring", stiffness: 240, damping: 28 }}
    >
      <div className="h-px shrink-0" style={{ background: `linear-gradient(90deg, transparent, ${GOLD_HI}aa 50%, transparent)` }} />

      {/* 立绘：9:16 竖构图，完整显示 */}
      <div className="relative shrink-0 overflow-hidden" style={{ aspectRatio: "9 / 13" }}>
        <img
          src={faction.image}
          alt={faction.name}
          draggable={false}
          className="absolute inset-0 w-full h-full object-cover object-top"
        />
        <div
          className="absolute inset-0"
          style={{ background: "linear-gradient(180deg, rgba(6,5,3,0.35) 0%, transparent 30%, rgba(6,5,3,0.95) 100%)" }}
        />
        <button
          onClick={onClose}
          aria-label="关闭"
          className="absolute top-2 right-2 w-7 h-7 rounded-full flex items-center justify-center transition-all hover:scale-110 hover:rotate-90"
          style={{ background: "rgba(0,0,0,0.6)", border: `1px solid ${GOLD}55` }}
        >
          <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
            <path d="M2 2l8 8M10 2l-8 8" stroke="#c9b896" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        </button>
        <div className="absolute bottom-0 inset-x-0 px-4 pb-3">
          <div className="font-caoshu text-[30px] leading-none tracking-[0.16em]" style={{ color: INK, textShadow: "0 2px 12px rgba(0,0,0,0.9)" }}>
            {faction.name}
          </div>
          {site && (
            <div className="font-cinzel text-[8px] tracking-[0.3em] mt-1.5" style={{ color: GOLD }}>
              {site.region} · {site.lat.toFixed(1)}°, {site.lon.toFixed(1)}°
            </div>
          )}
        </div>
      </div>

      {/* 正文 */}
      <div className="relative flex-1 overflow-y-auto px-4 py-3.5 space-y-3.5 custom-scroll-parchment">
        <p className="font-brush text-[13px] leading-[1.9]" style={{ color: "#b3a58a" }}>
          「{faction.quote}」
        </p>

        <section>
          <SectionLabel zh="势力介绍" en="DOCTRINA" />
          <p className="text-[12.5px] leading-[1.85]" style={{ color: "#cbbfa4" }}>{faction.intro}</p>
        </section>

        <section
          className="px-3 py-2.5 rounded-sm"
          style={{ background: "rgba(200,160,67,0.05)", border: `1px dashed ${GOLD}44` }}
        >
          <SectionLabel zh="隐藏胜利条件" en="VICTORIA OCCULTA" />
          <p className="text-[13px] leading-[1.85]" style={{ color: "#f2e6c8" }}>{faction.win}</p>
        </section>

        {links.length > 0 && (
          <section>
            <SectionLabel zh="叙事关联" en="NEXUS" />
            <div className="flex flex-wrap gap-1.5">
              {links.map((l) => (
                <button
                  key={l.id}
                  onClick={() => onJump(l.id)}
                  className="px-2 py-1 rounded-sm text-[11px] transition-all hover:scale-105"
                  style={{ background: "rgba(10,8,6,0.7)", border: `1px solid ${GOLD}33`, color: "#a89a80" }}
                >
                  {l.name}
                </button>
              ))}
            </div>
          </section>
        )}
      </div>

      <div className="h-px shrink-0" style={{ background: `linear-gradient(90deg, transparent, ${GOLD}44, transparent)` }} />
      {["top-0 left-0 border-t border-l", "top-0 right-0 border-t border-r",
        "bottom-0 left-0 border-b border-l", "bottom-0 right-0 border-b border-r"].map((c, i) => (
        <div key={i} className={`absolute w-6 h-6 pointer-events-none ${c}`} style={{ borderColor: `${GOLD_HI}66` }} />
      ))}
    </motion.aside>
  );
}

function SectionLabel({ zh, en }: { zh: string; en: string }) {
  return (
    <div className="flex items-center gap-2 mb-1.5">
      <span className="w-[2px] h-3.5 rounded-full shrink-0" style={{ background: `linear-gradient(180deg, ${GOLD_HI}, ${GOLD}22)` }} />
      <span className="font-caoshu text-[14px] leading-none" style={{ color: GOLD_HI }}>{zh}</span>
      <span className="font-cinzel text-[7px] tracking-[0.34em]" style={{ color: "#6a5418" }}>{en}</span>
      <span className="flex-1 h-px" style={{ background: `linear-gradient(90deg, ${GOLD}33, transparent)` }} />
    </div>
  );
}

/** 极简星野：纯 CSS，不参与每帧计算 */
function Starfield({ reduce }: { reduce: boolean }) {
  const stars = useMemo(
    () =>
      Array.from({ length: 90 }).map((_, i) => {
        const r = (n: number) => {
          const x = Math.sin(i * 12.9898 + n * 78.233) * 43758.5453;
          return x - Math.floor(x);
        };
        return {
          left: r(1) * 100,
          top: r(2) * 100,
          size: r(3) < 0.85 ? 1 : 2,
          op: 0.15 + r(4) * 0.5,
          dur: 3 + r(5) * 5,
          delay: r(6) * 5,
        };
      }),
    [],
  );
  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden">
      {stars.map((s, i) => (
        <span
          key={i}
          className="absolute rounded-full"
          style={{
            left: `${s.left}%`,
            top: `${s.top}%`,
            width: s.size,
            height: s.size,
            background: "#e8dfc8",
            opacity: s.op,
            animation: reduce ? undefined : `cg-twinkle ${s.dur}s ease-in-out ${s.delay}s infinite`,
          }}
        />
      ))}
      <style>{`@keyframes cg-twinkle{0%,100%{opacity:.12}50%{opacity:.62}}`}</style>
    </div>
  );
}

/**
 * FactionWorld.tsx —— 势力分布
 * ============================================================================
 * 三栏：**左侧名录 · 中央星球 · 右侧速览**。
 *
 * 为什么从"底部横条"改成"左侧竖排"：
 *   22 个势力横着排在屏幕最下沿，只能靠横向滚动看完；
 *   名字被压成一行小胶囊，彼此没有主次，扫一眼记不住任何东西，
 *   而且它压在星球正下方，正好挡住南半球的据点。
 *   竖排名录一屏能看全 22 行，每行有编号、名称、所属域与一条随状态
 *   伸缩的刻线 —— 名录本身就成了一件可读的仪器，而不是一排按钮。
 *
 * 右侧速览做小、但不能做没：立绘 4:5，简介截断到三行。
 * 这一栏的职责是"悬停即知道这是谁"，不是"在这里读完全部资料"；
 * 真要细读，按「展开全档」推全屏卷宗。之前那块 400px 宽、9:13 立绘的
 * 大面板一开就吃掉半个屏幕，把星球挤没了；但中途缩到 16:10 又矫枉过正 ——
 * 这批立绘都是竖构图海报，切成横条之后只剩一截天空，看不出画的是什么。
 * ============================================================================
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { FACTIONS, CATEGORY_META, type FactionDef } from "../data/factions";
import { FACTION_LINKS, FACTION_SITES } from "../data/factionGeo";
import FactionGlobe from "./FactionGlobe";
import { assetUrl } from "../utils/assetUrl";
import { AudioManager } from "../audio/AudioManager";
import { IconExit, FactionIcon } from "./Icons";
import { Scramble, TypeOut, Label, Readout, Toggle, Caret, CornerTicks, FilmOverlay, EASE } from "./Kit";

type Projected = { id: number; x: number; y: number; vis: boolean };
type Tele = { lat: number; lon: number; zoom: number; fps: number };

const GOLD = "#c8a043";
const GOLD_HI = "#f0c862";
const INK = "#e8dfc8";
const MUTE = "#8a7a5c";
const DIM = "#5f5340";

export default function FactionWorld({ onBack, onView3D }: { onBack: () => void; onView3D: () => void }) {
  const reduce = !!useReducedMotion();
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [hoveredId, setHoveredId] = useState<number | null>(null);
  const [autoRotate, setAutoRotate] = useState(true);
  const [showLinks, setShowLinks] = useState(true);
  const [query, setQuery] = useState("");
  const [dossierId, setDossierId] = useState<number | null>(null);
  const [railOpen, setRailOpen] = useState(false);
  const [tele, setTele] = useState<Tele>({ lat: 0, lon: 0, zoom: 1, fps: 60 });

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
  const handleTele = useCallback((t: Tele) => setTele(t), []);

  const selected = useMemo(
    () => (selectedId != null ? FACTIONS.find((f) => f.id === selectedId) ?? null : null),
    [selectedId],
  );
  /** 右栏读的是"悬停优先、否则选中、再否则第一个" —— 鼠标扫过名录时它就跟着变 */
  const active = useMemo(
    () => FACTIONS.find((f) => f.id === (hoveredId ?? selectedId)) ?? FACTIONS[0],
    [hoveredId, selectedId],
  );
  const dossier = useMemo(
    () => (dossierId != null ? FACTIONS.find((f) => f.id === dossierId) ?? null : null),
    [dossierId],
  );

  const filtered = useMemo(() => {
    const q = query.trim();
    if (!q) return FACTIONS;
    return FACTIONS.filter(
      (f) => f.name.includes(q) || f.intro.includes(q) || f.win.includes(q) || f.quote.includes(q),
    );
  }, [query]);

  const linkedIds = useMemo(
    () => new Set(selectedId != null ? FACTION_LINKS[selectedId] ?? [] : []),
    [selectedId],
  );

  const pick = useCallback((id: number) => {
    AudioManager.playSfx("select", { volume: 0.7 });
    setSelectedId(id);
    setAutoRotate(false);
    setRailOpen(false);
  }, []);

  /* 键盘：↑↓ 在名录里走，Enter 展开全档，Esc 逐层退出 */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") {
        if (e.key === "Escape") (e.target as HTMLElement).blur();
        return;
      }
      if (e.key === "Escape") {
        if (dossierId != null) setDossierId(null);
        else if (selectedId != null) setSelectedId(null);
        else onBack();
        return;
      }
      if (dossierId != null) return;
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        const list = filtered;
        if (!list.length) return;
        const i = list.findIndex((f) => f.id === (selectedId ?? active.id));
        const next = e.key === "ArrowDown" ? (i + 1) % list.length : (i - 1 + list.length) % list.length;
        pick(list[next].id);
      }
      if (e.key === "Enter" && selectedId != null) setDossierId(selectedId);
      if (e.key === " ") {
        e.preventDefault();
        setAutoRotate((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedId, dossierId, onBack, filtered, active.id, pick]);

  return (
    <div className="fixed inset-0 overflow-hidden flex flex-col" style={{ background: "#06050a" }}>
      {/* 深空底：极暗的蓝紫，让暖金的星球浮出来 */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse 70% 60% at 52% 46%, rgba(34,30,44,0.9) 0%, rgba(10,9,14,0.96) 58%, #040407 100%)",
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
          opacity: 0.2,
          mixBlendMode: "screen",
        }}
      />
      <Starfield reduce={reduce} />
      <FilmOverlay grain={0.04} scan={0.02} z={45} />

      {/* ══ 顶栏 ══ */}
      <header className="relative z-40 shrink-0 flex items-center gap-3 px-4 sm:px-6 pt-3 sm:pt-4">
        <button
          onClick={() => { AudioManager.playSfx("click", { volume: 0.6 }); onBack(); }}
          className="group flex items-center gap-1.5 px-3 py-1.5 rounded-full transition-all hover:scale-[1.04]"
          style={{ background: "rgba(12,10,8,0.72)", border: `1px solid ${GOLD}55`, color: MUTE }}
        >
          <IconExit size={12} color="currentColor" />
          <span className="font-cinzel text-[10px] tracking-[0.2em]">返回</span>
        </button>

        {/* 窄屏上名录收成抽屉，用这颗按钮唤出 */}
        <button
          onClick={() => { AudioManager.playSfx("click", { volume: 0.6 }); setRailOpen((v) => !v); }}
          className="lg:hidden flex items-center gap-1.5 px-3 py-1.5 rounded-full transition-all"
          style={{
            background: railOpen ? "rgba(60,46,22,0.85)" : "rgba(12,10,8,0.72)",
            border: `1px solid ${railOpen ? GOLD : GOLD + "55"}`,
            color: railOpen ? GOLD_HI : MUTE,
          }}
        >
          <span className="font-cinzel text-[10px] tracking-[0.2em]">名录</span>
        </button>

        <div className="flex-1 text-center min-w-0">
          <div
            className="font-caoshu text-[clamp(20px,3.4vw,32px)] tracking-[0.34em] leading-none"
            style={{ color: INK, textShadow: `0 0 26px ${GOLD}44` }}
          >
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

      {/* 名条走马灯：一条缓慢横移的势力名录，
          既是装饰，也让"这颗星球上住着二十二伙人"这件事一直在场。 */}
      <div className="relative z-30 shrink-0 overflow-hidden py-1" style={{ borderTop: `1px solid ${GOLD}14`, borderBottom: `1px solid ${GOLD}14` }}>
        <div className="kit-marquee flex w-max">
          {[0, 1].map((dup) => (
            <div key={dup} className="flex shrink-0">
              {FACTIONS.map((f) => (
                <button
                  key={dup + "-" + f.id}
                  onClick={() => pick(f.id)}
                  onMouseEnter={() => setHoveredId(f.id)}
                  onMouseLeave={() => setHoveredId(null)}
                  className="flex items-center gap-2 px-5 whitespace-nowrap transition-colors"
                  style={{ color: hoveredId === f.id || selectedId === f.id ? GOLD_HI : "#4e4534" }}
                >
                  <FactionIcon category={f.category} size={9} color="currentColor" />
                  <span className="text-[10.5px] tracking-[0.16em]">{f.name}</span>
                  <span className="font-cinzel text-[7.5px] tracking-[0.3em] opacity-60">
                    {String(f.id).padStart(2, "0")}
                  </span>
                </button>
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* ══ 主体三栏 ══ */}
      <div className="relative flex-1 min-h-0 flex">
        {/* ── 左：势力名录 ── */}
        <IndexRail
          list={filtered}
          total={FACTIONS.length}
          query={query}
          onQuery={setQuery}
          selectedId={selectedId}
          hoveredId={hoveredId}
          linkedIds={linkedIds}
          onHover={setHoveredId}
          onPick={pick}
          open={railOpen}
          onClose={() => setRailOpen(false)}
          reduce={reduce}
        />

        {/* ── 中：星球 ── */}
        <div className="relative flex-1 min-w-0">
          <FactionGlobe
            selectedId={selectedId}
            hoveredId={hoveredId}
            autoRotate={autoRotate && !selected}
            onSelect={pick}
            onHover={setHoveredId}
            onProject={handleProject}
            onTelemetry={handleTele}
            showLinks={showLinks}
            reduce={reduce}
          />

          {/* 据点标签层：位置由 canvas 每帧直接写 transform，不经过 React */}
          <div ref={labelHost} className="absolute inset-0 pointer-events-none">
            {FACTION_SITES.map((site) => {
              const f = FACTIONS.find((x) => x.id === site.id)!;
              const isSel = selectedId === site.id;
              const isHov = hoveredId === site.id;
              const linked = showLinks && linkedIds.has(site.id);
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
                      opacity: show ? 1 : 0.26,
                      transition: "all .22s ease",
                    }}
                  >
                    <span className="text-[11px] tracking-[0.1em]" style={{ color: isSel ? GOLD_HI : show ? INK : MUTE }}>
                      {f.name}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* 悬停速览：跟着据点走的一张小签，
              让"鼠标停在哪颗星上"这件事有即时反馈，不必等右栏。 */}
          <AnimatePresence>
            {hoveredId != null && hoveredId !== selectedId && (
              <motion.div
                key={hoveredId}
                initial={{ opacity: 0, y: 6, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 4, scale: 0.97 }}
                transition={{ duration: 0.18, ease: EASE }}
                className="pointer-events-none absolute bottom-10 left-1/2 -translate-x-1/2 px-3.5 py-1.5 text-center"
                style={{
                  background: "linear-gradient(150deg, rgba(18,15,11,0.95), rgba(8,6,5,0.95))",
                  border: `1px solid ${GOLD}44`,
                  maxWidth: "min(86%, 460px)",
                }}
              >
                <div className="font-caoshu text-[16px] tracking-[0.14em]" style={{ color: INK }}>
                  {FACTIONS.find((f) => f.id === hoveredId)?.name}
                </div>
                <div className="font-brush text-[10.5px] mt-0.5 truncate" style={{ color: MUTE }}>
                  「{FACTIONS.find((f) => f.id === hoveredId)?.quote}」
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* 遥测：镜头在哪、放大多少、跑多快 */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.9, duration: 0.9 }}
            className="pointer-events-none absolute bottom-3 left-3 hidden md:flex flex-col gap-[3px]"
          >
            <Readout k="CAM.LAT" v={`${tele.lat >= 0 ? "+" : ""}${tele.lat.toFixed(2)}°`} color={DIM} />
            <Readout k="CAM.LON" v={`${tele.lon >= 0 ? "+" : ""}${tele.lon.toFixed(2)}°`} color={DIM} />
            <Readout k="ZOOM" v={`×${tele.zoom.toFixed(2)}`} color={DIM} />
            <Readout k="SITES" v={`${String(filtered.length).padStart(2, "0")}/${FACTIONS.length}`} color={DIM} />
            <Readout k="LINKS" v={showLinks ? `${linkedIds.size || "—"}` : "OFF"} color={DIM} />
            <Readout k="FPS" v={String(Math.round(tele.fps)).padStart(2, "0")} color={DIM} />
          </motion.div>

          {/* 视图开关 */}
          <div className="absolute top-3 left-3 flex flex-col gap-1.5 z-20">
            <Toggle on={autoRotate} label="AUTO-ROTATE" onClick={() => setAutoRotate((v) => !v)} color={GOLD} />
            <Toggle on={showLinks} label="NEXUS LINKS" onClick={() => setShowLinks((v) => !v)} color={GOLD} />
          </div>

          {/* 操作提示 */}
          <div
            className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 hidden lg:flex items-center gap-4 font-cinzel text-[8px] tracking-[0.28em]"
            style={{ color: "#4a3f2c" }}
          >
            <span>拖动 旋转</span>
            <span className="h-2.5 w-px" style={{ background: "#3a3122" }} />
            <span>滚轮 缩放</span>
            <span className="h-2.5 w-px" style={{ background: "#3a3122" }} />
            <span>↑↓ 切换</span>
            <span className="h-2.5 w-px" style={{ background: "#3a3122" }} />
            <span>ENTER 全档</span>
            <Caret color="#4a3f2c" />
          </div>
        </div>

        {/* ── 右：速览 ── */}
        <BriefPanel
          faction={active}
          isSelected={selectedId === active.id}
          onOpen={() => { AudioManager.playSfx("open", { volume: 0.7 }); setDossierId(active.id); }}
          onPick={pick}
          reduce={reduce}
        />
      </div>

      {/* ══ 全档卷宗 ══ */}
      <AnimatePresence>
        {dossier && (
          <Dossier
            key={dossier.id}
            faction={dossier}
            onClose={() => { AudioManager.playSfx("click", { volume: 0.6 }); setDossierId(null); }}
            onJump={(id) => { pick(id); setDossierId(id); }}
            reduce={reduce}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════
   左栏 · 势力名录
   ──────────────────────────────────────────────────────────── */
function IndexRail({
  list, total, query, onQuery, selectedId, hoveredId, linkedIds,
  onHover, onPick, open, onClose, reduce,
}: {
  list: FactionDef[];
  total: number;
  query: string;
  onQuery: (v: string) => void;
  selectedId: number | null;
  hoveredId: number | null;
  linkedIds: Set<number>;
  onHover: (id: number | null) => void;
  onPick: (id: number) => void;
  open: boolean;
  onClose: () => void;
  reduce: boolean;
}) {
  const listRef = useRef<HTMLUListElement | null>(null);

  // 键盘换行时把当前项滚进视野，否则选到第 18 位就看不见了
  useEffect(() => {
    if (selectedId == null) return;
    const el = listRef.current?.querySelector<HTMLElement>(`[data-row="${selectedId}"]`);
    el?.scrollIntoView({ block: "nearest", behavior: reduce ? "auto" : "smooth" });
  }, [selectedId, reduce]);

  return (
    <>
      {/* 窄屏抽屉的点击遮罩 */}
      {open && <div className="lg:hidden fixed inset-0 z-30" style={{ background: "rgba(4,3,6,0.6)" }} onClick={onClose} />}

      <motion.aside
        initial={reduce ? false : { opacity: 0, x: -24 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.8, delay: 0.15, ease: EASE }}
        className={`z-30 shrink-0 flex flex-col ${
          open
            ? "fixed left-0 top-0 bottom-0 w-[260px] pt-16"
            : "hidden lg:flex relative"
        } lg:relative lg:w-[252px] lg:pt-0`}
        style={{
          background: open ? "linear-gradient(180deg, rgba(12,10,14,0.98), rgba(6,5,8,0.99))" : "transparent",
          borderRight: `1px solid rgba(200,160,67,0.13)`,
        }}
      >
        {/* 检索 */}
        <div className="relative px-3 pt-3 pb-2 shrink-0">
          <div className="flex items-baseline justify-between mb-2">
            <Label color={DIM}>NODE INDEX</Label>
            <span className="text-[9px] tracking-[0.18em]" style={{ color: DIM, fontVariantNumeric: "tabular-nums" }}>
              {String(list.length).padStart(2, "0")} / {total}
            </span>
          </div>
          <div className="relative overflow-hidden" style={{ border: `1px solid ${GOLD}2e` }}>
            {/* 检索框里那道缓慢下扫的光带：让"正在检索"这件事本身有个动态 */}
            {!reduce && (
              <span
                className="kit-sweep pointer-events-none absolute inset-x-0 h-px"
                style={{ background: `linear-gradient(90deg, transparent, ${GOLD}55, transparent)` }}
              />
            )}
            <input
              value={query}
              onChange={(e) => onQuery(e.target.value)}
              placeholder="检索势力 · 名称 / 主张 / 胜利"
              className="w-full bg-transparent px-2.5 py-1.5 text-[11.5px] outline-none"
              style={{ color: INK }}
            />
          </div>
        </div>

        {/* 名录 */}
        <ul ref={listRef} className="kit-scroll flex-1 min-h-0 overflow-y-auto px-1.5 pb-3 space-y-[1px]">
          {list.map((f, i) => {
            const on = selectedId === f.id;
            const hov = hoveredId === f.id;
            const linked = linkedIds.has(f.id);
            const cat = CATEGORY_META[f.category];
            return (
              <motion.li
                key={f.id}
                initial={reduce ? false : { opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.45, delay: Math.min(0.5, 0.25 + i * 0.018), ease: EASE }}
              >
                <button
                  data-row={f.id}
                  onClick={() => onPick(f.id)}
                  onMouseEnter={() => { onHover(f.id); AudioManager.playSfx("hover", { volume: 0.22 }); }}
                  onMouseLeave={() => onHover(null)}
                  className="group relative flex w-full items-center gap-2 py-[5px] pl-1.5 pr-2 text-left transition-colors"
                  style={{ background: on ? "rgba(200,160,67,0.09)" : "transparent" }}
                >
                  {/* 选中行左缘的呼吸光：让"当前在看哪一行"在余光里也成立 */}
                  {on && (
                    <motion.span
                      layoutId="rail-cursor"
                      className="absolute left-0 top-0 bottom-0 w-[2px]"
                      style={{ background: `linear-gradient(180deg, transparent, ${GOLD_HI}, transparent)` }}
                      transition={{ type: "spring", stiffness: 420, damping: 34 }}
                    />
                  )}
                  {/* 刻线：选中最长，其次悬停，其次"与选中项有关联" */}
                  <span
                    className="h-px shrink-0 transition-all duration-500"
                    style={{
                      width: on ? 22 : hov ? 16 : linked ? 12 : 7,
                      background: on ? GOLD_HI : hov ? GOLD : linked ? `${GOLD}99` : "rgba(160,140,100,0.34)",
                    }}
                  />
                  <span
                    className="shrink-0 text-[9px] tracking-[0.16em] transition-colors"
                    style={{ color: on ? GOLD_HI : DIM, fontVariantNumeric: "tabular-nums" }}
                  >
                    {String(f.id).padStart(2, "0")}
                  </span>
                  <span
                    className="min-w-0 flex-1 truncate text-[12.5px] tracking-[0.06em] transition-all duration-300"
                    style={{
                      color: on ? GOLD_HI : hov ? INK : linked ? "#b3a68c" : "#948a76",
                      transform: on || hov ? "translateX(3px)" : "none",
                    }}
                  >
                    {f.name}
                  </span>
                  <span
                    className="shrink-0 transition-opacity duration-300"
                    style={{ opacity: on ? 1 : hov ? 0.85 : 0.34 }}
                    title={cat.label}
                  >
                    <FactionIcon category={f.category} size={10} color={on ? GOLD_HI : cat.color} />
                  </span>
                </button>
              </motion.li>
            );
          })}
          {list.length === 0 && (
            <li className="px-3 py-6 text-center text-[11px]" style={{ color: DIM }}>
              名录中没有匹配的势力
            </li>
          )}
        </ul>
      </motion.aside>
    </>
  );
}

/* ════════════════════════════════════════════════════════════
   右栏 · 速览（立绘缩到一条，简介三行封顶）
   ──────────────────────────────────────────────────────────── */
function BriefPanel({
  faction, isSelected, onOpen, onPick, reduce,
}: {
  faction: FactionDef;
  isSelected: boolean;
  onOpen: () => void;
  onPick: (id: number) => void;
  reduce: boolean;
}) {
  const site = FACTION_SITES.find((s) => s.id === faction.id);
  const cat = CATEGORY_META[faction.category];
  const links = (FACTION_LINKS[faction.id] ?? [])
    .map((id) => FACTIONS.find((f) => f.id === id))
    .filter(Boolean) as FactionDef[];

  return (
    <motion.aside
      initial={reduce ? false : { opacity: 0, x: 24 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.8, delay: 0.22, ease: EASE }}
      className="relative z-30 hidden md:flex shrink-0 w-[300px] lg:w-[336px] flex-col justify-center px-3"
    >
      <AnimatePresence mode="wait">
        <motion.article
          key={faction.id}
          initial={reduce ? false : { opacity: 0, y: 12, filter: "blur(7px)" }}
          animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
          exit={{ opacity: 0, y: -8, filter: "blur(7px)" }}
          transition={{ duration: 0.42, ease: EASE }}
          className="relative overflow-hidden"
          style={{
            background: "linear-gradient(162deg, rgba(20,17,12,0.9) 0%, rgba(7,6,4,0.94) 66%)",
            border: `1px solid ${GOLD}33`,
            boxShadow: "0 20px 54px rgba(0,0,0,0.66)",
            backdropFilter: "blur(6px)",
          }}
        >
          <CornerTicks color={`${GOLD_HI}55`} size={11} />

          {/* 立绘：比原来的 9:13 整幅小，但 16:10 那一条又切得太狠 ——
              4:5 是这批竖构图海报还能看出「画的是什么」的下限。 */}
          <div className="relative overflow-hidden" style={{ aspectRatio: "4 / 5" }}>
            <motion.img
              src={faction.image}
              alt={faction.name}
              draggable={false}
              className="absolute inset-0 w-full h-full object-cover object-top"
              initial={reduce ? false : { scale: 1.1 }}
              animate={{ scale: 1 }}
              transition={{ duration: 1.4, ease: EASE }}
            />
            <div
              className="absolute inset-0"
              style={{ background: "linear-gradient(180deg, rgba(6,5,3,0.2) 0%, transparent 34%, rgba(7,6,4,0.94) 100%)" }}
            />
            {/* 一道极淡的斜向高光缓慢扫过立绘：静止的图因此有了呼吸 */}
            {!reduce && (
              <motion.div
                className="pointer-events-none absolute inset-y-0 w-1/3"
                style={{ background: "linear-gradient(105deg, transparent, rgba(255,238,200,0.09), transparent)" }}
                initial={{ x: "-160%" }}
                animate={{ x: "460%" }}
                transition={{ duration: 5.2, repeat: Infinity, repeatDelay: 2.6, ease: "easeInOut" }}
              />
            )}
            <div className="absolute top-1.5 left-2 flex items-center gap-1.5">
              <FactionIcon category={faction.category} size={10} color={cat.color} />
              <Label color="#b9a271">{cat.label}</Label>
            </div>
            <div className="absolute bottom-1.5 left-2.5 right-2.5 flex items-end justify-between gap-2">
              <div className="font-caoshu text-[29px] leading-none tracking-[0.14em]" style={{ color: INK, textShadow: "0 2px 12px rgba(0,0,0,0.9)" }}>
                <TypeOut text={faction.name} perChar={62} />
              </div>
              <span className="font-cinzel text-[8px] tracking-[0.2em] pb-0.5" style={{ color: GOLD }}>
                <Scramble text={String(faction.id).padStart(2, "0")} speed={40} />
              </span>
            </div>
          </div>

          <div className="px-3 py-2.5 space-y-2">
            <p className="font-brush text-[11.5px] leading-[1.7]" style={{ color: "#a4977c" }}>
              「{faction.quote}」
            </p>

            <div className="h-px" style={{ background: `linear-gradient(90deg, ${GOLD}33, transparent)` }} />

            {/* 三行封顶：速览只负责"是谁"，细节交给全档 */}
            <p
              className="text-[11.5px] leading-[1.7]"
              style={{
                color: "#bdb097",
                display: "-webkit-box",
                WebkitLineClamp: 3,
                WebkitBoxOrient: "vertical",
                overflow: "hidden",
              }}
            >
              {faction.intro}
            </p>

            <div className="flex items-center gap-1.5 pt-0.5">
              <span className="w-[2px] h-3 shrink-0" style={{ background: `linear-gradient(180deg, ${GOLD_HI}, transparent)` }} />
              <Label color="#8a6c22">VICTORIA OCCULTA</Label>
            </div>
            <p
              className="text-[11.5px] leading-[1.7]"
              style={{
                color: "#e6d7b4",
                display: "-webkit-box",
                WebkitLineClamp: 2,
                WebkitBoxOrient: "vertical",
                overflow: "hidden",
              }}
            >
              {faction.win}
            </p>

            {links.length > 0 && (
              <div className="flex flex-wrap gap-1 pt-0.5">
                {links.slice(0, 3).map((l) => (
                  <button
                    key={l.id}
                    onClick={() => onPick(l.id)}
                    className="px-1.5 py-[2px] text-[10px] transition-colors"
                    style={{ border: `1px solid ${GOLD}2a`, color: "#948a76" }}
                  >
                    {l.name}
                  </button>
                ))}
              </div>
            )}

            <button
              onClick={onOpen}
              className="group mt-1 flex w-full items-center justify-between px-2.5 py-2 transition-all duration-500"
              style={{ border: `1px solid ${GOLD}3d`, color: "#b9a271" }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = GOLD;
                e.currentTarget.style.color = "#12100a";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "transparent";
                e.currentTarget.style.color = "#b9a271";
              }}
            >
              <span className="font-cinzel text-[9px] tracking-[0.28em]">展开全档 · DOSSIER</span>
              <span className="transition-transform duration-500 group-hover:translate-x-1">→</span>
            </button>

            <div className="flex items-center justify-between pt-0.5">
              <span className="font-cinzel text-[8px] tracking-[0.2em]" style={{ color: DIM }}>
                {site ? `${site.region} · ${site.lat.toFixed(1)}°, ${site.lon.toFixed(1)}°` : "—"}
              </span>
              <span className="font-cinzel text-[8px] tracking-[0.2em]" style={{ color: isSelected ? GOLD : DIM }}>
                {isSelected ? "已锁定" : "预览"}
              </span>
            </div>
          </div>
        </motion.article>
      </AnimatePresence>
    </motion.aside>
  );
}

/* ════════════════════════════════════════════════════════════
   全档卷宗（全屏）
   ──────────────────────────────────────────────────────────── */
function Dossier({
  faction, onClose, onJump, reduce,
}: {
  faction: FactionDef;
  onClose: () => void;
  onJump: (id: number) => void;
  reduce: boolean;
}) {
  const site = FACTION_SITES.find((s) => s.id === faction.id);
  const cat = CATEGORY_META[faction.category];
  const links = (FACTION_LINKS[faction.id] ?? [])
    .map((id) => FACTIONS.find((f) => f.id === id))
    .filter(Boolean) as FactionDef[];

  return (
    <motion.div
      className="fixed inset-0 z-[90] overflow-y-auto kit-scroll"
      style={{ background: "rgba(5,4,7,0.965)", backdropFilter: "blur(18px)" }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.34 }}
    >
      {/* 一道自上而下抹开的金幕，把"打开档案"变成一个动作而不是一次淡入 */}
      {!reduce && (
        <motion.div
          className="pointer-events-none fixed inset-0 z-[95] origin-top"
          style={{ background: "linear-gradient(180deg, #e8d9ae, #8a7238)", transformOrigin: "top" }}
          initial={{ scaleY: 1 }}
          animate={{ scaleY: 0 }}
          exit={{ scaleY: 0 }}
          transition={{ duration: 0.66, ease: EASE }}
        />
      )}

      <div className="mx-auto max-w-5xl px-5 py-8 md:px-10 md:py-12">
        <div className="flex items-start justify-between gap-6">
          <motion.div
            initial={reduce ? false : { opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.32, ease: EASE }}
          >
            <div className="flex items-center gap-2">
              <FactionIcon category={faction.category} size={12} color={cat.color} />
              <Label color="#8a7a5c">
                DOSSIER {String(faction.id).padStart(2, "0")} / {FACTIONS.length} · {cat.label}
                {site ? ` · ${site.region}` : ""}
              </Label>
            </div>
            <h2
              className="mt-3 font-caoshu leading-[0.9] tracking-[0.1em]"
              style={{ fontSize: "clamp(48px, 9vw, 104px)", color: INK, textShadow: `0 0 48px ${GOLD}2a` }}
            >
              {faction.name}
            </h2>
            <div className="mt-2 font-brush text-[15px] leading-[1.8] max-w-xl" style={{ color: "#a4977c" }}>
              「{faction.quote}」
            </div>
          </motion.div>

          <motion.button
            onClick={onClose}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.45 }}
            className="sticky top-4 shrink-0 px-4 py-3 font-cinzel text-[9px] tracking-[0.3em] transition-all duration-400"
            style={{ border: `1px solid ${GOLD}44`, color: "#b9a271" }}
            onMouseEnter={(e) => { e.currentTarget.style.background = GOLD; e.currentTarget.style.color = "#12100a"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "#b9a271"; }}
          >
            关闭 ESC
          </motion.button>
        </div>

        <motion.div
          initial={reduce ? false : { opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.42, ease: EASE }}
          className="mt-8 grid gap-6 md:grid-cols-12"
        >
          <div className="md:col-span-5">
            <div className="relative overflow-hidden" style={{ border: `1px solid ${GOLD}2a` }}>
              <img src={faction.image} alt={faction.name} draggable={false} className="w-full h-auto block" />
              <div className="absolute inset-0 pointer-events-none" style={{ boxShadow: "inset 0 0 90px rgba(0,0,0,0.7)" }} />
            </div>
            {site && (
              <div className="mt-2 flex flex-col gap-[3px]">
                <Readout k="REGION" v={site.region} color={DIM} />
                <Readout k="LAT / LON" v={`${site.lat.toFixed(2)}° , ${site.lon.toFixed(2)}°`} color={DIM} />
              </div>
            )}
          </div>

          <div className="md:col-span-7 space-y-6">
            <section>
              <SectionLabel zh="势力介绍" en="DOCTRINA" />
              <p className="text-[14px] leading-[2]" style={{ color: "#cbbfa4" }}>{faction.intro}</p>
            </section>

            <section className="px-4 py-3" style={{ background: "rgba(200,160,67,0.05)", border: `1px dashed ${GOLD}44` }}>
              <SectionLabel zh="隐藏胜利条件" en="VICTORIA OCCULTA" />
              <p className="text-[14.5px] leading-[1.95]" style={{ color: "#f2e6c8" }}>{faction.win}</p>
            </section>

            {links.length > 0 && (
              <section>
                <SectionLabel zh="叙事关联" en="NEXUS" />
                <div className="flex flex-wrap gap-2">
                  {links.map((l) => (
                    <button
                      key={l.id}
                      onClick={() => onJump(l.id)}
                      className="group flex items-center gap-2 px-3 py-2 transition-all duration-400"
                      style={{ border: `1px solid ${GOLD}2a`, color: "#a89a80" }}
                      onMouseEnter={(e) => { e.currentTarget.style.borderColor = GOLD; e.currentTarget.style.color = INK; }}
                      onMouseLeave={(e) => { e.currentTarget.style.borderColor = `${GOLD}2a`; e.currentTarget.style.color = "#a89a80"; }}
                    >
                      <FactionIcon category={l.category} size={10} color={CATEGORY_META[l.category].color} />
                      <span className="text-[12.5px]">{l.name}</span>
                      <span className="text-[10px] opacity-0 transition-opacity group-hover:opacity-70">↗</span>
                    </button>
                  ))}
                </div>
              </section>
            )}
          </div>
        </motion.div>
      </div>
    </motion.div>
  );
}

function SectionLabel({ zh, en }: { zh: string; en: string }) {
  return (
    <div className="flex items-center gap-2 mb-2">
      <span className="w-[2px] h-3.5 rounded-full shrink-0" style={{ background: `linear-gradient(180deg, ${GOLD_HI}, ${GOLD}22)` }} />
      <span className="font-caoshu text-[15px] leading-none" style={{ color: GOLD_HI }}>{zh}</span>
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

import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";
import { useGameStore } from "../store/gameStore";
import { getCharacter } from "../data/characters";
import { CARD_IMAGE } from "../data/cards";
import CardView from "./CardView";
import { AudioManager } from "../audio/AudioManager";
import { assetUrl } from "../utils/assetUrl";

function Overlay({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-[80] flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.88)", backdropFilter: "blur(8px)" }}
    >
      {children}
    </motion.div>
  );
}

function Frame({ children, w }: { children: React.ReactNode; w?: string }) {
  return (
    <motion.div
      initial={{ scale: 0.85, opacity: 0, y: 20 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.9, opacity: 0 }}
      transition={{ type: "spring", stiffness: 260, damping: 22 }}
      className={`relative ${w ?? "w-[460px]"} max-w-[calc(100vw-2rem)] max-h-[calc(100vh-2rem)] overflow-y-auto rounded-xl`}
      style={{
        background: "#0a0806",
        border: "1px solid rgba(160,128,48,0.4)",
        boxShadow: "0 24px 60px rgba(0,0,0,0.8)",
      }}
    >
      {/* Ornate corner decorations */}
      <div className="absolute top-0 left-0 w-6 h-6 border-t-2 border-l-2 border-[#a08030]/60 rounded-tl-xl" />
      <div className="absolute top-0 right-0 w-6 h-6 border-t-2 border-r-2 border-[#a08030]/60 rounded-tr-xl" />
      <div className="absolute bottom-0 left-0 w-6 h-6 border-b-2 border-l-2 border-[#a08030]/60 rounded-bl-xl" />
      <div className="absolute bottom-0 right-0 w-6 h-6 border-b-2 border-r-2 border-[#a08030]/60 rounded-br-xl" />
      {/* Inner border line */}
      <div className="absolute inset-2 rounded-lg border border-[#a08030]/20 pointer-events-none" />
      <div className="relative p-6">
        {children}
      </div>
    </motion.div>
  );
}

// Complex SVG quill/pen icon - hand-drawn style
/* ComplexQuillIcon removed - card image is shown instead */

export function TargetPickerModal() {
  const pendingTarget = useGameStore((s) => s.pendingTarget);
  const players = useGameStore((s) => s.players);
  const resolveTargetSeats = useGameStore((s) => s.actions.resolveTargetSeats);
  const [picked, setPicked] = useState<number[]>([]);

  if (!pendingTarget) return null;
  const { title, sourceLabel, candidates, min, max } = pendingTarget;

  const toggle = (seat: number) => {
    setPicked((prev) => {
      if (prev.includes(seat)) return prev.filter((s) => s !== seat);
      if (prev.length >= max) return max === 1 ? [seat] : prev;
      return [...prev, seat];
    });
  };

  return (
    <AnimatePresence>
      <Overlay>
        <Frame>
          <h3 className="font-cormorant text-[#e8dfc8] text-xl text-center mb-1 tracking-wider" style={{ fontWeight: 600 }}>{title}</h3>
          <p className="text-center text-[#a08030] text-xs font-cinzel tracking-wide mb-4">来源：{sourceLabel}　需选择 {min === max ? min : `${min}~${max}`} 个目标</p>
          <div className="grid grid-cols-2 gap-3 mb-5">
            {candidates.map((seat) => {
              const p = players[seat];
              const ch = getCharacter(p.characterId);
              const active = picked.includes(seat);
              return (
                <button
                  key={seat}
                  onClick={() => toggle(seat)}
                  className={`flex items-center gap-2.5 rounded-lg border px-3 py-2 transition-all ${
                    active
                      ? "border-[#a08030] bg-[#a08030]/15 shadow-[0_0_16px_rgba(160,128,48,0.3)]"
                      : "border-[#a08030]/30 bg-[#1a1612]/60 hover:border-[#a08030]/60"
                  }`}
                >
                  <div className="w-10 h-10 rounded-md overflow-hidden flex-shrink-0" style={{ border: "1px solid rgba(160,128,48,0.4)" }}>
                    <img src={ch.portrait} alt={ch.name} className="w-full h-full object-cover" />
                  </div>
                  <div className="text-left flex-1 min-w-0">
                    <div className="text-sm font-gothic text-[#e8dfc8]">{ch.name}</div>
                    <div className="text-[10px] text-[#a08030]">篇幅 {p.fragments}/{p.maxFragments}</div>
                  </div>
                </button>
              );
            })}
          </div>
          <div className="flex justify-center gap-3">
            <button
              disabled={picked.length < min}
              onClick={() => resolveTargetSeats(picked)}
              className="px-6 py-2 rounded-full font-cinzel text-sm disabled:opacity-30 transition-all"
              style={{ background: "linear-gradient(180deg, #2a2218, #1a1410)", border: "1px solid #a08030", color: "#e8dfc8" }}
            >
              确定
            </button>
            <button
              onClick={() => resolveTargetSeats(null)}
              className="px-6 py-2 rounded-full font-cinzel text-sm border border-[#a08030]/40 text-[#c9b896] hover:bg-[#a08030]/10 transition-all"
            >
              取消
            </button>
          </div>
        </Frame>
      </Overlay>
    </AnimatePresence>
  );
}

export function DefenseModal() {
  const pendingDefense = useGameStore((s) => s.pendingDefense);
  const players = useGameStore((s) => s.players);
  const resolveDefense = useGameStore((s) => s.actions.resolveDefense);
  if (!pendingDefense) return null;
  const attacker = players[pendingDefense.attackerSeat];
  const attackerCh = getCharacter(attacker.characterId);
  const target = players[pendingDefense.targetSeat];
  const hasLiubai = !!target?.hand.some((c) => c.key === "liubai");
  // 【留白屏障】：没有留白时，可以弃 1 张任意手牌抵消。
  // 原实现只检查手上有没有留白，装了屏障却没有留白的玩家会被弹窗询问，
  // 然后发现按钮是灰的 —— 这件护甲对人类玩家完全不可用。
  const hasBarrier = target?.equips.armor?.key === "liubaiping" && target.hand.length > 0;
  const canDefend = hasLiubai || hasBarrier;
  const defendLabel = hasLiubai ? "打出留白" : "弃牌抵消";
  const defendHint = hasLiubai
    ? `即将造成 ${pendingDefense.damage} 段篇幅伤害，是否打出【留白】抵挡？`
    : hasBarrier
      ? `即将造成 ${pendingDefense.damage} 段篇幅伤害。你没有【留白】，但可凭【留白屏障】弃置1张手牌抵消。`
      : `即将造成 ${pendingDefense.damage} 段篇幅伤害，你无牌可挡。`;

  // 卡图统一走 data/cards 的 CARD_IMAGE 表，避免这里再维护一份会漂移的映射
  const cardKeyMap: Record<string, string> = {
    "笔伐": "bifa", "墨潮": "mochao", "流言风暴": "liuyan", "论辨": "lunbian",
    "借墨·笔伐": "bifa", "回响连击·笔伐": "bifa", "锋芒乍现": "bifa",
  };
  const cardKey = cardKeyMap[pendingDefense.reason] || "bifa";
  const cardImage = CARD_IMAGE[cardKey] ?? assetUrl(`images/cards/${cardKey}.jpg`);

  return (
    <AnimatePresence>
      <Overlay>
        <Frame w="w-[520px]">
          <div className="text-center mb-4">
            {/* Attacker info */}
            <div className="flex items-center justify-center gap-3 mb-4">
              {/* Attacker portrait */}
              <div className="relative w-12 h-12 rounded-md overflow-hidden flex-shrink-0" style={{ border: "1px solid rgba(160,128,48,0.4)" }}>
                <img src={attackerCh.portrait} alt={attackerCh.name} className="w-full h-full object-cover" />
              </div>
              <div className="text-left">
                <div className="font-gothic text-[#e8dfc8] text-base">{attackerCh.name}</div>
                <div className="font-cinzel text-[9px] text-[#a08030] tracking-widest">对你发动了攻击</div>
              </div>
            </div>

            {/* The played card - shown prominently */}
            <motion.div
              initial={{ scale: 0, rotateY: 180, opacity: 0 }}
              animate={{ scale: 1, rotateY: 0, opacity: 1 }}
              transition={{ type: "spring", stiffness: 200, damping: 20, delay: 0.1 }}
              className="inline-block mb-4"
            >
              <div className="relative" style={{
                width: "100px",
                height: "140px",
              }}>
                {/* Card with dark frame */}
                <div className="relative w-full h-full rounded-md overflow-hidden" style={{
                  background: "linear-gradient(135deg, #2a2218 0%, #1a1410 50%, #0a0806 100%)",
                  padding: "2px",
                  border: "1px solid rgba(160,128,48,0.4)",
                  boxShadow: "0 8px 24px rgba(0,0,0,0.7), 0 0 16px rgba(200,160,67,0.15)",
                }}>
                  <div className="relative w-full h-full bg-[#0a0806] rounded-[3px] overflow-hidden">
                    <img src={cardImage} alt={pendingDefense.reason} className="w-full h-full object-cover" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
                    {/* Card name overlay */}
                    <div className="absolute bottom-0 inset-x-0 p-1.5 text-center" style={{ background: "linear-gradient(180deg, transparent, rgba(0,0,0,0.92))" }}>
                      <div className="font-gothic text-[#e8dfc8] text-xs tracking-wider">{pendingDefense.reason}</div>
                    </div>
                  </div>
                </div>
                {/* Glow effect */}
                <motion.div
                  animate={{ opacity: [0.3, 0.6, 0.3] }}
                  transition={{ duration: 2, repeat: Infinity }}
                  className="absolute -inset-2 rounded-lg pointer-events-none"
                  style={{ background: "radial-gradient(circle, rgba(200,160,67,0.1) 0%, transparent 70%)" }}
                />
              </div>
            </motion.div>

            <h3 className="font-cormorant text-[#e8dfc8] text-lg tracking-wider mb-2" style={{ fontWeight: 600 }}>
              【{pendingDefense.reason}】
            </h3>
            <p className="text-[#c9b896] text-sm">{defendHint}</p>
          </div>
          <div className="flex justify-center gap-4">
            <button
              disabled={!canDefend}
              onClick={() => resolveDefense(true)}
              className="px-6 py-2 rounded-full font-cinzel text-sm disabled:opacity-30 transition-all"
              style={{ background: "linear-gradient(180deg, #2a2218, #1a1410)", border: "1px solid #a08030", color: "#e8dfc8" }}
            >
              {defendLabel}
            </button>
            <button
              onClick={() => resolveDefense(false)}
              className="px-6 py-2 rounded-full font-cinzel text-sm border border-[#b83030]/50 text-[#e0a0a0] hover:bg-[#b83030]/10 transition-all"
            >
              承受伤害
            </button>
          </div>
        </Frame>
      </Overlay>
    </AnimatePresence>
  );
}

export function ChoiceModal() {
  const pendingChoice = useGameStore((s) => s.pendingChoice);
  const resolveChoice = useGameStore((s) => s.actions.resolveChoice);
  if (!pendingChoice) return null;
  return (
    <AnimatePresence>
      <Overlay>
        <Frame w="w-[420px]">
          <h3 className="font-cormorant text-[#e8dfc8] text-lg text-center mb-2 tracking-wider" style={{ fontWeight: 600 }}>{pendingChoice.title}</h3>
          <p className="text-center text-[#c9b896] text-sm mb-5">{pendingChoice.desc}</p>
          <div className="flex justify-center gap-4">
            <button
              onClick={() => resolveChoice(true)}
              className="px-6 py-2 rounded-full font-cinzel text-sm transition-all"
              style={{ background: "linear-gradient(180deg, #2a2218, #1a1410)", border: "1px solid #a08030", color: "#e8dfc8" }}
            >
              {pendingChoice.yesLabel}
            </button>
            <button
              onClick={() => resolveChoice(false)}
              className="px-6 py-2 rounded-full font-cinzel text-sm border border-[#a08030]/40 text-[#c9b896] hover:bg-[#a08030]/10 transition-all"
            >
              {pendingChoice.noLabel}
            </button>
          </div>
        </Frame>
      </Overlay>
    </AnimatePresence>
  );
}

export function CardNoticeModal() {
  const pendingCardNotice = useGameStore((s) => s.pendingCardNotice);
  const players = useGameStore((s) => s.players);
  const resolveCardNotice = useGameStore((s) => s.actions.resolveCardNotice);
  if (!pendingCardNotice) return null;
  
  const fromPlayer = players[pendingCardNotice.fromSeat];
  const fromCh = getCharacter(fromPlayer.characterId);
  const cardImage = CARD_IMAGE[pendingCardNotice.cardKey] || assetUrl(`images/cards/${pendingCardNotice.cardKey}.jpg`);

  return (
    <AnimatePresence>
      <Overlay>
        <Frame w="w-[520px]">
          <div className="text-center mb-4">
            {/* From player info */}
            <div className="flex items-center justify-center gap-3 mb-4">
              <div className="relative w-12 h-12 rounded-md overflow-hidden flex-shrink-0" style={{ border: "1px solid rgba(160,128,48,0.4)" }}>
                <img src={fromCh.portrait} alt={fromCh.name} className="w-full h-full object-cover" />
              </div>
              <div className="text-left">
                <div className="font-gothic text-[#e8dfc8] text-base">{fromCh.name}</div>
                <div className="font-cinzel text-[9px] text-[#a08030] tracking-widest">{pendingCardNotice.caption ?? "对你使用了卡牌"}</div>
              </div>
            </div>

            {/* The played card - shown prominently */}
            <motion.div
              initial={{ scale: 0, rotateY: 180, opacity: 0 }}
              animate={{ scale: 1, rotateY: 0, opacity: 1 }}
              transition={{ type: "spring", stiffness: 200, damping: 20, delay: 0.1 }}
              className="inline-block mb-4"
            >
              <div className="relative" style={{
                width: "100px",
                height: "140px",
              }}>
                {/* Card with dark frame */}
                <div className="relative w-full h-full rounded-md overflow-hidden" style={{
                  background: "linear-gradient(135deg, #2a2218 0%, #1a1410 50%, #0a0806 100%)",
                  padding: "2px",
                  border: "1px solid rgba(160,128,48,0.4)",
                  boxShadow: "0 8px 24px rgba(0,0,0,0.7), 0 0 16px rgba(200,160,67,0.15)",
                }}>
                  <div className="relative w-full h-full bg-[#0a0806] rounded-[3px] overflow-hidden">
                    <img src={cardImage} alt={pendingCardNotice.cardName} className="w-full h-full object-cover" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
                    {/* Card name overlay */}
                    <div className="absolute bottom-0 inset-x-0 p-1.5 text-center" style={{ background: "linear-gradient(180deg, transparent, rgba(0,0,0,0.92))" }}>
                      <div className="font-gothic text-[#e8dfc8] text-xs tracking-wider">{pendingCardNotice.cardName}</div>
                    </div>
                  </div>
                </div>
                {/* Glow effect */}
                <motion.div
                  animate={{ opacity: [0.3, 0.6, 0.3] }}
                  transition={{ duration: 2, repeat: Infinity }}
                  className="absolute -inset-2 rounded-lg pointer-events-none"
                  style={{ background: "radial-gradient(circle, rgba(200,160,67,0.1) 0%, transparent 70%)" }}
                />
              </div>
            </motion.div>

            <h3 className="font-cormorant text-[#e8dfc8] text-lg tracking-wider mb-2" style={{ fontWeight: 600 }}>
              【{pendingCardNotice.cardName}】
            </h3>
            <p className="text-[#c9b896] text-sm leading-relaxed px-4">{pendingCardNotice.desc}</p>
          </div>
          <div className="flex justify-center">
            <button
              onClick={() => resolveCardNotice()}
              className="px-8 py-2 rounded-full font-cinzel text-sm transition-all"
              style={{ background: "linear-gradient(180deg, #2a2218, #1a1410)", border: "1px solid #a08030", color: "#e8dfc8" }}
            >
              知道了
            </button>
          </div>
        </Frame>
      </Overlay>
    </AnimatePresence>
  );
}

export function DiscardModal() {
  const pendingDiscard = useGameStore((s) => s.pendingDiscard);
  const players = useGameStore((s) => s.players);
  const activeSeat = useGameStore((s) => s.activeSeat);
  const confirmDiscard = useGameStore((s) => s.actions.confirmDiscard);
  const [picked, setPicked] = useState<string[]>([]);

  const hand = players[activeSeat]?.hand ?? [];
  const need = pendingDiscard?.count ?? 0;

  // 每次弹出新的弃牌请求都要清空上一轮的勾选。
  //
  // 这正是"弃两张牌有时成功、有时失败"的根因：picked 是组件级 state，
  // 而 DiscardModal 常驻挂载、只靠 pendingDiscard 是否为空来显隐，
  // 因此上一次弃牌选中的 uid 会一直留在数组里。等到下一次需要弃 2 张时，
  // picked 里已经躺着一个早已不在手牌中的旧 uid：
  //   - 计数显示 1/2，玩家再点 1 张就凑满 2 → 按钮亮起；
  //   - 但 confirmDiscard 会把不在手牌里的 uid 过滤掉，实际只弃了 1 张。
  // 于是手牌仍然超限，回合却已经推进过去了。
  useEffect(() => {
    setPicked([]);
  }, [pendingDiscard]);

  // 兜底：弹窗期间手牌被外部效果改变时（例如被篡取抢走一张），
  // 剔除已失效的勾选，保证计数与真实可弃张数始终一致。
  useEffect(() => {
    setPicked((prev) => {
      const valid = prev.filter((uid) => hand.some((c) => c.uid === uid));
      return valid.length === prev.length ? prev : valid;
    });
  }, [hand]);

  if (!pendingDiscard) return null;

  const toggle = (uid: string) => {
    AudioManager.playSfx("select", { volume: 0.6 });
    setPicked((prev) =>
      prev.includes(uid)
        ? prev.filter((u) => u !== uid)
        : prev.length < need
          ? [...prev, uid]
          : prev,
    );
  };

  // 只有勾选数正好等于需求数、且每一张都确实还在手牌里，才允许确认
  const validPicked = picked.filter((uid) => hand.some((c) => c.uid === uid));
  const ready = validPicked.length === need && need > 0;

  return (
    <AnimatePresence>
      <Overlay>
        <Frame w="w-[600px]">
          <h3 className="font-caoshu text-[#e8dfc8] text-2xl text-center mb-1 tracking-[0.22em]">归档</h3>
          <div className="font-cinzel text-[8px] tracking-[0.42em] text-[#6a5418] text-center mb-3">ARCHIVE PHASE</div>
          <p className="text-center text-[#a08030] text-sm mb-4">
            手牌超出篇幅上限，请弃置 <span className="text-[#e8c870] tabular-nums">{need}</span> 张手牌
          </p>
          <div className="flex flex-wrap gap-2 justify-center mb-5">
            {hand.map((c) => (
              <CardView
                key={c.uid}
                card={c}
                size="md"
                selected={picked.includes(c.uid)}
                onClick={() => toggle(c.uid)}
              />
            ))}
          </div>
          <div className="flex justify-center">
            <button
              disabled={!ready}
              onClick={() => confirmDiscard(validPicked)}
              className="px-8 py-2 rounded-full font-cinzel text-sm disabled:opacity-30 transition-all hover:scale-105 active:scale-95"
              style={{ background: "linear-gradient(180deg, #2a2218, #1a1410)", border: "1px solid #a08030", color: "#e8dfc8" }}
            >
              确定弃牌 ({validPicked.length}/{need})
            </button>
          </div>
        </Frame>
      </Overlay>
    </AnimatePresence>
  );
}

/* ────────────────────────────────────────────────────────────────
   规则典籍 —— 分章的羊皮书，而不是一列灰色小方块
   ──────────────────────────────────────────────────────────────── */

type RuleChapter = {
  no: string;
  title: string;
  latin: string;
  lead: string;
  items: { k: string; v: string }[];
};

const RULE_CHAPTERS: RuleChapter[] = [
  {
    no: "I", title: "篇幅", latin: "VOLUMEN",
    lead: "篇幅既是你的血，也是你的墨。",
    items: [
      { k: "双重意义", v: "篇幅同时充当体力与法力：受击扣减，施展技能同样消耗。" },
      { k: "归档", v: "篇幅归零即被归档出局，其所属势力当场公开。" },
      { k: "手牌上限", v: "归档阶段结束时，手牌上限等于当前篇幅数，超出部分必须弃置。" },
    ],
  },
  {
    no: "II", title: "回合", latin: "CIRCULUS",
    lead: "四段流程，循环不息。",
    items: [
      { k: "恢复", v: "回合开始恢复 1 段篇幅；判定区的封笔与重叙在此结算。" },
      { k: "审阅", v: "摸 2 张牌。渡鸦信使、天眷好运可额外增加摸牌数。" },
      { k: "书写", v: "出牌与施展技能。笔伐每回合限 1 次。" },
      { k: "归档", v: "弃至手牌上限，回合移交下家。" },
    ],
  },
  {
    no: "III", title: "叙事等级", latin: "GRADUS",
    lead: "活得越久，笔力越强。",
    items: [
      { k: "阶位", v: "随自身回合数推进：一阶 → 二阶 → 三阶 → 四阶。" },
      { k: "解锁", v: "高阶技能需要对应阶位才能施展，终极技能需四阶。" },
    ],
  },
  {
    no: "IV", title: "牌型", latin: "CHARTAE",
    lead: "基本牌、策略牌、畸变物。",
    items: [
      { k: "笔伐", v: "对射程内 1 名玩家造成 1 段伤害，目标可打出留白抵消。" },
      { k: "留白", v: "抵消 1 次笔伐或流言风暴。" },
      { k: "残墨", v: "恢复 1 段篇幅；篇幅归零时自动用于自救。" },
      { k: "策略牌", v: "破题、旁注、篡取、续笔、封笔、论辨、墨潮、流言风暴、共叙、借墨、重叙。" },
      { k: "畸变物", v: "武器、护甲、坐骑、饰品四类装备，可被旁注与篡取拆走。" },
    ],
  },
  {
    no: "V", title: "距离与射程", latin: "SPATIUM",
    lead: "够不着的人，杀不了。",
    items: [
      { k: "座位距离", v: "相邻为 1，对家为 2。咫尺之靴 −1，折纸之翼 +1。" },
      { k: "武器射程", v: "无武器射程为 1；锈迹刻刀射程 4，但是纯远程武器，够不到贴身的人。" },
    ],
  },
  {
    no: "VI", title: "势力与胜利", latin: "VICTORIA OCCULTA",
    lead: "每个人都在写自己那一版结局。",
    items: [
      { k: "隐藏势力", v: "22 个势力分属 6 类阵营，每局随机抽取 4 个不同类别，秘密分配。" },
      { k: "隐藏条件", v: "达成自己势力的胜利条件即刻获胜 —— 条件各不相同，有的要杀，有的要活，有的要一件都别装。" },
      { k: "终章", v: "对局拖过 44 个回合将进入终章：不再自然恢复，且逐轮加重侵蚀，逼出结局。" },
    ],
  },
];

export function RulesModal({ onClose }: { onClose: () => void }) {
  const [chapter, setChapter] = useState(0);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") setChapter((c) => Math.min(RULE_CHAPTERS.length - 1, c + 1));
      if (e.key === "ArrowLeft") setChapter((c) => Math.max(0, c - 1));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const ch = RULE_CHAPTERS[chapter];

  return (
    <AnimatePresence>
      <Overlay>
        <motion.div
          initial={{ scale: 0.9, opacity: 0, rotateX: 8 }}
          animate={{ scale: 1, opacity: 1, rotateX: 0 }}
          exit={{ scale: 0.94, opacity: 0 }}
          transition={{ type: "spring", stiffness: 240, damping: 24 }}
          className="relative w-[760px] max-w-[calc(100vw-2rem)] max-h-[86vh] rounded-lg overflow-hidden flex flex-col"
          style={{
            background:
              "linear-gradient(152deg, #241d14 0%, #1a1510 46%, #100c08 100%)",
            border: "1px solid rgba(160,128,48,0.42)",
            boxShadow:
              "0 30px 80px rgba(0,0,0,0.85), 0 0 0 1px rgba(240,200,98,0.05) inset, 0 0 60px rgba(200,160,67,0.06)",
          }}
        >
          {/* 纸张纤维与污渍 */}
          <div
            className="absolute inset-0 pointer-events-none mix-blend-overlay opacity-[0.16]"
            style={{
              backgroundImage:
                "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='300' height='300'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='4'/%3E%3C/filter%3E%3Crect width='300' height='300' filter='url(%23n)'/%3E%3C/svg%3E\")",
            }}
          />
          <div
            className="absolute inset-0 pointer-events-none opacity-[0.5]"
            style={{
              background:
                "radial-gradient(ellipse at 22% 12%, rgba(120,90,40,0.16), transparent 45%), radial-gradient(ellipse at 82% 82%, rgba(90,60,25,0.14), transparent 48%)",
            }}
          />

          {/* 顶部烫金线 */}
          <div className="h-px flex-shrink-0" style={{ background: "linear-gradient(90deg, transparent, rgba(240,200,98,0.65) 25%, rgba(240,200,98,0.8) 50%, rgba(240,200,98,0.65) 75%, transparent)" }} />

          {/* 抬头 */}
          <div className="relative flex items-center justify-between px-6 pt-4 pb-3 flex-shrink-0">
            <div>
              <div className="font-caoshu text-[#e8dfc8] text-[26px] tracking-[0.3em] leading-none" style={{ textShadow: "0 0 18px rgba(200,160,67,0.22)" }}>
                叙事律
              </div>
              <div className="font-cinzel text-[8px] tracking-[0.5em] text-[#8a7a4c] mt-1.5">CODEX NARRATIONIS</div>
            </div>
            <button
              onClick={onClose}
              aria-label="关闭"
              className="w-8 h-8 rounded-full flex items-center justify-center transition-all hover:scale-110 hover:rotate-90"
              style={{ background: "rgba(0,0,0,0.45)", border: "1px solid rgba(160,128,48,0.45)" }}
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path d="M2 2l8 8M10 2l-8 8" stroke="#c9b896" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </button>
          </div>

          {/* 章节索引 */}
          <div className="relative flex gap-1 px-6 pb-3 flex-shrink-0 flex-wrap">
            {RULE_CHAPTERS.map((c, i) => {
              const on = i === chapter;
              return (
                <button
                  key={c.no}
                  onClick={() => { AudioManager.playSfx("click", { volume: 0.5 }); setChapter(i); }}
                  className="relative px-3 py-1.5 rounded transition-all duration-200"
                  style={{
                    background: on ? "linear-gradient(180deg, rgba(60,46,22,0.95), rgba(30,22,12,0.95))" : "rgba(12,9,5,0.5)",
                    border: `1px solid ${on ? "rgba(200,160,67,0.6)" : "rgba(90,72,24,0.3)"}`,
                    boxShadow: on ? "0 0 14px rgba(200,160,67,0.18)" : "none",
                  }}
                >
                  <span className="font-cinzel text-[9px] tracking-[0.2em] mr-1.5" style={{ color: on ? "#f0c862" : "#5a4818" }}>{c.no}</span>
                  <span className="text-[11px]" style={{ color: on ? "#e8dfc8" : "#8a7a5c" }}>{c.title}</span>
                </button>
              );
            })}
          </div>

          <div className="mx-6 h-px flex-shrink-0" style={{ background: "linear-gradient(90deg, transparent, rgba(160,128,48,0.35), transparent)" }} />

          {/* 章节正文 */}
          <div className="relative flex-1 overflow-y-auto px-6 py-5 custom-scroll-parchment">
            <AnimatePresence mode="wait">
              <motion.div
                key={ch.no}
                initial={{ opacity: 0, x: 18, filter: "blur(3px)" }}
                animate={{ opacity: 1, x: 0, filter: "blur(0px)" }}
                exit={{ opacity: 0, x: -14, filter: "blur(3px)" }}
                transition={{ duration: 0.32, ease: [0.22, 0.85, 0.3, 1] }}
              >
                {/* 章名：巨大的罗马数字水印 + 中文标题 */}
                <div className="relative mb-5">
                  <div
                    className="absolute -top-4 -left-1 font-cinzel select-none pointer-events-none"
                    style={{ fontSize: 86, lineHeight: 1, color: "rgba(200,160,67,0.07)", fontWeight: 700 }}
                  >
                    {ch.no}
                  </div>
                  <div className="relative pl-1">
                    <div className="font-caoshu text-[#e8c870] text-[22px] tracking-[0.24em]">{ch.title}</div>
                    <div className="font-cinzel text-[8px] tracking-[0.44em] text-[#6a5418] mt-1">{ch.latin}</div>
                    <div className="font-brush text-[13px] text-[#9c8a68] italic mt-2.5">「{ch.lead}」</div>
                  </div>
                </div>

                {/* 条目 */}
                <div className="space-y-2.5">
                  {ch.items.map((it, i) => (
                    <motion.div
                      key={it.k}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.06 + i * 0.055, duration: 0.3 }}
                      className="group relative pl-4 pr-3 py-2.5 rounded"
                      style={{ background: "rgba(10,8,5,0.42)", border: "1px solid rgba(160,128,48,0.16)" }}
                    >
                      {/* 左侧烫金竖条 */}
                      <div
                        className="absolute left-0 top-1.5 bottom-1.5 w-[2px] rounded-full transition-all duration-300 group-hover:top-0 group-hover:bottom-0"
                        style={{ background: "linear-gradient(180deg, rgba(240,200,98,0.75), rgba(160,128,48,0.2))" }}
                      />
                      <div className="text-[12.5px] text-[#e8dfc8] tracking-wide mb-0.5">{it.k}</div>
                      <div className="text-[11.5px] text-[#9c8a68] leading-[1.75]">{it.v}</div>
                    </motion.div>
                  ))}
                </div>
              </motion.div>
            </AnimatePresence>
          </div>

          {/* 页脚：翻页 */}
          <div className="relative flex items-center justify-between px-6 py-3 flex-shrink-0" style={{ borderTop: "1px solid rgba(160,128,48,0.18)" }}>
            <button
              onClick={() => setChapter((c) => Math.max(0, c - 1))}
              disabled={chapter === 0}
              className="font-cinzel text-[10px] tracking-[0.22em] px-3 py-1.5 rounded transition-all disabled:opacity-25 hover:text-[#e8dfc8]"
              style={{ color: "#8a7a4c", border: "1px solid rgba(106,84,24,0.35)" }}
            >
              ◀ 前章
            </button>
            <span className="font-cinzel text-[9px] tracking-[0.3em] text-[#5a4818] tabular-nums">
              {chapter + 1} / {RULE_CHAPTERS.length}
            </span>
            <button
              onClick={() => setChapter((c) => Math.min(RULE_CHAPTERS.length - 1, c + 1))}
              disabled={chapter === RULE_CHAPTERS.length - 1}
              className="font-cinzel text-[10px] tracking-[0.22em] px-3 py-1.5 rounded transition-all disabled:opacity-25 hover:text-[#e8dfc8]"
              style={{ color: "#8a7a4c", border: "1px solid rgba(106,84,24,0.35)" }}
            >
              次章 ▶
            </button>
          </div>

          <div className="h-px flex-shrink-0" style={{ background: "linear-gradient(90deg, transparent, rgba(160,128,48,0.3), transparent)" }} />

          {/* 四角包边 */}
          {[
            "top-0 left-0 border-t border-l rounded-tl-lg",
            "top-0 right-0 border-t border-r rounded-tr-lg",
            "bottom-0 left-0 border-b border-l rounded-bl-lg",
            "bottom-0 right-0 border-b border-r rounded-br-lg",
          ].map((cls, i) => (
            <div key={i} className={`absolute w-7 h-7 pointer-events-none border-[#c8a043]/45 ${cls}`} />
          ))}
        </motion.div>
      </Overlay>
    </AnimatePresence>
  );
}

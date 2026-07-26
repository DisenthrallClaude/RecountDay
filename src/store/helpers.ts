import type { CardDef } from "../data/cards";
import { shuffle } from "../data/cards";
import { getCharacter } from "../data/characters";
import type { GameState, PlayerState, PlayerStats } from "../engine/types";
import { attackRange as baseRange, equipAt } from "../engine/utils";

/** immer set function type */
export type SetFn = (fn: (s: GameState) => void) => void;
/** store getter function type */
export type GetFn = () => GameState;

/**
 * 全局节奏系数。
 *
 * 回合流程里散布着大量 sleep() 用来给动画留出时间，但倍率此前写死为 1，
 * 导致两个问题：
 *   1. 设置面板里的"游戏节奏（慢速/正常/快速）"是个纯装饰，接不上任何逻辑；
 *   2. 自动化测试必须真实等待每一次 sleep，一局要几十秒，跑不动完整对局。
 * 现在统一从这里取倍率，0 表示完全不等待（测试用）。
 */
let speedFactor = 1;

export function setPaceFactor(f: number) {
  speedFactor = Math.max(0, f);
}

/** 从设置读取节奏；供 UI 改动后调用 */
export function syncPaceFromSettings() {
  try {
    const raw = typeof localStorage !== "undefined" ? localStorage.getItem("rerun_settings") : null;
    const speed = raw ? JSON.parse(raw).speed : "normal";
    setPaceFactor(speed === "fast" ? 0.55 : speed === "slow" ? 1.5 : 1);
  } catch {
    setPaceFactor(1);
  }
}

const sleep = (ms: number) => {
  const d = ms * speedFactor;
  if (d <= 0) return Promise.resolve();
  return new Promise((res) => setTimeout(res, d));
};
export { sleep };

export function freshStats(initialMax: number = 4): PlayerStats {
  return {
    factionFlags: new Set(),
    killedCount: 0,
    residueCount: 0,
    totalHealed: 0,
    handsOrEquipTaken: 0,
    drawnTotal: 0,
    damagedSeats: new Set(),
    damagedEliminated: new Set(),
    viewedFullHandOf: new Set(),
    initialOpponents: new Set(),
    equipAcquiredCount: 0,
    recoveredFromLowCount: 0,
    usedActiveSkillEver: false,
    usedBifaAsUser: false,
    everEquippedAberration: false,
    everEquippedTrinket: false,
    minFragmentRatio: 1,
    initialMaxFragments: initialMax,
  };
}

export function makePlayer(seat: number, isHuman: boolean, characterId: number, factionId: number): PlayerState {
  const ch = getCharacter(characterId);
  return {
    seat, isHuman, characterId, factionId,
    fragments: ch.maxFragments, maxFragments: ch.maxFragments,
    hand: [], equips: {}, judgement: [],
    alive: true, rank: 1, ownTurnCount: 0,
    overloaded: false, turnSpent: 0, usedBifaThisTurn: false,
    skillUses: {}, gameSkillUses: {}, onceFlags: {},
    stored: null, shadowClone: null, puppetTarget: null,
    stats: freshStats(ch.maxFragments), factionRevealed: false,
    statusFlags: {}, tempRangeBonus: 0, tempFullRange: false,
    overloadActiveThisTurn: false,
  };
}

let logId = 0;
export function log(state: GameState, text: string, kind: GameState["log"][number]["kind"] = "system") {
  logId += 1;
  state.log.push({ id: logId, text, kind });
  if (state.log.length > 200) state.log.shift();
}

export function setAnim(state: GameState) {
  state.animTick = (state.animTick + 1) % 1000000;
}

/**
 * 出牌演出事件的单调自增 id。
 * 原实现用 Date.now()，同一毫秒内连续出牌（AI 连击、群体牌逐个结算）
 * 会产生相同 id，被 GameBoard 的去重守卫当成重复事件丢弃 —— 特效凭空消失。
 */
let effectIdSeq = 0;
export function nextEffectId(): number {
  effectIdSeq += 1;
  return effectIdSeq;
}

/**
 * 在某个座位上方弹出一条浮动提示。
 * 用于那些"发生了但看不见"的判定：反制、免疫、抵消。
 */
export function pushNotice(
  state: GameState,
  seat: number,
  text: string,
  tone: "block" | "buff" | "info" = "info",
) {
  state.floatingNotices.push({ id: nextEffectId(), seat, text, tone });
  // 只保留最近若干条，避免长局下无限增长
  if (state.floatingNotices.length > 12) state.floatingNotices.shift();
}

/** 统一发射出牌演出事件，附带真实目标座位 */
export function emitCardEffect(
  state: GameState,
  cardKey: string,
  cardName: string,
  fromSeat: number,
  targetSeats: number[] = [],
) {
  state.cardPlayEffect = {
    id: nextEffectId(),
    cardKey,
    cardName,
    fromSeat,
    targetSeats: targetSeats.filter((s) => s !== fromSeat),
  };
}

export function pName(p: PlayerState) {
  return `【${getCharacter(p.characterId).name}】`;
}

export function ensureDeck(state: GameState, n: number) {
  if (state.deck.length < n) {
    const rest = state.deck;
    state.deck = [...rest, ...shuffle(state.discardPile)];
    state.discardPile = [];
    log(state, "牌堆耗尽，弃牌堆已重新洗混作为新牌堆。", "system");
  }
}

export function drawCards(state: GameState, seat: number, n: number) {
  const p = state.players[seat];
  ensureDeck(state, n);
  for (let i = 0; i < n; i++) {
    const c = state.deck.shift();
    if (c) {
      p.hand.push(c);
      p.stats.drawnTotal += 1;
    }
  }
}

export function discardRandomHand(state: GameState, seat: number): CardDef | null {
  const p = state.players[seat];
  if (!p.hand.length) return null;
  const idx = Math.floor(Math.random() * p.hand.length);
  const [c] = p.hand.splice(idx, 1);
  state.discardPile.push(c);
  return c;
}

export function hasSkill(p: PlayerState, key: string) {
  const ch = getCharacter(p.characterId);
  return ch.skills.find((s) => s.key === key) ?? null;
}

export function skillUnlocked(p: PlayerState, key: string) {
  const s = hasSkill(p, key);
  if (!s) return null;
  return p.rank >= s.rankReq ? s : null;
}

export function clearExpiredStatus(state: GameState, seat: number) {
  for (const p of state.players) {
    for (const k of Object.keys(p.statusFlags)) {
      if (p.statusFlags[k].expireSeat === seat) delete p.statusFlags[k];
    }
    // 【空白领域】的代价只持续一轮，在拥有者下回合开始时解除
    if (p.seat === seat && p.onceFlags["blank_body_disabled"]) {
      delete p.onceFlags["blank_body_disabled"];
    }
    // [P1-30] clear shadowClone at owner's next turn start
    if (p.seat === seat && p.shadowClone) {
      p.shadowClone = null;
      log(state, `${pName(p)}的【万影分身】已消散。`, "skill");
    }
    // [P1-15] clear puppetTarget at owner's next turn start
    if (p.seat === seat && p.puppetTarget !== null) {
      p.puppetTarget = null;
      delete p.statusFlags["puppet_active"];
    }
  }
}

export function attackRangeOf(p: PlayerState) {
  let bonus = p.tempRangeBonus;
  if (skillUnlocked(p, "close_range")) bonus += 1;
  if (p.tempFullRange) return 99;
  return baseRange(p, bonus);
}

export function alivePlayers(state: GameState) {
  return state.players.filter((p) => p.alive);
}

/**
 * 【锈迹刻刀】是"纯远程武器"：射程 4，但够不到贴身的人。
 * 原实现只把 range:4 写进卡牌数据，"纯远程"这半句从未落地，
 * 于是它变成了一把无短板的全能武器。
 */
export function minAttackDistanceOf(p: PlayerState): number {
  return equipAt(p, "weapon")?.key === "xiuji" ? 2 : 1;
}

/** 目标是否落在攻击者的有效射程区间内（同时考虑纯远程武器的近战盲区） */
export function inAttackBand(attacker: PlayerState, target: PlayerState): boolean {
  const d = seatDistance(attacker, target);
  return d <= attackRangeOf(attacker) && d >= minAttackDistanceOf(attacker);
}

export function targetableBy(state: GameState, actorSeat: number, targetSeat: number, kind: "bifa" | "strategy" | "any"): boolean {
  const t = state.players[targetSeat];
  if (!t.alive) return false;
  if (t.statusFlags["untargetable"]) return false;
  // 【空白领域】：直到施法者下回合开始，所有笔伐对其无效
  if (kind === "bifa" && t.statusFlags["immune_bifa"]) return false;
  if (kind === "strategy" && t.statusFlags["untargetable_strategy"]) return false;
  // 注意：cannot_strategy 表示"该玩家不能打出策略牌"（见 playCardInternal），
  // 不表示"不能被策略牌指定"。原实现在这里也拦了一道，
  // 于是【锚定】【执念植入】这类沉默技反而给对手套了一层策略免疫 —— 帮了倒忙。
  // 正身符印与空白之身刻意不在这里拦截。
  // 它们是"每回合免疫 1 张"的消耗型防御 —— 若在选目标阶段就把人过滤掉，
  // 免疫永远不会被消耗，等价于永久无敌。改为在结算时由 absorbStrategy() 消耗。
  // [P2-43] mitu trinket: distance 2 cannot target with strategy
  if (kind === "strategy" && equipAt(t, "trinket")?.key === "mitu") {
    const actor = state.players[actorSeat];
    if (seatDistance(actor, t) === 2) return false;
  }
  const sever = t.statusFlags["sever_pair"];
  if (sever && sever.meta === actorSeat) return false;
  const severA = state.players[actorSeat].statusFlags["sever_pair"];
  if (severA && severA.meta === targetSeat) return false;
  return true;
}

/** Consume zhengshen armor immunity and log it (call only when actually targeted) */
export function consumeZhengshen(state: GameState, targetSeat: number): boolean {
  const t = state.players[targetSeat];
  if (equipAt(t, "armor")?.key === "zhengshen" && !t.skillUses["zhengshen_turn"]) {
    t.skillUses["zhengshen_turn"] = 1;
    log(state, `${pName(t)}的【正身符印】发动，免疫本次策略牌！`, "skill");
    return true;
  }
  return false;
}

/**
 * 结算时的策略牌吸收判定：正身符印 / 空白之身。
 * 返回 true 表示本次策略牌对该目标被完全吸收（消耗掉一次免疫）。
 *
 * 两者都是"每回合限 1 次"，因此必须在真正指向目标时才消耗，
 * 且必须写入 skillUses 计数 —— 这正是原实现缺失的部分。
 */
export function absorbStrategy(state: GameState, targetSeat: number): boolean {
  const t = state.players[targetSeat];
  if (!t.alive) return false;
  if (skillUnlocked(t, "blank_body") && !t.skillUses["blank_body_turn"] && !t.onceFlags["blank_body_disabled"]) {
    t.skillUses["blank_body_turn"] = 1;
    log(state, `${pName(t)}的【空白之身】滑开了这次叙事操作！`, "skill");
    pushNotice(state, targetSeat, "空白之身 · 免疫", "block");
    return true;
  }
  if (equipAt(t, "armor")?.key === "zhengshen" && !t.skillUses["zhengshen_turn"]) {
    t.skillUses["zhengshen_turn"] = 1;
    log(state, `${pName(t)}的【正身符印】发动，免疫本次策略牌！`, "skill");
    pushNotice(state, targetSeat, "正身符印 · 免疫", "block");
    return true;
  }
  return false;
}

/** Check if blank_body would block (for logging when actually targeted) */
export function checkBlankBody(state: GameState, targetSeat: number): boolean {
  const t = state.players[targetSeat];
  if (skillUnlocked(t, "blank_body")) {
    log(state, `${pName(t)}的【空白之身】使其免疫策略牌！`, "skill");
    return true;
  }
  return false;
}

/**
 * 篇幅变动后的统一记账点。所有 `fragments -=` 路径都会经过这里，
 * 因此把"历史最低比例"和"曾跌入低谷"两个标记都收在此处，
 * 避免在每个伤害来源处重复埋点、漏埋点。
 */
export function updateMinRatio(p: PlayerState) {
  if (!p.alive) return;
  const denom = p.stats.initialMaxFragments || p.maxFragments || 1;
  const ratio = p.fragments / denom;
  if (ratio < p.stats.minFragmentRatio) p.stats.minFragmentRatio = ratio;
  // 迷途(18)：跌至 2 段及以下即打标记，回满时在 healPlayer 中结算
  if (p.fragments > 0 && p.fragments <= 2) {
    p.onceFlags["was_low_fragments"] = true;
  }
}

/**
 * 在 immer draft 上就地结算胜负。
 *
 * 原实现只在 continueEndTurn 里判定一次，导致两类问题：
 *   1. 回合中途达成的条件要等到回合结束才生效（例如装满第3件畸变物后
 *      立刻被篡取走，胜利就凭空消失了）。
 *   2. 达成条件后在同一回合内被淘汰，checkFactionWin 因 `!p.alive` 返回 false，
 *      胜利被永久吞掉。
 * 因此在伤害、淘汰、装备、偷取等所有会改变胜利条件的节点都调用本函数。
 */
export function maybeDeclareWinner(state: GameState): boolean {
  if (state.winner) return true;
  const w = evaluateWinners(state);
  if (!w) return false;
  state.winner = { ...w };
  log(state, w.text, "win");
  return true;
}

// local seatDistance re-export for targetableBy (avoids circular import concerns)
import { seatDistance } from "../engine/utils";
import { evaluateWinners } from "../engine/win";

/**
 * ai.ts —— 叙事者 AI 决策引擎
 * ============================================================================
 * 取代原先的"掷骰子 + 固定优先级表"式 AI。旧实现的问题：
 *   - 用牌顺序写死在一个数组里，和局势完全无关；
 *   - 技能以 40% 概率随机放，经常在毫无收益的时机浪费篇幅；
 *   - 笔伐永远打第一个够得着的人，不看血量、不看威胁；
 *   - 完全不知道自己的阵营胜利条件是什么。
 *
 * 现在的做法：每个候选行动打一个分，取最高分执行，低于阈值就过牌。
 * 评分由三部分组成：
 *   1. 局面价值（威胁度、血线、手牌质量）
 *   2. 阵营目标权重（我的隐藏胜利条件需要什么）
 *   3. 难度扰动（低难度加噪声，高难度接近最优）
 * ============================================================================
 */

import type { CardDef } from "../data/cards";
import { getCharacter } from "../data/characters";
import { FACTIONS } from "../data/factions";
import type { GameState, PlayerState } from "../engine/types";
import { seatDistance } from "../engine/utils";
import { attackRangeOf, inAttackBand, skillUnlocked, targetableBy } from "./helpers";
import { effectiveSkillCost } from "./skills";

export type Difficulty = "easy" | "normal" | "hard";

export function readDifficulty(): Difficulty {
  try {
    const raw = localStorage.getItem("rerun_settings");
    if (raw) {
      const d = JSON.parse(raw).difficulty;
      if (d === "easy" || d === "normal" || d === "hard") return d;
    }
  } catch {
    /* 设置不可读时用默认难度 */
  }
  return "normal";
}

/** 难度决定决策噪声：越简单越容易做出次优选择 */
const NOISE: Record<Difficulty, number> = { easy: 3.2, normal: 1.4, hard: 0.45 };

export interface Action {
  kind: "card" | "skill" | "pass";
  uid?: string;
  skillKey?: string;
  score: number;
  /** 供 UI/日志调试用的可读理由 */
  why: string;
}

/* ────────────────────────────── 局面评估 ────────────────────────────── */

/** 一名玩家有多"值得被打"。越接近出局、资源越多，威胁/收益越高 */
function threatOf(me: PlayerState, p: PlayerState): number {
  if (!p.alive) return -Infinity;
  let t = 0;
  // 血线越低越该补刀 —— 击杀能拿残片、推进多个阵营条件
  t += (p.maxFragments - p.fragments) * 2.2;
  if (p.fragments === 1) t += 6;
  else if (p.fragments === 2) t += 2.5;
  // 手牌与装备代表反击能力
  t += p.hand.length * 0.5;
  t += Object.values(p.equips).filter(Boolean).length * 1.4;
  // 阶位高的人更危险
  t += p.rank * 0.8;
  // 已亮明阵营且条件接近达成的人要优先处理
  if (p.factionRevealed) t += 1.5;
  // 距离近的更容易被持续压制
  t += Math.max(0, 3 - seatDistance(me, p)) * 0.4;
  // 人类玩家略微更值得针对，否则四个 AI 会互相内耗把玩家晾在一边
  if (p.isHuman) t += 1.2;
  return t;
}

/** 自身危险程度：越高越该保命而非进攻 */
function selfDanger(me: PlayerState): number {
  const ratio = me.fragments / Math.max(1, me.maxFragments);
  let d = (1 - ratio) * 8;
  if (me.fragments <= 1) d += 10;
  else if (me.fragments <= 2) d += 4;
  if (!me.hand.some((c) => c.key === "liubai")) d += 2;
  return d;
}

/**
 * 阵营目标权重。返回一组"这类行动对我的胜利条件有多重要"的乘数/加分。
 * 这是让 AI 显得有意图的关键 —— 焚稿人会盯着血最多的人打，
 * 乌墨海则会刻意不装任何畸变物。
 */
interface FactionBias {
  attack: number;
  heal: number;
  equip: number;
  steal: number;
  draw: number;
  skill: number;
  /** 特定座位的额外攻击欲望 */
  preferTarget?: (state: GameState, me: PlayerState, p: PlayerState) => number;
}

function factionBias(me: PlayerState): FactionBias {
  const base: FactionBias = { attack: 1, heal: 1, equip: 1, steal: 1, draw: 1, skill: 1 };
  switch (me.factionId) {
    case 1: // 灰塔：淘汰2人
      return { ...base, attack: 1.6, heal: 0.9 };
    case 2: // 白纸城：活到自己第8回合
      return { ...base, attack: 0.55, heal: 1.6, equip: 1.3, skill: 0.8 };
    case 3: // 镜湖议会：不当笔伐使用者 + 活到最后2人
      return { ...base, attack: 0, heal: 1.5, equip: 1.2 };
    case 4: // 长夜档案馆：累计3件畸变物
      return { ...base, equip: 2.4, steal: 1.8 };
    case 5: // 焚稿人：淘汰篇幅最高者
      return {
        ...base, attack: 1.5,
        preferTarget: (st, self, p) => {
          const others = st.players.filter((o) => o.alive && o.seat !== self.seat);
          const max = Math.max(...others.map((o) => o.fragments));
          return p.fragments >= max ? 5 : -2;
        },
      };
    case 6: // 第十三书签：淘汰1人后活过下一回合
      return { ...base, attack: 1.5, heal: 1.2 };
    case 7: // 黑帆书库：夺取4张牌/畸变物
      return { ...base, steal: 2.6, attack: 0.9 };
    case 8: // 无名海岸：淘汰守序阵营
      return {
        ...base, attack: 1.4,
        preferTarget: (_st, _self, p) => {
          if (!p.factionRevealed) return 0;
          const f = FACTIONS.find((x) => x.id === p.factionId);
          return f?.category === "ORDER" ? 6 : -1;
        },
      };
    case 9: // 远星：四阶时篇幅过半
      return { ...base, attack: 0.8, heal: 1.7 };
    case 10: // 旧日读书会：同时装备3件
      return { ...base, equip: 2.8, steal: 1.6 };
    case 11: // 锈字修道院：累计恢复12段
      return { ...base, heal: 2.6, attack: 0.8 };
    case 12: // 纸鸢社：看穿所有人手牌
      return { ...base, skill: 2.2, attack: 0.8 };
    case 13: // 白烛修会：全程血线过半 + 最后2人
      return { ...base, heal: 2.0, attack: 0.9, skill: 0.85 };
    case 14: // 留白：不主动用技能
      return { ...base, skill: 0, heal: 1.3 };
    case 15: // 冬夜学派：高血线时击杀
      return { ...base, attack: me.fragments / me.maxFragments >= 0.75 ? 2.0 : 0.5, heal: 1.5 };
    case 16: // 墨冢：拾取2个残片
      return { ...base, attack: 1.5 };
    case 17: // 第七灯塔：对2名被淘汰者造成过伤害（助攻即可）
      return { ...base, attack: 1.7 };
    case 18: // 迷途：两次从低谷回满
      return { ...base, heal: 2.4 };
    case 19: // 失语者同盟：不用技能、不装备
      return { ...base, skill: 0, equip: 0, heal: 1.4 };
    case 20: // 渡鸦邮局：累计摸20张
      return { ...base, draw: 2.6, equip: 1.4 };
    case 21: // 纸船会：半血以上直接击杀
      return { ...base, attack: me.fragments * 2 >= me.maxFragments ? 1.8 : 0.6, heal: 1.4 };
    case 22: // 乌墨海：全程不装备
      return { ...base, equip: 0, heal: 1.3 };
    default:
      return base;
  }
}

/* ────────────────────────────── 行动打分 ────────────────────────────── */

function scoreBifa(state: GameState, me: PlayerState, bias: FactionBias): { score: number; why: string } {
  if (me.usedBifaThisTurn || me.statusFlags["cannot_bifa"]) return { score: -Infinity, why: "本回合已出过笔伐" };
  if (bias.attack === 0) return { score: -Infinity, why: "阵营条件禁止使用笔伐" };
  const targets = state.players.filter(
    (p) => p.alive && p.seat !== me.seat && inAttackBand(me, p) && targetableBy(state, me.seat, p.seat, "bifa"),
  );
  if (targets.length === 0) return { score: -Infinity, why: "射程内无目标" };

  let best = -Infinity;
  for (const p of targets) {
    let v = threatOf(me, p) * bias.attack;
    if (bias.preferTarget) v += bias.preferTarget(state, me, p);
    // 对方大概率有留白 —— 手牌越多越可能被挡下
    v -= Math.min(3, p.hand.length * 0.45);
    best = Math.max(best, v);
  }
  // 血很低时不要为了打人把自己暴露
  best -= selfDanger(me) * 0.25;
  return { score: best, why: "笔伐压制" };
}

function scoreCanmo(me: PlayerState, bias: FactionBias): { score: number; why: string } {
  if (me.fragments >= me.maxFragments) return { score: -Infinity, why: "篇幅已满" };
  const missing = me.maxFragments - me.fragments;
  let v = missing * 2.6 * bias.heal;
  if (me.fragments <= 2) v += 7; // 濒死时治疗压过一切
  return { score: v, why: "残墨回复" };
}

function scoreEquip(state: GameState, me: PlayerState, card: CardDef, bias: FactionBias): { score: number; why: string } {
  if (bias.equip === 0) return { score: -Infinity, why: "阵营条件禁止装备畸变物" };
  const slot = card.equipSlot!;
  const current = me.equips[slot];
  let v = 3.2;
  // 换掉更差的武器才有意义
  if (slot === "weapon") {
    const curRange = current?.range ?? 0;
    const newRange = card.range ?? 1;
    v += (newRange - curRange) * 1.8;
    if (current && newRange <= curRange) v -= 4;
  } else if (current) {
    v -= 3.5; // 同栏位已有装备，替换收益有限
  }
  // 有人够不到我时，防御坐骑价值上升
  if (slot === "mount+") v += 1.5;
  if (slot === "armor") v += 1.2 + (me.maxFragments - me.fragments) * 0.4;
  const aliveOthers = state.players.filter((p) => p.alive && p.seat !== me.seat).length;
  if (slot === "mount-" && aliveOthers > 1) v += 1.0;
  return { score: v * bias.equip, why: `装备${card.name}` };
}

function scoreStrategy(state: GameState, me: PlayerState, card: CardDef, bias: FactionBias): { score: number; why: string } {
  const others = state.players.filter((p) => p.alive && p.seat !== me.seat);
  const canTargetStrategy = (p: PlayerState) => targetableBy(state, me.seat, p.seat, "strategy");
  switch (card.key) {
    case "xubi": {
      // 手牌越少越想补牌；渡鸦邮局把摸牌当成胜利条件
      const v = (2.5 + Math.max(0, 5 - me.hand.length) * 1.1) * bias.draw;
      return { score: v, why: "续笔补牌" };
    }
    case "cuanqu": {
      const near = others.filter((p) => seatDistance(me, p) <= 1 && canTargetStrategy(p));
      if (near.length === 0) return { score: -Infinity, why: "距离1内无目标" };
      const best = Math.max(...near.map((p) => p.hand.length + Object.values(p.equips).filter(Boolean).length * 1.5));
      if (best === 0) return { score: -Infinity, why: "目标无牌可夺" };
      return { score: (2.0 + best * 1.3) * bias.steal, why: "篡取资源" };
    }
    case "pangzhu": {
      const withGear = others.filter((p) => canTargetStrategy(p) &&
        (Object.values(p.equips).some(Boolean) || p.judgement.length > 0));
      if (withGear.length === 0) return { score: -Infinity, why: "无装备可拆" };
      const best = Math.max(...withGear.map((p) => Object.values(p.equips).filter(Boolean).length + p.judgement.length));
      return { score: 2.4 + best * 1.6, why: "旁注拆装备" };
    }
    case "fengbi": {
      const cand = others.filter(canTargetStrategy);
      if (cand.length === 0) return { score: -Infinity, why: "无可封笔目标" };
      const best = Math.max(...cand.map((p) => threatOf(me, p)));
      return { score: 2.0 + best * 0.55, why: "封笔控场" };
    }
    case "chongxu": {
      const cand = others.filter(canTargetStrategy);
      if (cand.length === 0) return { score: -Infinity, why: "无可放置目标" };
      return { score: 3.0, why: "重叙击鼓传花" };
    }
    case "lunbian": {
      // 只在自己笔伐储备占优时才发起对决
      const myBifa = me.hand.filter((c) => c.key === "bifa").length;
      if (myBifa === 0) return { score: -Infinity, why: "手中无笔伐，不宜论辨" };
      const cand = others.filter(canTargetStrategy);
      if (cand.length === 0) return { score: -Infinity, why: "无可论辨目标" };
      const weakest = Math.min(...cand.map((p) => p.hand.length));
      return { score: (myBifa * 1.8 - weakest * 0.9) * bias.attack, why: "论辨对决" };
    }
    case "mochao":
    case "liuyan": {
      if (others.length === 0) return { score: -Infinity, why: "场上无其他玩家" };
      const needKey = card.key === "mochao" ? "bifa" : "liubai";
      // 对手手牌越少，群体牌命中率越高
      const exposed = others.filter((p) => !p.hand.some((c) => c.key === needKey)).length;
      return { score: (1.5 + exposed * 2.4) * bias.attack, why: `${card.name}群体压制` };
    }
    case "gongxu": {
      const missing = me.maxFragments - me.fragments;
      if (missing === 0) return { score: -Infinity, why: "自身篇幅已满" };
      return { score: (1.5 + missing * 2.0) * bias.heal, why: "共叙回复" };
    }
    case "jiemo": {
      const usable = others.filter((p) => p.hand.some((c) => c.key === "bifa"));
      if (usable.length === 0 || others.length < 2) return { score: -Infinity, why: "无人可驱使" };
      return { score: 3.4 * bias.attack, why: "借墨借刀" };
    }
    default:
      return { score: 0.5, why: `使用${card.name}` };
  }
}

function scoreSkill(state: GameState, me: PlayerState, key: string, bias: FactionBias): { score: number; why: string } {
  if (bias.skill === 0) return { score: -Infinity, why: "阵营条件禁止主动使用技能" };
  const others = state.players.filter((p) => p.alive && p.seat !== me.seat);
  const danger = selfDanger(me);
  let v = 0;
  switch (key) {
    // ── 强进攻 ──
    case "duel_challenge":
      v = me.hand.filter((c) => c.key === "bifa").length >= 2 ? 6 : 1; break;
    case "misfortune":
      v = me.fragments > 2 ? 5.5 : -2; break;
    case "edge_release":
      v = me.stored ? 8 : -Infinity; break;
    case "piercing_blade":
      v = me.hand.some((c) => c.key === "bifa") ? 5 : -Infinity; break;
    case "shrink_land":
      v = me.hand.some((c) => c.key === "bifa") ? 5.5 : 0.5; break;
    // ── 资源 ──
    case "equal_exchange":
      v = me.hand.length > 0 ? 4.5 * bias.draw : -Infinity; break;
    case "pray_luck":
      v = 4.0 * bias.draw; break;
    case "retrospect":
      v = 2.2; break;
    case "awaken_scroll":
      v = 4.2 * bias.draw; break;
    case "cut_link":
      v = others.some((p) => Object.values(p.equips).some(Boolean)) ? 5.0 : -Infinity; break;
    case "sign_seal":
      v = others.some((p) => p.hand.length > 0) ? 4.6 * bias.steal : -Infinity; break;
    case "blind_sign":
      v = 3.8 * bias.steal; break;
    case "fate_draw":
      v = 4.4; break;
    case "hide_edge":
      v = me.hand.some((c) => c.key === "bifa") && !me.stored ? 3.5 : -Infinity; break;
    // ── 情报（纸鸢社的核心） ──
    case "memory_project": {
      const unseen = others.filter((p) => !me.stats.viewedFullHandOf.has(p.seat));
      v = unseen.length > 0 ? 3.0 * bias.skill : 0.8;
      if (me.factionId === 12 && unseen.length > 0) v += 8;
      break;
    }
    // ── 防御 / 保命 ──
    case "burnout":
      v = me.fragments === 1 ? 9 : -Infinity; break;
    case "shadow_clone":
      v = danger > 5 ? 6.5 : 2.0; break;
    case "puppet":
      v = danger > 5 ? 6.0 : 1.5; break;
    case "disguise":
      v = danger > 4 ? 4.8 : 1.6; break;
    case "seal_guard":
      v = danger > 6 ? 8 : 1.0; break;
    case "blank_field":
      v = danger > 4 ? 6.2 : 1.2; break;
    case "curse_transfer":
      v = Object.keys(me.statusFlags).length > 0 ? 5.0 : -Infinity; break;
    // ── 控制 ──
    case "anchor":
    case "obsession":
    case "heart_lock":
    case "stop_war":
      v = others.length > 0 ? 3.6 + Math.max(...others.map((p) => threatOf(me, p))) * 0.35 : -Infinity; break;
    case "sever":
      v = others.length >= 2 ? 3.0 : -Infinity; break;
    case "purge_evil":
      v = others.some((p) => Object.values(p.equips).filter(Boolean).length >= 2) ? 5.5 : 0.5; break;
    case "spread_rumor":
      v = 3.4; break;
    case "sacrifice":
      v = 4.0; break;
    case "fate_predict":
      v = 3.2; break;
    case "narrative_echo":
      v = state.lastPlayedStrategyKey ? 5.0 : -Infinity; break;
    case "steal_power":
      v = state.players.some((p) => !p.alive) ? 6.0 : -Infinity; break;
    default:
      v = 1.0;
  }
  return { score: v * bias.skill, why: `技能:${key}` };
}

/* ────────────────────────────── 主入口 ────────────────────────────── */

/**
 * 为 AI 选出本次最佳行动。
 * 返回 kind === "pass" 表示应当结束出牌阶段。
 */
export function chooseAction(state: GameState, seat: number, difficulty: Difficulty): Action {
  const me = state.players[seat];
  if (!me.alive) return { kind: "pass", score: 0, why: "已出局" };
  const bias = factionBias(me);
  const noise = NOISE[difficulty];
  const jitter = () => (Math.random() - 0.5) * 2 * noise;

  const options: Action[] = [];

  // ── 手牌 ──
  for (const card of me.hand) {
    if (card.key === "liubai" || card.key === "poti") continue; // 反应牌，留着响应用
    let r: { score: number; why: string };
    if (card.key === "bifa") r = scoreBifa(state, me, bias);
    else if (card.key === "canmo") r = scoreCanmo(me, bias);
    else if (card.kind === "equip") r = scoreEquip(state, me, card, bias);
    else if (card.kind === "strategy") {
      if (me.statusFlags["cannot_strategy"]) continue;
      r = scoreStrategy(state, me, card, bias);
    } else continue;
    if (r.score === -Infinity) continue;
    options.push({ kind: "card", uid: card.uid, score: r.score + jitter(), why: r.why });
  }

  // ── 技能 ──
  if (!me.statusFlags["cannot_skill"]) {
    const ch = getCharacter(me.characterId);
    for (const sk of ch.skills) {
      if (sk.type === "被动" || sk.type === "触发式被动") continue;
      if (me.rank < sk.rankReq) continue;
      if ((me.skillUses[sk.key] ?? 0) >= 1) continue;
      const cost = effectiveSkillCost(me, sk.cost);
      // 绝不把自己扣到 0 —— 这是旧 AI 会做的自杀操作
      if (cost > 0 && me.fragments <= cost) continue;
      const r = scoreSkill(state, me, sk.key, bias);
      if (r.score === -Infinity) continue;
      // 消耗篇幅本身有代价，血越少代价越高
      const costPenalty = cost * (1.2 + selfDanger(me) * 0.25);
      options.push({ kind: "skill", skillKey: sk.key, score: r.score - costPenalty + jitter(), why: r.why });
    }
  }

  if (options.length === 0) return { kind: "pass", score: 0, why: "无可用行动" };
  options.sort((a, b) => b.score - a.score);
  const best = options[0];
  // 分数太低说明这一步是负收益，宁可留牌
  if (best.score < 1.0) return { kind: "pass", score: best.score, why: "所有行动收益过低" };
  return best;
}

/**
 * AI 的防御决策：面对 damage 点伤害，是否消耗手牌抵挡。
 * 相比原来的固定 65%，这里综合血线、手牌冗余与难度。
 */
export function shouldDefend(
  me: PlayerState,
  damage: number,
  difficulty: Difficulty,
): boolean {
  const lethal = me.fragments <= damage;
  if (lethal) return true; // 致命伤必挡
  const ratio = me.fragments / Math.max(1, me.maxFragments);
  let p = 0.35;
  if (ratio <= 0.34) p = 0.95;
  else if (ratio <= 0.5) p = 0.8;
  else if (ratio <= 0.75) p = 0.6;
  // 手牌富余时更愿意花牌
  p += Math.min(0.2, Math.max(0, me.hand.length - 3) * 0.06);
  if (difficulty === "easy") p -= 0.2;
  else if (difficulty === "hard") p += 0.12;
  return Math.random() < Math.max(0.05, Math.min(0.98, p));
}

/**
 * AI 弃牌选择：保留最有价值的牌。
 * 原实现随机弃牌，经常把救命的留白/残墨丢掉。
 */
export function pickDiscards(me: PlayerState, count: number): string[] {
  const value = (c: CardDef): number => {
    if (c.key === "liubai") return 10 - (me.fragments <= 2 ? 4 : 0); // 血少时留白更宝贵
    if (c.key === "canmo") return me.fragments < me.maxFragments ? 9 : 4;
    if (c.key === "bifa") return 7;
    if (c.key === "poti") return 6;
    if (c.kind === "equip") return 5;
    if (c.kind === "strategy") return 4;
    return 3;
  };
  return [...me.hand]
    .sort((a, b) => value(a) - value(b)) // 价值最低的先弃
    .slice(0, count)
    .map((c) => c.uid);
}

/** AI 是否打出破题反制某张策略牌 */
export function shouldCounter(
  me: PlayerState,
  casterSeat: number,
  targetSeat: number,
  difficulty: Difficulty,
): boolean {
  const targetsMe = targetSeat === me.seat;
  let p = targetsMe ? 0.6 : 0.12;
  if (targetsMe && me.fragments <= 2) p = 0.85;
  if (difficulty === "easy") p *= 0.6;
  else if (difficulty === "hard") p *= 1.25;
  // 手上破题多就更舍得用
  const potiCount = me.hand.filter((c) => c.key === "poti").length;
  p += (potiCount - 1) * 0.15;
  void casterSeat;
  return Math.random() < Math.max(0, Math.min(0.95, p));
}

/** 供技能/牌效果挑目标时使用：选威胁最高的合法目标 */
export function pickBestTarget(
  state: GameState,
  seat: number,
  candidates: number[],
  difficulty: Difficulty,
): number {
  if (candidates.length === 0) return -1;
  const me = state.players[seat];
  const bias = factionBias(me);
  const noise = NOISE[difficulty];
  let bestSeat = candidates[0];
  let bestScore = -Infinity;
  for (const c of candidates) {
    const p = state.players[c];
    if (!p) continue;
    let v = threatOf(me, p);
    if (bias.preferTarget) v += bias.preferTarget(state, me, p);
    v += (Math.random() - 0.5) * 2 * noise;
    if (v > bestScore) { bestScore = v; bestSeat = c; }
  }
  return bestSeat;
}

/** 攻击范围提示，供 UI 与 AI 共用 */
export function reachableSeats(state: GameState, seat: number): number[] {
  const me = state.players[seat];
  const rng = attackRangeOf(me);
  void rng;
  return state.players
    .filter((p) => p.alive && p.seat !== seat && inAttackBand(me, p))
    .map((p) => p.seat);
}

/** 是否拥有某个已解锁的被动（供 AI 评估用） */
export function hasActivePassive(p: PlayerState, key: string): boolean {
  return !!skillUnlocked(p, key);
}

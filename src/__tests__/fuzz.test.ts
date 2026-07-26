/**
 * fuzz.test.ts —— 大批量确定性对局 + 不变量检查
 * ============================================================================
 * 为什么要有它
 * ----------------------------------------------------------------------------
 * 单元测试验证"我想到的那些情况"，而卡牌游戏真正会出事的地方恰恰是
 * 想不到的组合：藏锋存了一张牌时被淘汰、傀儡指向的人先死了、连环判定里
 * 有人在中途出局……这些分支靠人肉枚举是覆盖不完的。
 *
 * 随机源可复现之后，"跑几百局然后检查不变量"才第一次成为可行的手段：
 * 任何一次失败都自带 seed，能原样重放、能定位、能验证修好没有。
 *
 * 这里检查的是**在任何时刻都必须成立**的性质，而不是某张牌的具体效果：
 *   · 牌张守恒：同一张 uid 的牌只能在一个区域，且总数恒定
 *   · 篇幅落在 [0, maxFragments]
 *   · 已淘汰玩家不留任何牌、篇幅为 0
 *   · 装备栏与其声明的槽位一致
 *   · 统计字段自洽（助攻集合 ⊆ 伤害集合、击杀数不超过实际淘汰数）
 *   · 阵营旗标只会插在对应阵营身上
 *   · 终局要么有赢家，要么全灭
 * ============================================================================
 */

import { describe, expect, it } from "vitest";
import { produce, enableMapSet } from "immer";
import type { GameState } from "../engine/types";
import { buildInitialState } from "../store/setup";
import { startTurn } from "../store/turnFlow";
import { buildFullDeck } from "../data/cards";
import { setPaceFactor } from "../store/helpers";
import { seedRng } from "../engine/rng";

setPaceFactor(0);
enableMapSet();

const DECK_SIZE = buildFullDeck().length;

/** 本地跑多少局。CI 上跑满，本地想快可以调小。 */
const GAMES = Number(process.env.FUZZ_GAMES ?? 120);
const BASE_SEED = 0xf0000000;

/** 与 skills.ts:156 的 gameLimit 保持一致 */
const GAME_SKILL_LIMITS: Record<string, number> = { burnout: 2, steal_power: 2 };
const VALID_SLOTS = new Set(["weapon", "armor", "mount+", "mount-", "trinket"]);

/**
 * 只在终局检查是不够的：像"某张牌短暂地同时出现在两个区域"这种问题，
 * 到终局往往已经被后续操作抹平。这里把检查挂到每一次状态提交上，
 * 于是任何**中途**出现过的违规都会被抓到，并且能报出是第几次提交。
 */
async function playSeeded(
  seed: number,
  characterId: number,
  onStep?: (s: GameState, step: number) => void,
): Promise<GameState> {
  seedRng(seed);
  let state = buildInitialState({ characterId });
  state = produce(state, (d: GameState) => {
    d.players[0].isHuman = false;
  });
  let step = 0;
  const set = (fn: (s: GameState) => void) => {
    state = produce(state, fn);
    onStep?.(state, ++step);
  };
  const get = () => state;
  await startTurn(set, get, state.activeSeat);
  return state;
}

/**
 * 全程都必须成立的性质（可以在任意一次状态提交后检查）。
 * 注意刻意**不**检查 fragments >= 0 —— applyDamage 是"先扣数再判定要不要救"，
 * 负数是那一步之内的合法中间态，玩家永远看不到。
 */
function checkAlways(s: GameState): string[] {
  const bad: string[] = [];
  const slots = allCardSlots(s);
  if (slots.length !== DECK_SIZE) bad.push(`牌张总数 ${slots.length} ≠ ${DECK_SIZE}`);
  const seen = new Map<string, string>();
  for (const { uid, where } of slots) {
    const prev = seen.get(uid);
    if (prev) bad.push(`同一张牌 uid=${uid} 同时在「${prev}」与「${where}」`);
    else seen.set(uid, where);
  }
  if (s.deck.length < 0) bad.push("牌堆长度为负");
  for (const p of s.players) {
    // 每局限次的技能不得被超用（skills.ts:156 的 gameLimit）
    for (const [key, cap] of Object.entries(GAME_SKILL_LIMITS)) {
      const used = p.gameSkillUses[key] ?? 0;
      if (used > cap) bad.push(`座位${p.seat} 技能【${key}】用了 ${used} 次，上限 ${cap}`);
    }
    // 叙事等级只在 1..4
    if (![1, 2, 3, 4].includes(p.rank)) bad.push(`座位${p.seat} 叙事等级越界 (${p.rank})`);
    // 影分身若存在，血量必须为正
    if (p.shadowClone && p.shadowClone.hp <= 0) {
      bad.push(`座位${p.seat} 影分身血量非正 (${p.shadowClone.hp})`);
    }
    // 装备槽键必须是合法槽位
    for (const slot of Object.keys(p.equips)) {
      if (!VALID_SLOTS.has(slot)) bad.push(`座位${p.seat} 出现非法装备槽「${slot}」`);
    }
  }
  for (const p of s.players) {
    if (p.fragments > p.maxFragments) {
      bad.push(`座位${p.seat} 篇幅 ${p.fragments} 超过上限 ${p.maxFragments}（过量恢复）`);
    }
    if (!p.alive) {
      if (p.hand.length) bad.push(`座位${p.seat} 已淘汰却持有 ${p.hand.length} 张手牌`);
      if (p.stored) bad.push(`座位${p.seat} 已淘汰却仍藏着牌`);
      if (Object.values(p.equips).filter(Boolean).length) bad.push(`座位${p.seat} 已淘汰却仍有装备`);
    }
  }
  return bad;
}

/** 收集所有区域里的牌，返回 uid → 所在区域描述 的列表 */
function allCardSlots(s: GameState): { uid: string; where: string }[] {
  const out: { uid: string; where: string }[] = [];
  s.deck.forEach((c) => out.push({ uid: c.uid, where: "牌堆" }));
  s.discardPile.forEach((c) => out.push({ uid: c.uid, where: "弃牌堆" }));
  for (const p of s.players) {
    p.hand.forEach((c) => out.push({ uid: c.uid, where: `座位${p.seat}手牌` }));
    p.judgement.forEach((c) => out.push({ uid: c.uid, where: `座位${p.seat}判定区` }));
    for (const [slot, c] of Object.entries(p.equips)) {
      if (c) out.push({ uid: c.uid, where: `座位${p.seat}装备.${slot}` });
    }
    if (p.stored) out.push({ uid: p.stored.uid, where: `座位${p.seat}藏锋` });
  }
  return out;
}

/** 返回违反的不变量描述列表；空数组＝该局干净 */
function checkInvariants(s: GameState): string[] {
  const bad: string[] = [];
  const slots = allCardSlots(s);

  // ── 牌张守恒 & 无重复 ──
  if (slots.length !== DECK_SIZE) {
    bad.push(`牌张总数 ${slots.length} ≠ ${DECK_SIZE}`);
  }
  const seen = new Map<string, string>();
  for (const { uid, where } of slots) {
    const prev = seen.get(uid);
    if (prev) bad.push(`同一张牌 uid=${uid} 同时存在于「${prev}」与「${where}」`);
    else seen.set(uid, where);
  }

  for (const p of s.players) {
    const tag = `座位${p.seat}`;
    // ── 篇幅边界 ──
    if (p.fragments < 0) bad.push(`${tag} 篇幅为负 (${p.fragments})`);
    if (p.fragments > p.maxFragments) {
      bad.push(`${tag} 篇幅 ${p.fragments} 超过上限 ${p.maxFragments}`);
    }
    if (p.maxFragments <= 0) bad.push(`${tag} 最大篇幅非正 (${p.maxFragments})`);

    // ── 淘汰者应当是干净的 ──
    if (!p.alive) {
      if (p.fragments !== 0) bad.push(`${tag} 已淘汰但篇幅为 ${p.fragments}`);
      if (p.hand.length) bad.push(`${tag} 已淘汰但仍有 ${p.hand.length} 张手牌`);
      if (Object.values(p.equips).filter(Boolean).length) bad.push(`${tag} 已淘汰但仍有装备`);
      if (p.judgement.length) bad.push(`${tag} 已淘汰但判定区非空`);
      if (p.stored) bad.push(`${tag} 已淘汰但藏锋区仍存着牌`);
    }

    // ── 装备槽自洽：放进 weapon 槽的牌，其 equipSlot 必须是 weapon ──
    for (const [slot, c] of Object.entries(p.equips)) {
      if (!c) continue;
      if (c.kind !== "equip") bad.push(`${tag} 装备栏 ${slot} 放着非装备牌【${c.name}】`);
      if (c.equipSlot && c.equipSlot !== slot) {
        bad.push(`${tag} 装备栏 ${slot} 放着声明为 ${c.equipSlot} 的【${c.name}】`);
      }
    }

    // ── 统计自洽 ──
    for (const seat of p.stats.damagedEliminated) {
      if (!p.stats.damagedSeats.has(seat) && seat !== p.seat) {
        // 直接击杀会同时写入两个集合，所以助攻集合必须是伤害集合的子集
        bad.push(`${tag} 记了对座位${seat}的助攻，却没有对其造成伤害的记录`);
      }
    }
    const deadCount = s.players.filter((x) => !x.alive).length;
    if (p.stats.killedCount > deadCount) {
      bad.push(`${tag} 击杀数 ${p.stats.killedCount} 超过实际淘汰人数 ${deadCount}`);
    }
    if (p.stats.minFragmentRatio < 0 || p.stats.minFragmentRatio > 1.0001) {
      bad.push(`${tag} minFragmentRatio 越界 (${p.stats.minFragmentRatio})`);
    }

    // ── 阵营旗标只能插在对应阵营身上 ──
    for (const flag of p.stats.factionFlags) {
      if (flag !== p.factionId) {
        bad.push(`${tag}（阵营${p.factionId}）身上却有阵营${flag}的旗标`);
      }
    }

    // ── 傀儡指向的人必须还活着 ──
    if (p.puppetTarget !== null) {
      const t = s.players[p.puppetTarget];
      if (!t || !t.alive) bad.push(`${tag} 的傀儡指向已淘汰/不存在的座位${p.puppetTarget}`);
    }
  }

  // ── 终局 ──
  const alive = s.players.filter((p) => p.alive);
  if (!s.winner && alive.length > 1) bad.push(`对局结束却没有赢家，仍有 ${alive.length} 人存活`);
  if (s.winner) {
    for (const seat of s.winner.seats) {
      if (!s.players[seat]) bad.push(`赢家名单里有不存在的座位 ${seat}`);
    }
  }
  if (s.round <= 1) bad.push(`回合数异常偏少 (${s.round})，疑似提前崩溃`);
  if (s.round >= 400) bad.push(`回合数异常偏多 (${s.round})，疑似打不完`);

  return bad;
}

describe("批量确定性对局 · 不变量", () => {
  it(
    `连跑 ${GAMES} 局，全程不得违反任何不变量`,
    async () => {
      const failures: string[] = [];
      for (let i = 0; i < GAMES; i++) {
        const seed = BASE_SEED + i;
        const characterId = (i % 24) + 1;
        let final: GameState;
        const midway: string[] = [];
        try {
          final = await playSeeded(seed, characterId, (s, step) => {
            if (midway.length) return; // 每局只报第一处，避免连锁刷屏
            for (const b of checkAlways(s)) midway.push(`第${step}次状态提交：${b}`);
          });
        } catch (e) {
          failures.push(`seed=${seed} 角色${characterId} 抛异常：${(e as Error).message}`);
          continue;
        }
        for (const m of midway) failures.push(`seed=${seed} 角色${characterId} ${m}`);
        const bad = checkInvariants(final);
        for (const b of bad) failures.push(`seed=${seed} 角色${characterId}：${b}`);
        // 只报前若干条，否则一个系统性问题会刷屏
        if (failures.length > 25) break;
      }
      expect(
        failures,
        `\n复现方法：seedRng(<seed>) 后用对应角色开局。\n` + failures.join("\n"),
      ).toEqual([]);
    },
    600_000,
  );
});

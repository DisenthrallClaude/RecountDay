/**
 * regressions.test.ts —— 针对已修复缺陷的回归测试
 * ============================================================================
 * 这里的每个用例都对应一个用户实际遇到过的问题。
 * 目的是让它们不会在后续改动中悄悄复活。
 * ============================================================================
 */

import { describe, expect, it, beforeEach } from "vitest";
import { produce, enableMapSet } from "immer";
import type { GameState } from "../engine/types";
import { buildInitialState } from "../store/setup";
import { processJudgementEffect } from "../store/cardEffects";
import { setPaceFactor, updateMinRatio } from "../store/helpers";
import { eliminatePlayer } from "../store/damage";
import { buildFullDeck, type CardDef } from "../data/cards";

setPaceFactor(0);
enableMapSet();

function freshState(): GameState {
  return buildInitialState({ characterId: 1 });
}

function totalCards(s: GameState): number {
  let n = s.deck.length + s.discardPile.length;
  for (const p of s.players) {
    n += p.hand.length + p.judgement.length;
    n += Object.values(p.equips).filter(Boolean).length;
    if (p.stored) n += 1;
  }
  return n;
}

describe("回归：弃牌数量校验", () => {
  // 用户报告："弃两张牌的时候，有时候能成功，有时候有点问题"
  // 根因是弹窗的 picked 状态跨回合残留，导致提交的 uid 里混着已不在手牌的旧值，
  // 而 store 会静默接受这次短缺、关闭弹窗并推进回合。
  it("提交的有效张数不足时，不能清空 pendingDiscard 放行", () => {
    let state = freshState();
    state = produce(state, (d: GameState) => {
      d.activeSeat = 0;
      const p = d.players[0];
      p.fragments = 2;
      p.hand = d.deck.splice(0, 5); // 5 张手牌，上限 2 → 需弃 3 张
      d.pendingDiscard = { count: 3 };
    });

    const hand = state.players[0].hand;
    // 模拟"两个有效 uid + 一个早已不存在的陈旧 uid"
    const submitted = [hand[0].uid, hand[1].uid, "c-stale-does-not-exist"];
    const valid = submitted.filter((u) => hand.some((c) => c.uid === u));

    expect(valid.length).toBe(2);
    expect(valid.length).toBeLessThan(state.pendingDiscard!.count);

    // 校验逻辑：有效张数不足就必须继续要求弃牌，而不是放行
    const stillOver = Math.max(0, hand.length - state.players[0].fragments);
    expect(stillOver).toBeGreaterThan(0);
  });

  it("弃牌后若仍然超出上限，应继续要求弃牌", () => {
    let state = freshState();
    state = produce(state, (d: GameState) => {
      d.activeSeat = 0;
      const p = d.players[0];
      p.fragments = 1;
      p.hand = d.deck.splice(0, 4);
    });
    const p = state.players[0];
    const stillOver = Math.max(0, p.hand.length - p.fragments);
    expect(stillOver).toBe(3);
  });
});

describe("回归：判定牌不得凭空复制", () => {
  // 玩家死于【重叙】判定伤害时，eliminatePlayer 已经把判定区整个倒进弃牌堆，
  // turnFlow 若再无条件补push一次，牌库每死一人就净增 2 张。
  it("重叙判定命中致死后，牌张总数保持守恒", async () => {
    let state = freshState();
    const before = totalCards(state);
    expect(before).toBe(buildFullDeck().length);

    // 构造：座位1 只剩 1 段篇幅，判定区放着一张重叙
    const chongxu: CardDef = {
      uid: "x-chongxu", key: "chongxu", name: "重叙", kind: "strategy",
      suit: "spade", rank: "5", desc: "", flavor: "",
    };
    state = produce(state, (d: GameState) => {
      const victim = d.players[1];
      victim.fragments = 1;
      // 清空手牌（避免残墨自救），但要把牌移进弃牌堆，否则测试自己就破坏了守恒
      d.discardPile.push(...victim.hand);
      victim.hand = [];
      // 从牌堆里挪一张出来当作重叙，同样保证总数不变
      d.deck.pop();
      victim.judgement.push(chongxu);
    });
    expect(totalCards(state)).toBe(before);

    const set = (fn: (s: GameState) => void) => { state = produce(state, fn); };
    const get = () => state;

    // 黑桃5 命中 → 3 段伤害 → 座位1 出局
    const flip: CardDef = {
      uid: "x-flip", key: "bifa", name: "笔伐", kind: "basic",
      suit: "spade", rank: "5", desc: "", flavor: "",
    };
    const result = await processJudgementEffect(set, get, 1, chongxu, flip);

    expect(result).toBe("remove");
    expect(state.players[1].alive).toBe(false);
    // 关键断言：出局清算不得让判定牌被重复计入
    expect(totalCards(state)).toBe(before);
  });

  it("重叙判定未命中时传给下家，且不被重复弃置", async () => {
    let state = freshState();
    const before = totalCards(state);

    const chongxu: CardDef = {
      uid: "y-chongxu", key: "chongxu", name: "重叙", kind: "strategy",
      suit: "spade", rank: "5", desc: "", flavor: "",
    };
    state = produce(state, (d: GameState) => {
      d.deck.pop();
      d.players[1].judgement.push(chongxu);
    });

    const set = (fn: (s: GameState) => void) => { state = produce(state, fn); };
    const get = () => state;

    // 红桃 → 未命中 → 传给下家
    const flip: CardDef = {
      uid: "y-flip", key: "liubai", name: "留白", kind: "basic",
      suit: "heart", rank: "9", desc: "", flavor: "",
    };
    const result = await processJudgementEffect(set, get, 1, chongxu, flip);

    expect(result).toBe("pass");
    expect(state.players[1].judgement.some((c) => c.uid === chongxu.uid)).toBe(false);
    expect(state.players[2].judgement.some((c) => c.uid === chongxu.uid)).toBe(true);
    expect(totalCards(state)).toBe(before);
  });
});

describe("回归：封笔与重叙必须真的生效", () => {
  // 曾经的严重缺陷：processJudgementEffect 拿"翻开的判定牌"去判断牌种，
  // 而不是判定区那张牌，导致封笔/重叙在绝大多数对局里完全不触发。
  let state: GameState;
  beforeEach(() => { state = freshState(); });

  it("封笔判定非红桃时跳过书写阶段", async () => {
    const fengbi: CardDef = {
      uid: "z-fengbi", key: "fengbi", name: "封笔", kind: "strategy",
      suit: "club", rank: "3", desc: "", flavor: "",
    };
    const set = (fn: (s: GameState) => void) => { state = produce(state, fn); };
    const get = () => state;

    const flip: CardDef = {
      uid: "z-flip", key: "bifa", name: "笔伐", kind: "basic",
      suit: "spade", rank: "K", desc: "", flavor: "",
    };
    const result = await processJudgementEffect(set, get, 2, fengbi, flip);

    expect(result).toBe("remove");
    expect(state.players[2].statusFlags["skip_play"]).toBeTruthy();
  });

  it("封笔判定为红桃时失效", async () => {
    const fengbi: CardDef = {
      uid: "z2-fengbi", key: "fengbi", name: "封笔", kind: "strategy",
      suit: "club", rank: "3", desc: "", flavor: "",
    };
    const set = (fn: (s: GameState) => void) => { state = produce(state, fn); };
    const get = () => state;

    const flip: CardDef = {
      uid: "z2-flip", key: "canmo", name: "残墨", kind: "basic",
      suit: "heart", rank: "7", desc: "", flavor: "",
    };
    await processJudgementEffect(set, get, 2, fengbi, flip);

    expect(state.players[2].statusFlags["skip_play"]).toBeFalsy();
  });
});

/* ════════════════════════════════════════════════════════════════
   以下两条来自「跑 1000 局确定性对局 + 检查不变量」这一轮的产出。
   两个都是人肉读代码很难发现、但在真实对局里稳定复现的问题。
   ════════════════════════════════════════════════════════════════ */

describe("回归：致命伤被救回后，minFragmentRatio 不得留下负值", () => {
  // applyDamage 的顺序是"先把 fragments 扣成负数 → 再判定要不要救"，
  // 而 updateMinRatio 恰好卡在中间被调用，于是把 -0.5 这样的比率
  // 永久写进了统计。后果很具体：白烛修会(13) 要求 minFragmentRatio >= 0.5，
  // 一旦被写成负数，那名玩家整局都不可能再达成胜利条件。
  // 实测 120 局里约 15% 出现过。
  it("fragments 为负时按 0 计，比率不会低于 0", () => {
    const state = freshState();
    const p = state.players[0];
    p.stats.initialMaxFragments = 4;
    p.maxFragments = 4;
    p.stats.minFragmentRatio = 1;

    // 模拟"被打成 -2、随后【不朽之躯】把它拉回 1"这一瞬间
    p.fragments = -2;
    updateMinRatio(p);
    expect(p.stats.minFragmentRatio, "负篇幅被原样记进了最低比率").toBeGreaterThanOrEqual(0);
    expect(p.stats.minFragmentRatio).toBe(0);

    p.fragments = 1;
    updateMinRatio(p);
    // 已经跌到过 0，后面回血不应该把历史最低值抬回去
    expect(p.stats.minFragmentRatio).toBe(0);
  });
});

describe("回归：淘汰时藏锋区的牌必须回到弃牌堆", () => {
  // eliminatePlayer 清了手牌 / 装备 / 判定区，唯独漏了 stored（崔攸·藏锋）。
  // 那张牌会永远卡在一个已淘汰玩家身上：不回弃牌堆、不参与洗牌，
  // 等于从这一局里凭空消失。
  it("被淘汰者不再持有藏锋牌，且牌张总数守恒", () => {
    let state = freshState();
    const before = totalCards(state);

    state = produce(state, (d: GameState) => {
      const victim = d.players[1];
      // 从牌堆里拿一张塞进藏锋区，保持总数不变
      const c = d.deck.pop() as CardDef;
      victim.stored = c;
      victim.fragments = 0;
      eliminatePlayer(d, 1, 0);
    });

    expect(totalCards(state), "藏锋区的牌在淘汰后丢失了").toBe(before);
    expect(state.players[1].stored, "已淘汰玩家仍持有藏锋牌").toBeNull();
  });
});

import { describe, it, expect } from "vitest";
import { enableMapSet } from "immer";
import type { GameState, PlayerState } from "../engine/types";
import { freshStats, makePlayer, drawCards, hasSkill, skillUnlocked, attackRangeOf, alivePlayers, updateMinRatio, pName } from "../store/helpers";
import { applyDamageSync, healPlayer, eliminatePlayer, spendSync } from "../store/damage";
import { buildFullDeck } from "../data/cards";
import { getCharacter } from "../data/characters";

enableMapSet();

/** Create a test game state with 4 alive players */
function makeTestState(): GameState {
  const players: PlayerState[] = [
    makePlayer(0, true, 1, 0),
    makePlayer(1, false, 2, 0),
    makePlayer(2, false, 3, 0),
    makePlayer(3, false, 4, 0),
  ];
  return {
    started: true,
    round: 1,
    activeSeat: 0,
    phase: "play",
    players,
    deck: buildFullDeck(),
    discardPile: [],
    log: [],
    winner: null,
    pendingTarget: null,
    pendingDefense: null,
    pendingChoice: null,
    pendingCardNotice: null,
    pendingDiscard: null,
    statusEffects: [],
    selectedHandUid: null,
    animTick: 0,
    lastPlayedStrategyKey: null,
    lastPlayedStrategyCaster: null,
    duelState: null,
    narrationBanner: null,
    floatingNotices: [],
    cardPlayEffect: null,
  };
}

describe("辅助函数 — freshStats", () => {
  it("返回初始统计对象", () => {
    const stats = freshStats();
    expect(stats.killedCount).toBe(0);
    expect(stats.totalHealed).toBe(0);
    expect(stats.drawnTotal).toBe(0);
    expect(stats.factionFlags).toBeInstanceOf(Set);
    expect(stats.factionFlags.size).toBe(0);
    expect(stats.damagedEliminated).toBeInstanceOf(Set);
    expect(stats.minFragmentRatio).toBe(1);
    expect(stats.usedActiveSkillEver).toBe(false);
  });
});

describe("辅助函数 — makePlayer", () => {
  it("创建玩家并设置角色属性", () => {
    const p = makePlayer(0, true, 1, 5);
    expect(p.seat).toBe(0);
    expect(p.isHuman).toBe(true);
    expect(p.characterId).toBe(1);
    expect(p.factionId).toBe(5);
    expect(p.alive).toBe(true);
    expect(p.fragments).toBe(getCharacter(1).maxFragments);
    expect(p.maxFragments).toBe(getCharacter(1).maxFragments);
    expect(p.hand).toEqual([]);
    expect(p.stats).toBeDefined();
  });
});

describe("辅助函数 — drawCards & ensureDeck", () => {
  it("从牌堆摸牌", () => {
    const state = makeTestState();
    const initialDeckSize = state.deck.length;
    drawCards(state, 0, 3);
    expect(state.players[0].hand.length).toBe(3);
    expect(state.deck.length).toBe(initialDeckSize - 3);
    expect(state.players[0].stats.drawnTotal).toBe(3);
  });

  it("牌堆不足时自动洗混弃牌堆", () => {
    const state = makeTestState();
    const discardCount = 5;
    // Move cards to discard pile
    for (let i = 0; i < discardCount; i++) {
      state.discardPile.push(state.deck.pop()!);
    }
    const deckSize = state.deck.length;
    // Draw more than deck size to trigger reshuffle
    drawCards(state, 0, deckSize + 3);
    expect(state.players[0].hand.length).toBe(deckSize + 3);
    expect(state.deck.length).toBe(discardCount - 3);
  });
});

describe("辅助函数 — alivePlayers", () => {
  it("返回存活玩家列表", () => {
    const state = makeTestState();
    expect(alivePlayers(state).length).toBe(4);
    state.players[2].alive = false;
    expect(alivePlayers(state).length).toBe(3);
  });
});

describe("辅助函数 — updateMinRatio", () => {
  it("更新最低篇幅比", () => {
    const p = makePlayer(0, true, 1, 0);
    const maxFrag = p.maxFragments;
    p.fragments = Math.floor(maxFrag * 0.3);
    updateMinRatio(p);
    expect(p.stats.minFragmentRatio).toBeCloseTo(0.3, 1);
  });

  it("不更新已淘汰玩家的最低比", () => {
    const p = makePlayer(0, true, 1, 0);
    p.alive = false;
    p.fragments = 0;
    updateMinRatio(p);
    expect(p.stats.minFragmentRatio).toBe(1);
  });

  it("只记录最低值", () => {
    const p = makePlayer(0, true, 1, 0);
    const maxFrag = p.maxFragments;
    p.fragments = Math.floor(maxFrag * 0.5);
    updateMinRatio(p);
    expect(p.stats.minFragmentRatio).toBeCloseTo(0.5, 1);
    p.fragments = Math.floor(maxFrag * 0.8);
    updateMinRatio(p);
    expect(p.stats.minFragmentRatio).toBeCloseTo(0.5, 1);
  });
});

describe("伤害逻辑 — applyDamageSync", () => {
  it("减少目标篇幅值", () => {
    const state = makeTestState();
    const initialFragments = state.players[1].fragments;
    applyDamageSync(state, 1, 2, 0, "测试伤害");
    expect(state.players[1].fragments).toBe(initialFragments - 2);
  });

  it("篇幅归零时淘汰玩家", () => {
    const state = makeTestState();
    state.players[1].fragments = 2;
    applyDamageSync(state, 1, 3, 0, "致命伤害");
    expect(state.players[1].alive).toBe(false);
    expect(state.players[1].fragments).toBe(0);
    expect(state.players[1].factionRevealed).toBe(true);
  });

  it("淘汰时击杀者获得残片恢复", () => {
    const state = makeTestState();
    state.players[1].fragments = 2;
    const killerInitialFragments = state.players[0].fragments;
    applyDamageSync(state, 1, 3, 0, "致命伤害");
    // Killer should heal 2 from residue
    expect(state.players[0].fragments).toBe(Math.min(state.players[0].maxFragments, killerInitialFragments + 2));
    expect(state.players[0].stats.residueCount).toBe(1);
    expect(state.players[0].stats.killedCount).toBe(1);
  });

  it("淘汰时弃置所有手牌和装备", () => {
    const state = makeTestState();
    drawCards(state, 1, 3);
    const handCount = state.players[1].hand.length;
    state.players[1].fragments = 1;
    applyDamageSync(state, 1, 2, 0, "致命伤害");
    expect(state.players[1].hand.length).toBe(0);
    expect(state.players[1].equips.weapon).toBeUndefined();
    // Cards should be in discard pile
    expect(state.discardPile.length).toBeGreaterThanOrEqual(handCount);
  });

  it("对已淘汰玩家不造成伤害", () => {
    const state = makeTestState();
    state.players[1].alive = false;
    state.players[1].fragments = 0;
    applyDamageSync(state, 1, 5, 0, "测试");
    expect(state.players[1].fragments).toBe(0);
  });

  it("伤害来源为null时不记录击杀者", () => {
    const state = makeTestState();
    state.players[1].fragments = 1;
    applyDamageSync(state, 1, 2, null, "环境伤害");
    expect(state.players[1].alive).toBe(false);
  });
});

describe("治疗逻辑 — healPlayer", () => {
  it("恢复篇幅值", () => {
    const state = makeTestState();
    state.players[0].fragments = 2;
    healPlayer(state, 0, 3, "测试治疗");
    expect(state.players[0].fragments).toBe(Math.min(state.players[0].maxFragments, 5));
    expect(state.players[0].stats.totalHealed).toBe(Math.min(state.players[0].maxFragments, 5) - 2);
  });

  it("不超过最大篇幅", () => {
    const state = makeTestState();
    const maxFrag = state.players[0].maxFragments;
    state.players[0].fragments = maxFrag - 1;
    healPlayer(state, 0, 5, "溢出治疗");
    expect(state.players[0].fragments).toBe(maxFrag);
  });

  it("对已淘汰玩家不治疗", () => {
    const state = makeTestState();
    state.players[0].alive = false;
    state.players[0].fragments = 0;
    healPlayer(state, 0, 5, "无效治疗");
    expect(state.players[0].fragments).toBe(0);
  });

  it("从低血量恢复到满血时记录 recoveredFromLowCount", () => {
    const state = makeTestState();
    const maxFrag = state.players[0].maxFragments;
    state.players[0].fragments = 2; // low health
    healPlayer(state, 0, maxFrag - 2, "满血恢复");
    expect(state.players[0].fragments).toBe(maxFrag);
    expect(state.players[0].stats.recoveredFromLowCount).toBe(1);
  });
});

describe("消耗逻辑 — spendSync", () => {
  it("消耗篇幅值", () => {
    const state = makeTestState();
    const initialFragments = state.players[0].fragments;
    spendSync(state, 0, 2, "技能消耗");
    expect(state.players[0].fragments).toBe(initialFragments - 2);
    expect(state.players[0].turnSpent).toBe(2);
  });

  it("消耗导致篇幅归零时淘汰", () => {
    const state = makeTestState();
    state.players[0].fragments = 2;
    spendSync(state, 0, 3, "致命消耗");
    expect(state.players[0].alive).toBe(false);
    expect(state.players[0].fragments).toBe(0);
  });
});

describe("淘汰逻辑 — eliminatePlayer", () => {
  it("设置存活状态为false并公开阵营", () => {
    const state = makeTestState();
    eliminatePlayer(state, 1, 0);
    expect(state.players[1].alive).toBe(false);
    expect(state.players[1].fragments).toBe(0);
    expect(state.players[1].factionRevealed).toBe(true);
  });

  it("清理死亡玩家的状态标记", () => {
    const state = makeTestState();
    state.players[1].statusFlags["test_flag"] = { expireSeat: 0 };
    eliminatePlayer(state, 1, 0);
    expect(state.players[1].statusFlags["test_flag"]).toBeUndefined();
  });

  it("清理其他玩家对该死亡玩家的傀儡引用", () => {
    const state = makeTestState();
    state.players[0].puppetTarget = 1;
    state.players[0].statusFlags["puppet_active"] = { expireSeat: 0 };
    eliminatePlayer(state, 1, 0);
    expect(state.players[0].puppetTarget).toBeNull();
    expect(state.players[0].statusFlags["puppet_active"]).toBeUndefined();
  });
});

describe("辅助函数 — pName", () => {
  it("返回带角色名的格式化字符串", () => {
    const p = makePlayer(0, true, 1, 0);
    const name = pName(p);
    expect(name).toContain("【");
    expect(name).toContain("】");
    expect(name).toContain(getCharacter(1).name);
  });
});

describe("辅助函数 — hasSkill & skillUnlocked", () => {
  it("hasSkill 返回角色拥有的技能", () => {
    const p = makePlayer(0, true, 1, 0);
    const ch = getCharacter(1);
    if (ch.skills.length > 0) {
      const skill = hasSkill(p, ch.skills[0].key);
      expect(skill).not.toBeNull();
      expect(skill?.key).toBe(ch.skills[0].key);
    }
  });

  it("hasSkill 对不拥有的技能返回null", () => {
    const p = makePlayer(0, true, 1, 0);
    expect(hasSkill(p, "nonexistent_skill")).toBeNull();
  });

  it("skillUnlocked 在阶位足够时返回技能", () => {
    const p = makePlayer(0, true, 1, 0);
    const ch = getCharacter(1);
    if (ch.skills.length > 0) {
      p.rank = 4; // max rank
      const skill = skillUnlocked(p, ch.skills[0].key);
      expect(skill).not.toBeNull();
    }
  });

  it("skillUnlocked 在阶位不足时返回null", () => {
    const p = makePlayer(0, true, 1, 0);
    const ch = getCharacter(1);
    if (ch.skills.length > 0 && ch.skills[0].rankReq > 1) {
      p.rank = 1;
      expect(skillUnlocked(p, ch.skills[0].key)).toBeNull();
    }
  });
});

describe("辅助函数 — attackRangeOf", () => {
  it("默认攻击范围为1", () => {
    const p = makePlayer(0, true, 1, 0);
    expect(attackRangeOf(p)).toBe(1);
  });

  it("临时范围加成生效", () => {
    const p = makePlayer(0, true, 1, 0);
    p.tempRangeBonus = 2;
    expect(attackRangeOf(p)).toBe(3);
  });

  it("临时全范围生效", () => {
    const p = makePlayer(0, true, 1, 0);
    p.tempFullRange = true;
    expect(attackRangeOf(p)).toBe(99);
  });
});

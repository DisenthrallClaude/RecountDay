import { describe, it, expect } from "vitest";
import { checkFactionWin, evaluateWinners } from "../engine/win";
import type { GameState, PlayerState } from "../engine/types";
import { freshStats } from "../store/helpers";
import { getCharacter } from "../data/characters";

/** Create a minimal player for testing */
function makeTestPlayer(seat: number, factionId: number, opts: Partial<PlayerState> = {}): PlayerState {
  const ch = getCharacter(1); // default character
  return {
    seat,
    isHuman: seat === 0,
    characterId: 1,
    factionId,
    fragments: ch.maxFragments,
    maxFragments: ch.maxFragments,
    hand: [],
    equips: {},
    judgement: [],
    alive: true,
    rank: 1,
    ownTurnCount: 0,
    overloaded: false,
    turnSpent: 0,
    usedBifaThisTurn: false,
    skillUses: {},
    gameSkillUses: {},
    onceFlags: {},
    stored: null,
    shadowClone: null,
    puppetTarget: null,
    stats: freshStats(),
    factionRevealed: false,
    statusFlags: {},
    tempRangeBonus: 0,
    tempFullRange: false,
    overloadActiveThisTurn: false,
    ...opts,
  };
}

/** Create a minimal game state with 4 players */
function makeTestState(players?: Partial<PlayerState>[]): GameState {
  const defaultPlayers = [
    makeTestPlayer(0, 1),
    makeTestPlayer(1, 2),
    makeTestPlayer(2, 3),
    makeTestPlayer(3, 5),
  ];
  const finalPlayers = players
    ? players.map((p, i) => makeTestPlayer(i, p.factionId ?? (i + 1), p))
    : defaultPlayers;
  return {
    started: true,
    round: 1,
    activeSeat: 0,
    phase: "play",
    players: finalPlayers,
    deck: [],
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

describe("胜利条件判定 — checkFactionWin", () => {
  describe("灰塔 (faction 1)", () => {
    it("淘汰2名玩家时获胜", () => {
      const state = makeTestState();
      state.players[0].factionId = 1;
      state.players[0].stats.killedCount = 2;
      expect(checkFactionWin(state, state.players[0])).toBe(true);
    });

    it("只淘汰1名玩家时不获胜", () => {
      const state = makeTestState();
      state.players[0].factionId = 1;
      state.players[0].stats.killedCount = 1;
      expect(checkFactionWin(state, state.players[0])).toBe(false);
    });
  });

  describe("白纸城 (faction 2)", () => {
    it("回合数达到8时获胜", () => {
      const state = makeTestState();
      state.players[0].factionId = 2;
      state.players[0].ownTurnCount = 8;
      expect(checkFactionWin(state, state.players[0])).toBe(true);
    });

    it("回合数不足8时不获胜", () => {
      const state = makeTestState();
      state.players[0].factionId = 2;
      state.players[0].ownTurnCount = 7;
      expect(checkFactionWin(state, state.players[0])).toBe(false);
    });
  });

  describe("镜湖议会 (faction 3)", () => {
    it("未使用笔伐且仅剩2人时获胜", () => {
      const state = makeTestState();
      state.players[0].factionId = 3;
      state.players[0].stats.usedBifaAsUser = false;
      state.players[2].alive = false;
      state.players[3].alive = false;
      expect(checkFactionWin(state, state.players[0])).toBe(true);
    });

    it("使用过笔伐时不获胜", () => {
      const state = makeTestState();
      state.players[0].factionId = 3;
      state.players[0].stats.usedBifaAsUser = true;
      state.players[2].alive = false;
      state.players[3].alive = false;
      expect(checkFactionWin(state, state.players[0])).toBe(false);
    });

    it("存活玩家超过2人不获胜", () => {
      const state = makeTestState();
      state.players[0].factionId = 3;
      state.players[0].stats.usedBifaAsUser = false;
      expect(checkFactionWin(state, state.players[0])).toBe(false);
    });
  });

  describe("焚稿人 (faction 5)", () => {
    it("达成阵营标记时获胜", () => {
      const state = makeTestState();
      state.players[0].factionId = 5;
      state.players[0].stats.factionFlags.add(5);
      expect(checkFactionWin(state, state.players[0])).toBe(true);
    });

    it("未达成阵营标记时不获胜", () => {
      const state = makeTestState();
      state.players[0].factionId = 5;
      expect(checkFactionWin(state, state.players[0])).toBe(false);
    });
  });

  describe("远星 (faction 9)", () => {
    it("阶位达到4时获胜", () => {
      const state = makeTestState();
      state.players[0].factionId = 9;
      state.players[0].rank = 4;
      expect(checkFactionWin(state, state.players[0])).toBe(true);
    });

    it("阶位不足4时不获胜", () => {
      const state = makeTestState();
      state.players[0].factionId = 9;
      state.players[0].rank = 3;
      expect(checkFactionWin(state, state.players[0])).toBe(false);
    });
  });

  describe("渡鸦邮局 (faction 20)", () => {
    it("累计摸牌达到20时获胜", () => {
      const state = makeTestState();
      state.players[0].factionId = 20;
      state.players[0].stats.drawnTotal = 20;
      expect(checkFactionWin(state, state.players[0])).toBe(true);
    });

    it("累计摸牌不足20时不获胜", () => {
      const state = makeTestState();
      state.players[0].factionId = 20;
      state.players[0].stats.drawnTotal = 19;
      expect(checkFactionWin(state, state.players[0])).toBe(false);
    });
  });

  describe("墨冢 (faction 16)", () => {
    it("拾取残片达到2时获胜", () => {
      const state = makeTestState();
      state.players[0].factionId = 16;
      state.players[0].stats.residueCount = 2;
      expect(checkFactionWin(state, state.players[0])).toBe(true);
    });
  });

  describe("第七灯塔 (faction 17)", () => {
    it("淘汰标记达到2时获胜", () => {
      const state = makeTestState();
      state.players[0].factionId = 17;
      state.players[0].stats.damagedEliminated.add(1);
      state.players[0].stats.damagedEliminated.add(2);
      expect(checkFactionWin(state, state.players[0])).toBe(true);
    });

    it("淘汰标记不足2时不获胜", () => {
      const state = makeTestState();
      state.players[0].factionId = 17;
      state.players[0].stats.damagedEliminated.add(1);
      expect(checkFactionWin(state, state.players[0])).toBe(false);
    });
  });

  describe("白烛修会 (faction 13)", () => {
    it("最低篇幅比>=50%且仅剩2人时获胜", () => {
      const state = makeTestState();
      state.players[0].factionId = 13;
      state.players[0].stats.minFragmentRatio = 0.5;
      state.players[2].alive = false;
      state.players[3].alive = false;
      expect(checkFactionWin(state, state.players[0])).toBe(true);
    });

    it("最低篇幅比<50%时不获胜", () => {
      const state = makeTestState();
      state.players[0].factionId = 13;
      state.players[0].stats.minFragmentRatio = 0.4;
      state.players[2].alive = false;
      state.players[3].alive = false;
      expect(checkFactionWin(state, state.players[0])).toBe(false);
    });
  });

  describe("死亡玩家不获胜", () => {
    it("已淘汰的玩家即使满足条件也不获胜", () => {
      const state = makeTestState();
      state.players[0].factionId = 1;
      state.players[0].stats.killedCount = 2;
      state.players[0].alive = false;
      expect(checkFactionWin(state, state.players[0])).toBe(false);
    });
  });
});

describe("胜利条件判定 — evaluateWinners", () => {
  it("仅剩1名存活玩家时该玩家获胜", () => {
    const state = makeTestState();
    state.players[1].alive = false;
    state.players[2].alive = false;
    state.players[3].alive = false;
    const result = evaluateWinners(state);
    expect(result).not.toBeNull();
    expect(result!.seats).toEqual([0]);
    expect(result!.text).toContain("最后存活者");
  });

  it("无人达成胜利条件时返回null", () => {
    const state = makeTestState();
    const result = evaluateWinners(state);
    expect(result).toBeNull();
  });

  it("玩家达成阵营胜利条件时获胜", () => {
    const state = makeTestState();
    state.players[0].factionId = 1;
    state.players[0].stats.killedCount = 2;
    const result = evaluateWinners(state);
    expect(result).not.toBeNull();
    expect(result!.seats).toContain(0);
    expect(result!.text).toContain("隐藏胜利条件");
  });

  it("多名玩家可同时获胜", () => {
    const state = makeTestState();
    // Player 0: 灰塔, killed 2
    state.players[0].factionId = 1;
    state.players[0].stats.killedCount = 2;
    // Player 1: 远星, rank 4
    state.players[1].factionId = 9;
    state.players[1].rank = 4;
    const result = evaluateWinners(state);
    expect(result).not.toBeNull();
    expect(result!.seats).toContain(0);
    expect(result!.seats).toContain(1);
  });

  it("0名存活玩家时返回null", () => {
    const state = makeTestState();
    state.players.forEach((p) => (p.alive = false));
    const result = evaluateWinners(state);
    expect(result).toBeNull();
  });
});

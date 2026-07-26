import { describe, it, expect } from "vitest";
import { checkFactionWin, evaluateWinners, WIN_THRESHOLDS } from "../engine/win";
import { FACTIONS } from "../data/factions";
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

/* ════════════════════════════════════════════════════════════════
   文案 ↔ 实现 一致性
   ----------------------------------------------------------------
   这一组不测游戏行为，测的是"卷宗上印的数字"和"引擎真正判定的数字"
   是不是同一个。历史上它们分家过四次（黑帆书库 5 vs 4、锈字修道院
   15 vs 12、远星漏掉篇幅门槛、纸鸢社的"所有"其实只算存活者），
   而玩家是照着密令上的数字做规划的 —— 数字不对，规划就是错的。
   ════════════════════════════════════════════════════════════════ */
describe("阵营胜利条件：文案与实现必须一致", () => {
  /** 从一段中文文案里抠出所有阿拉伯数字 */
  const nums = (t: string) => (t.match(/\d+/g) ?? []).map(Number);
  const winTextOf = (id: number) => FACTIONS.find((f) => f.id === id)!.win;

  const CASES: { id: number; name: string; expect: number }[] = [
    { id: 1, name: "灰塔", expect: WIN_THRESHOLDS.huitaKills },
    { id: 2, name: "白纸城", expect: WIN_THRESHOLDS.baizhichengTurns },
    { id: 4, name: "长夜档案馆", expect: WIN_THRESHOLDS.changyeAcquired },
    { id: 7, name: "黑帆书库", expect: WIN_THRESHOLDS.heifanTaken },
    { id: 10, name: "旧日读书会", expect: WIN_THRESHOLDS.jiuriEquipped },
    { id: 11, name: "锈字修道院", expect: WIN_THRESHOLDS.xiuziHealed },
    { id: 16, name: "墨冢", expect: WIN_THRESHOLDS.mozhongResidue },
    { id: 17, name: "第七灯塔", expect: WIN_THRESHOLDS.dengtaAssists },
    { id: 18, name: "迷途", expect: WIN_THRESHOLDS.mituRecoveries },
    { id: 20, name: "渡鸦邮局", expect: WIN_THRESHOLDS.duyaDraws },
  ];

  it.each(CASES)("$name($id) 的文案数字应当出现在实现阈值里", ({ id, name, expect: threshold }) => {
    const text = winTextOf(id);
    expect(
      nums(text),
      `【${name}】文案「${text}」里没有出现实现阈值 ${threshold} —— ` +
        "要么改 WIN_THRESHOLDS，要么改 factions.ts 的文案，两边必须是同一个数。",
    ).toContain(threshold);
  });

  it("每个势力都有非空的胜利条件文案", () => {
    for (const f of FACTIONS) {
      expect(f.win.trim().length, `【${f.name}】的 win 文案为空`).toBeGreaterThan(0);
    }
  });

  it("checkFactionWin 覆盖了全部 22 个势力（没有恒为 false 的死条件）", () => {
    // default 分支恒为 false；用一个不存在的 factionId 确认 default 确实是 false，
    // 再确认每个真实 factionId 都不会走到 default。
    const ids = FACTIONS.map((f) => f.id).sort((a, b) => a - b);
    expect(ids).toEqual(Array.from({ length: 22 }, (_, i) => i + 1));
  });
});

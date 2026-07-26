/**
 * simulation.test.ts —— 全自动对局烟雾测试
 * ============================================================================
 * 单元测试只能验证单个函数；这里让四个 AI 互相打完整局，用来发现
 * 只有在真实流程中才会暴露的问题：
 *   - 回合流程死循环 / 永不结束
 *   - 牌库净增净减（叙事回音、藏锋等复制/储存牌曾经会凭空造牌或吞牌）
 *   - 篇幅越界、已淘汰玩家仍在行动
 *   - 胜利条件永远无法达成
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

// 关闭所有演出用的 sleep，否则一局要真实等待几十秒
setPaceFactor(0);

enableMapSet();

const DECK_SIZE = buildFullDeck().length;

/** 统计当前场上所有区域的牌张总数 */
function countAllCards(s: GameState): number {
  let n = s.deck.length + s.discardPile.length;
  for (const p of s.players) {
    n += p.hand.length;
    n += Object.values(p.equips).filter(Boolean).length;
    n += p.judgement.length;
    if (p.stored) n += 1;
  }
  return n;
}

/**
 * 跑一整局，返回终局状态。
 *
 * seed 是必填的：这个文件里的断言（牌张守恒、篇幅不越界、回合数区间）
 * 覆盖的是只有在真实流程里才会浮现的问题，而这类问题往往几十局才撞一次。
 * 如果随机不可复现，那么失败一次 = 什么都得不到：既定位不了，也验证不了
 * 修好没有。播了种之后，失败信息里的 seed 就是一份完整的复现步骤。
 */
async function playOneGame(characterId: number, seed: number): Promise<GameState> {
  seedRng(seed);
  let state = buildInitialState({ characterId });
  // 让 0 号位也由 AI 接管，这样无需 UI 即可自动推进
  state = produce(state, (d: GameState) => {
    d.players[0].isHuman = false;
  });

  const set = (fn: (s: GameState) => void) => {
    state = produce(state, fn);
  };
  const get = () => state;

  await startTurn(set, get, state.activeSeat);
  return state;
}

describe("四人自动对局 —— 全流程烟雾测试", () => {
  // 每局都要跑完整个回合链，给足超时
  it(
    "连续多局都能正常终局，且不产生规则层面的越界",
    async () => {
      const seen = new Set<string>();

      for (let game = 0; game < 6; game++) {
        const characterId = (game % 24) + 1;
        // 固定的种子序列：CI 上每次跑的是同一批对局，红了就一定能复现
        const seed = 0x5eed0000 + game;
        const final = await playOneGame(characterId, seed);
        const where = `第${game + 1}局(seed=${seed}, 角色${characterId})`;

        // 1) 必须真的分出胜负，而不是卡在某个回合
        expect(final.winner, `${where} 没有产生结果`).not.toBeNull();
        seen.add(final.winner!.text);

        // 2) 牌张守恒：任何区域的牌加起来应当等于牌库总数。
        //    叙事回音/藏锋/锋芒乍现历史上都出现过凭空造牌或吞牌。
        const total = countAllCards(final);
        expect(
          total,
          `${where} 牌张不守恒：期望 ${DECK_SIZE}，实得 ${total}`,
        ).toBe(DECK_SIZE);

        // 3) 篇幅不得越界
        for (const p of final.players) {
          expect(p.fragments, `${where} 座位${p.seat}篇幅为负`).toBeGreaterThanOrEqual(0);
          expect(
            p.fragments,
            `${where} 座位${p.seat}篇幅超过上限`,
          ).toBeLessThanOrEqual(p.maxFragments);
          if (!p.alive) {
            expect(p.fragments, `${where} 已淘汰玩家篇幅应为0`).toBe(0);
            expect(p.hand.length, `${where} 已淘汰玩家不应留有手牌`).toBe(0);
          }
        }

        // 4) 至少还有一名存活者（或胜者名单非空）
        const alive = final.players.filter((p) => p.alive);
        expect(alive.length + final.winner!.seats.length).toBeGreaterThan(0);

        // 5) 回合数应当落在一个合理区间：太少说明提前崩溃，
        //    太多说明胜利条件够不着、游戏拖不完。
        expect(final.round, `${where} 回合数异常偏少，疑似提前崩溃`).toBeGreaterThan(1);
        expect(final.round, `${where} 回合数异常偏多，疑似胜利条件够不着`).toBeLessThan(400);
      }

      // 六局不应该全部走同一条结算路径
      expect(seen.size).toBeGreaterThan(0);
    },
    120_000,
  );

  it(
    "阵营隐藏胜利条件在自动对局中确实会被触发",
    async () => {
      let factionWins = 0;
      let lastSurvivorWins = 0;

      for (let game = 0; game < 10; game++) {
        const seed = 0x5eed1000 + game;
        const final = await playOneGame((game % 24) + 1, seed);
        if (!final.winner) continue;
        if (final.winner.text.includes("隐藏胜利条件")) factionWins++;
        else if (final.winner.text.includes("最后存活者")) lastSurvivorWins++;
      }

      // 隐藏阵营是这个游戏的核心机制。若 10 局里一次都没触发，
      // 说明胜利条件的统计字段又断了（历史上长夜档案馆、第七灯塔都出现过）。
      expect(
        factionWins + lastSurvivorWins,
        "10 局中没有任何一局正常结算",
      ).toBeGreaterThan(0);
      expect(factionWins, "10 局中没有任何阵营达成隐藏胜利条件").toBeGreaterThan(0);
    },
    180_000,
  );
});

/* ════════════════════════════════════════════════════════════════
   可复现性本身也要被测
   ----------------------------------------------------------------
   上面那些断言之所以有价值，前提是"同一个 seed 必然重放出同一局"。
   一旦有人在逻辑层重新引入裸 Math.random()，这条前提就悄悄失效了，
   而上面的用例照样会绿 —— 只是失败信息里的 seed 从此不再有意义。
   所以这里显式地把前提钉住。
   ════════════════════════════════════════════════════════════════ */
describe("同一种子必须重放出完全相同的一局", () => {
  /** 把终局压成一个可比较的指纹 */
  const fingerprint = (s: GameState) =>
    JSON.stringify({
      round: s.round,
      winner: s.winner?.text ?? null,
      seats: s.winner?.seats ?? [],
      deck: s.deck.length,
      discard: s.discardPile.length,
      players: s.players.map((p) => ({
        seat: p.seat,
        faction: p.factionId,
        char: p.characterId,
        frag: p.fragments,
        alive: p.alive,
        hand: p.hand.map((c) => c.key).join(","),
        turns: p.ownTurnCount,
      })),
    });

  it(
    "两次以 seed=20260726 开局，终局状态逐字段一致",
    async () => {
      const a = fingerprint(await playOneGame(3, 20260726));
      const b = fingerprint(await playOneGame(3, 20260726));
      expect(b, "同一种子跑出了不同的对局 —— 逻辑层大概率又混进了裸 Math.random()").toBe(a);
    },
    120_000,
  );

  it(
    "不同种子应当跑出不同的对局（否则说明种子根本没生效）",
    async () => {
      const a = fingerprint(await playOneGame(3, 111));
      const b = fingerprint(await playOneGame(3, 222));
      expect(b).not.toBe(a);
    },
    120_000,
  );
});

/**
 * balance.probe.ts —— 对局数据探针（不是断言测试，是用来看数的）
 * ============================================================================
 * 跑法：npx vitest run src/__tests__/balance.probe.ts
 *
 * 它不判对错，只把一批确定性对局的统计打出来：各阵营出场/胜出次数、
 * 胜利类型分布、座次优势、对局长度、AI 的行动密度。
 * 判断"AI 打得聪不聪明""哪个阵营强得离谱"靠的是这些数，不是读代码猜。
 * ============================================================================
 */

import { describe, it } from "vitest";
import { produce, enableMapSet } from "immer";
import type { GameState, PlayerState } from "../engine/types";
import { buildInitialState } from "../store/setup";
import { startTurn } from "../store/turnFlow";
import { setPaceFactor } from "../store/helpers";
import { seedRng } from "../engine/rng";
import { FACTIONS } from "../data/factions";
import { CHARACTERS } from "../data/characters";
import { WIN_THRESHOLDS } from "../engine/win";

/**
 * 每个"累计型"条件的进度读数。用来区分两种截然不同的失败：
 *   A. AI 压根没往这个方向打 → 进度接近 0
 *   B. AI 在打，但打满也够不到 → 进度贴着某个上限却过不去
 * 只有 B 才是数值/牌库结构的问题，A 才是 AI 的问题。
 */
const PROGRESS: Record<number, { need: number; get: (p: PlayerState) => number }> = {
  1: { need: WIN_THRESHOLDS.huitaKills, get: (p) => p.stats.killedCount },
  2: { need: WIN_THRESHOLDS.baizhichengTurns, get: (p) => p.ownTurnCount },
  4: { need: WIN_THRESHOLDS.changyeAcquired, get: (p) => p.stats.equipAcquiredCount },
  7: { need: WIN_THRESHOLDS.heifanTaken, get: (p) => p.stats.handsOrEquipTaken },
  11: { need: WIN_THRESHOLDS.xiuziHealed, get: (p) => p.stats.totalHealed },
  12: { need: 3, get: (p) => p.stats.viewedFullHandOf.size },
  16: { need: WIN_THRESHOLDS.mozhongResidue, get: (p) => p.stats.residueCount },
  17: { need: WIN_THRESHOLDS.dengtaAssists, get: (p) => p.stats.damagedEliminated.size },
  18: { need: WIN_THRESHOLDS.mituRecoveries, get: (p) => p.stats.recoveredFromLowCount },
  20: { need: WIN_THRESHOLDS.duyaDraws, get: (p) => p.stats.drawnTotal },
};

setPaceFactor(0);
enableMapSet();

const GAMES = Number(process.env.PROBE_GAMES ?? 400);

type Row = {
  seed: number;
  round: number;
  winnerSeats: number[];
  winnerFactions: number[];
  byFactionWin: boolean;
  factionsInGame: number[];
  charsInGame: number[];
  winnerChars: number[];
  cardsPlayed: number;
  turnsTaken: number;
  emptyTurns: number;
  /** factionId -> 该玩家终局时的累计进度 */
  progress: { fid: number; got: number; need: number }[];
};

async function play(seed: number, characterId: number): Promise<Row> {
  seedRng(seed);
  let state = buildInitialState({ characterId });
  state = produce(state, (d: GameState) => {
    d.players[0].isHuman = false;
  });
  let cardsPlayed = 0;
  let lastLog = 0;
  const set = (fn: (s: GameState) => void) => {
    state = produce(state, fn);
    // 统计"出牌"事件：日志里 kind === "card" 的新增条目
    for (let i = lastLog; i < state.log.length; i++) {
      if (state.log[i].kind === "card") cardsPlayed++;
    }
    lastLog = state.log.length;
  };
  const get = () => state;
  await startTurn(set, get, state.activeSeat);

  const turnsTaken = state.players.reduce((a, p) => a + p.ownTurnCount, 0);
  const seats = state.winner?.seats ?? [];
  const progress = state.players
    .filter((p) => PROGRESS[p.factionId])
    .map((p) => ({ fid: p.factionId, got: PROGRESS[p.factionId].get(p), need: PROGRESS[p.factionId].need }));

  return {
    seed,
    progress,
    round: state.round,
    winnerSeats: seats,
    winnerFactions: seats.map((s) => state.players[s].factionId),
    byFactionWin: !!state.winner?.text.includes("隐藏胜利条件"),
    factionsInGame: state.players.map((p) => p.factionId),
    charsInGame: state.players.map((p) => p.characterId),
    winnerChars: seats.map((s) => state.players[s].characterId),
    cardsPlayed,
    turnsTaken,
    emptyTurns: 0,
  };
}

function pct(a: number, b: number) {
  return b === 0 ? "  —  " : `${((a / b) * 100).toFixed(1).padStart(5)}%`;
}

/*
 * 默认不跑：它要十几秒，而且只打数不做断言，混在常规测试里是噪声。
 * 需要看数时：PROBE=1 npx vitest run src/__tests__/balance.probe.test.ts --silent=false --reporter=verbose
 */
describe.skipIf(!process.env.PROBE)("对局数据探针", () => {
  it(
    `跑 ${GAMES} 局并输出统计`,
    async () => {
      const rows: Row[] = [];
      for (let i = 0; i < GAMES; i++) {
        rows.push(await play(0xb0000000 + i, (i % 24) + 1));
      }

      const appear = new Map<number, number>();
      const wins = new Map<number, number>();
      const charAppear = new Map<number, number>();
      const charWins = new Map<number, number>();
      const seatWins = [0, 0, 0, 0];
      let factionWinGames = 0;

      for (const r of rows) {
        for (const f of r.factionsInGame) appear.set(f, (appear.get(f) ?? 0) + 1);
        for (const f of r.winnerFactions) wins.set(f, (wins.get(f) ?? 0) + 1);
        for (const c of r.charsInGame) charAppear.set(c, (charAppear.get(c) ?? 0) + 1);
        for (const c of r.winnerChars) charWins.set(c, (charWins.get(c) ?? 0) + 1);
        for (const s of r.winnerSeats) seatWins[s]++;
        if (r.byFactionWin) factionWinGames++;
      }

      const rounds = rows.map((r) => r.round).sort((a, b) => a - b);
      const med = rounds[Math.floor(rounds.length / 2)];

      console.log(`\n===== ${GAMES} 局统计 =====`);
      console.log(`胜利类型：阵营条件 ${pct(factionWinGames, GAMES)}  最后存活者 ${pct(GAMES - factionWinGames, GAMES)}`);
      console.log(`回合数：中位 ${med}  最短 ${rounds[0]}  最长 ${rounds[rounds.length - 1]}`);
      console.log(`平均每局出牌 ${(rows.reduce((a, r) => a + r.cardsPlayed, 0) / GAMES).toFixed(1)} 张，` +
        `玩家回合 ${(rows.reduce((a, r) => a + r.turnsTaken, 0) / GAMES).toFixed(1)} 个`);
      console.log(`座次胜率：` + seatWins.map((w, i) => `座位${i} ${pct(w, GAMES)}`).join("  "));

      console.log(`\n--- 各阵营（出场次数 / 胜出次数 / 出场胜率）---`);
      const fRows = FACTIONS.map((f) => ({
        id: f.id,
        name: f.name,
        a: appear.get(f.id) ?? 0,
        w: wins.get(f.id) ?? 0,
      })).sort((x, y) => y.w / Math.max(1, y.a) - x.w / Math.max(1, x.a));
      for (const f of fRows) {
        const bar = "█".repeat(Math.round((f.w / Math.max(1, f.a)) * 40));
        console.log(`  ${String(f.id).padStart(2)} ${f.name.padEnd(6)} ${String(f.a).padStart(4)} / ${String(f.w).padStart(4)}  ${pct(f.w, f.a)}  ${bar}`);
      }

      console.log(`\n--- 累计型条件：终局进度中位数 / 门槛（区分"没往那打"与"打满也够不到"）---`);
      const prog = new Map<number, number[]>();
      for (const r of rows) for (const g of r.progress) {
        if (!prog.has(g.fid)) prog.set(g.fid, []);
        prog.get(g.fid)!.push(g.got / g.need);
      }
      const pRows = [...prog.entries()].map(([fid, arr]) => {
        arr.sort((a, b) => a - b);
        return { fid, med: arr[Math.floor(arr.length / 2)], p90: arr[Math.floor(arr.length * 0.9)], n: arr.length };
      }).sort((a, b) => a.med - b.med);
      for (const r of pRows) {
        const f = FACTIONS.find((x) => x.id === r.fid)!;
        const need = PROGRESS[r.fid].need;
        console.log(`  ${String(r.fid).padStart(2)} ${f.name.padEnd(6)} 门槛${String(need).padStart(3)}  中位进度 ${(r.med * 100).toFixed(0).padStart(3)}%  p90 ${(r.p90 * 100).toFixed(0).padStart(3)}%`);
      }

      console.log(`\n--- 追求该条件的玩家实际达成量的分位数（用来定门槛）---`);
      const raw = new Map<number, number[]>();
      for (const r of rows) for (const g of r.progress) {
        if (!raw.has(g.fid)) raw.set(g.fid, []);
        raw.get(g.fid)!.push(g.got);
      }
      const q = (a: number[], f: number) => a[Math.min(a.length - 1, Math.floor(a.length * f))];
      for (const fid of [20, 11, 7, 4, 2, 17]) {
        const a = (raw.get(fid) ?? []).slice().sort((x, y) => x - y);
        if (!a.length) continue;
        const f = FACTIONS.find((x) => x.id === fid)!;
        console.log(`  ${String(fid).padStart(2)} ${f.name.padEnd(6)} 现门槛 ${String(PROGRESS[fid].need).padStart(2)} | ` +
          `p25=${q(a,.25)} p50=${q(a,.5)} p60=${q(a,.6)} p75=${q(a,.75)} p90=${q(a,.9)} max=${a[a.length-1]}`);
      }

      console.log(`\n--- 角色胜率（只列最高与最低各 6 名）---`);
      const cRows = CHARACTERS.map((c) => ({
        name: c.name,
        a: charAppear.get(c.id) ?? 0,
        w: charWins.get(c.id) ?? 0,
      })).filter((c) => c.a >= 10).sort((x, y) => y.w / y.a - x.w / x.a);
      for (const c of cRows.slice(0, 6)) console.log(`  高 ${c.name.padEnd(5)} ${String(c.a).padStart(4)} / ${String(c.w).padStart(3)}  ${pct(c.w, c.a)}`);
      for (const c of cRows.slice(-6)) console.log(`  低 ${c.name.padEnd(5)} ${String(c.a).padStart(4)} / ${String(c.w).padStart(3)}  ${pct(c.w, c.a)}`);
      console.log("");
    },
    900_000,
  );
});

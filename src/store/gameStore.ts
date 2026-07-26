import { create } from "zustand";
import { produce, enableMapSet } from "immer";
import type { GameState } from "../engine/types";
import { log, pName } from "./helpers";
import { buildInitialState } from "./setup";
import { endDiscard, passTurnAfterDeath, startTurn } from "./turnFlow";
import { playCardInternal } from "./cardEffects";
import { useSkillInternal } from "./skills";
import {
  cardNoticeResolver,
  choiceResolver,
  defenseResolver,
  potiResolver,
  quellStrifeResolver,
  setCardNoticeResolver,
  setChoiceResolver,
  setDefenseResolver,
  setPotiResolver,
  setQuellStrifeResolver,
  setTargetResolver,
  targetResolver,
} from "./resolvers";

enableMapSet();

// ---------------- Operation Lock ----------------
// Prevents duplicate card plays / skill uses while async animations are running
let _operationLock = false;
let _initGameToken = 0;

export function isOperationLocked() { return _operationLock; }
export function setOperationLock(v: boolean) { _operationLock = v; }

// ---------------- Store ----------------
interface Actions {
  initGame: (characterId: number) => void;
  playHandCard: (uid: string) => Promise<void>;
  useSkill: (key: string) => Promise<void>;
  endPlayPhase: () => Promise<void>;
  confirmDiscard: (uids: string[]) => void;
  resolveDefense: (dodge: boolean) => void;
  resolveChoice: (yes: boolean) => void;
  resolveCardNotice: () => void;
  resolveTargetSeats: (seats: number[] | null) => void;
  resetGame: () => void;
  surrender: () => void;
  playPotiReactive: () => void;
}

type Store = GameState & { actions: Actions };

// ---------------- Helper: clear all resolvers ----------------
function clearAllResolvers() {
  setTargetResolver(null);
  setDefenseResolver(null);
  setChoiceResolver(null);
  setPotiResolver(null);
  setQuellStrifeResolver(null);
  setCardNoticeResolver(null);
  if ((window as any).__discardResolve) {
    (window as any).__discardResolve();
    (window as any).__discardResolve = null;
  }
  _operationLock = false;
}

/**
 * 玩家在自己的出牌阶段把自己弄死了（祸水东引反伤、论辨落败、技能耗尽篇幅……）。
 *
 * 此时 GameBoard 的 isMyTurn 因为 `me.alive === false` 变为 false，
 * "结束回合"按钮随之禁用，而回合仍停在座位 0 —— 整局就此卡死，
 * 玩家只能投降或退出。这里检测到这种情况就自动把回合交给下一家。
 */
async function handOverIfSelfEliminated(
  setDraft: (fn: (s: GameState) => void) => void,
  get: () => GameState,
) {
  const gs = get();
  if (gs.winner) return;
  if (gs.activeSeat !== 0) return;
  if (gs.players[0]?.alive) return;
  if (_operationLock) return;
  _operationLock = true;
  try {
    await passTurnAfterDeath(setDraft, get, 0);
  } finally {
    _operationLock = false;
  }
}

// ---------------- Store Creation ----------------
export const useGameStore = create<Store>((set, get) => ({
  ...buildInitialState({ characterId: 1 }),
  actions: {
    initGame: (characterId: number) => {
      // Clear any stale resolvers from previous game
      clearAllResolvers();
      _initGameToken++;
      const myToken = _initGameToken;

      set(produce((s: GameState) => {
        const fresh = buildInitialState({ characterId });
        Object.assign(s, fresh);
      }));
      // Auto-start the first turn (with race-condition guard)
      setTimeout(() => {
        // Guard: if token changed, another initGame was called
        if (myToken !== _initGameToken) return;
        const gs = get();
        if (gs.winner || !gs.started) return;
        startTurn(
          (fn) => set(produce((s: GameState) => fn(s))),
          () => get(),
          gs.activeSeat
        );
      }, 800);
    },
    playHandCard: async (uid: string) => {
      // Operation lock: prevent duplicate plays while animation is running
      if (_operationLock) return;
      const gs = get();
      if (gs.winner || gs.phase !== "play" || gs.activeSeat !== 0) return;
      // Check card exists in hand
      if (!gs.players[0]?.hand.some((c) => c.uid === uid)) return;
      _operationLock = true;
      try {
        await playCardInternal(
          (fn) => set(produce((s: GameState) => fn(s))),
          () => get(),
          gs.activeSeat,
          uid
        );
      } finally {
        _operationLock = false;
      }
      await handOverIfSelfEliminated((fn) => set(produce((s: GameState) => fn(s))), () => get());
    },
    useSkill: async (key: string) => {
      if (_operationLock) return;
      const gs = get();
      if (gs.winner || gs.phase !== "play" || gs.activeSeat !== 0) return;
      _operationLock = true;
      try {
        await useSkillInternal(
          (fn) => set(produce((s: GameState) => fn(s))),
          () => get(),
          gs.activeSeat,
          key
        );
      } finally {
        _operationLock = false;
      }
      await handOverIfSelfEliminated((fn) => set(produce((s: GameState) => fn(s))), () => get());
    },
    endPlayPhase: async () => {
      if (_operationLock) return;
      const gs = get();
      if (gs.winner || gs.activeSeat !== 0 || gs.phase !== "play") return;
      _operationLock = true;
      try {
        await endDiscard(
          (fn) => set(produce((s: GameState) => fn(s))),
          () => get(),
          gs.activeSeat
        );
      } finally {
        _operationLock = false;
      }
    },
    confirmDiscard: (uids: string[]) => {
      const gs = get();
      if (!gs.pendingDiscard) return;
      const expectedCount = gs.pendingDiscard.count;
      const p = gs.players[gs.activeSeat];

      // 去重后只保留确实还在手牌里的 uid
      const validUids = [...new Set(uids)].filter((uid) => p.hand.some((c) => c.uid === uid));

      // 数量不足时不能放行。
      // 旧实现会照常关闭弹窗、resolve 掉 Promise，于是回合继续推进，
      // 手牌却仍然超过篇幅上限 —— 这就是"弃两张有时没成功"的表现。
      // 这里改为拒绝确认，并按实际仍需弃置的张数重开弹窗。
      if (validUids.length < expectedCount) {
        set(produce((s: GameState) => {
          const pl = s.players[s.activeSeat];
          const stillOver = Math.max(0, pl.hand.length - pl.fragments);
          if (stillOver === 0) {
            s.pendingDiscard = null;
          } else {
            s.pendingDiscard = { count: stillOver };
            log(s, `弃牌数量不足，仍需弃置${stillOver}张。`, "system");
          }
        }));
        // 手牌恰好已不超限时才放行
        if (!get().pendingDiscard && (window as any).__discardResolve) {
          (window as any).__discardResolve();
          (window as any).__discardResolve = null;
        }
        return;
      }

      const uidsToDiscard = validUids.slice(0, expectedCount);
      let actualDiscarded = 0;
      set(produce((s: GameState) => {
        const pl = s.players[s.activeSeat];
        for (const uid of uidsToDiscard) {
          const idx = pl.hand.findIndex((c) => c.uid === uid);
          if (idx >= 0) {
            const [c] = pl.hand.splice(idx, 1);
            s.discardPile.push(c);
            actualDiscarded++;
          }
        }
        log(s, `${pName(pl)} 弃置了${actualDiscarded}张牌。`, "system");

        // 弃完仍然超限（例如期间又被塞了牌）就继续要求弃牌，而不是放行
        const stillOver = Math.max(0, pl.hand.length - pl.fragments);
        s.pendingDiscard = stillOver > 0 ? { count: stillOver } : null;
      }));

      if (!get().pendingDiscard && (window as any).__discardResolve) {
        (window as any).__discardResolve();
        (window as any).__discardResolve = null;
      }
    },
    resolveDefense: (dodge: boolean) => {
      if (defenseResolver) {
        const r = defenseResolver;
        setDefenseResolver(null);
        set(produce((s: GameState) => { s.pendingDefense = null; }));
        r(dodge);
      }
    },
    resolveChoice: (yes: boolean) => {
      if (potiResolver) {
        const r = potiResolver;
        setPotiResolver(null);
        set(produce((s: GameState) => { s.pendingChoice = null; }));
        r(yes);
        return;
      }
      if (quellStrifeResolver) {
        const r = quellStrifeResolver;
        setQuellStrifeResolver(null);
        set(produce((s: GameState) => { s.pendingChoice = null; }));
        r(yes);
        return;
      }
      if (choiceResolver) {
        const r = choiceResolver;
        setChoiceResolver(null);
        set(produce((s: GameState) => { s.pendingChoice = null; }));
        r(yes);
      }
    },
    resolveCardNotice: () => {
      if (cardNoticeResolver) {
        const r = cardNoticeResolver;
        setCardNoticeResolver(null);
        set(produce((s: GameState) => { s.pendingCardNotice = null; }));
        r();
      }
    },
    resolveTargetSeats: (seats: number[] | null) => {
      if (targetResolver) {
        const r = targetResolver;
        setTargetResolver(null);
        set(produce((s: GameState) => { s.pendingTarget = null; }));
        r(seats);
      }
    },
    resetGame: () => {
      // Clear all resolvers and operation lock to prevent stale state
      clearAllResolvers();
      _initGameToken++; // invalidate any pending initGame timeout
      set(produce((s: GameState) => {
        s.started = false;
        s.winner = null;
        s.lastPlayedStrategyKey = null;
        s.lastPlayedStrategyCaster = null;
        // Clear all pending UI states
        s.pendingTarget = null;
        s.pendingDefense = null;
        s.pendingChoice = null;
        s.pendingCardNotice = null;
        s.pendingDiscard = null;
        s.duelState = null;
        s.narrationBanner = null;
        s.cardPlayEffect = null;
      }));
    },
    surrender: () => {
      clearAllResolvers();
      set(produce((s: GameState) => {
        s.winner = { seats: [], text: "你投降了。", surrendered: true };
      }));
    },
    playPotiReactive: () => {
      if (potiResolver) {
        const r = potiResolver;
        setPotiResolver(null);
        set(produce((s: GameState) => { s.pendingChoice = null; }));
        r(true);
      }
    },
  },
}));

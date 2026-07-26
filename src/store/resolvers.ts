import type { GameState } from "../engine/types";
import { log, pName, pushNotice, skillUnlocked } from "./helpers";
import { equipAt } from "../engine/utils";
import { pickBestTarget, readDifficulty, shouldCounter, shouldDefend } from "./ai";
import type { SetFn, GetFn } from "./helpers";
import { applyDamageSync } from "./damage";
import { rand } from "../engine/rng";

// ---------------- Module-level resolver variables ----------------
// These are live bindings: gameStore.ts imports them to resolve pending UI prompts.
export let targetResolver: ((seats: number[] | null) => void) | null = null;
export let defenseResolver: ((dodge: boolean) => void) | null = null;
export let choiceResolver: ((yes: boolean) => void) | null = null;
export let potiResolver: ((used: boolean) => void) | null = null;
// quell_strife passive
export let quellStrifeResolver: ((used: boolean) => void) | null = null;
export let cardNoticeResolver: (() => void) | null = null;

/** Internal setter helpers (used by gameStore actions to clear/assign resolvers) */
export function setTargetResolver(fn: ((seats: number[] | null) => void) | null) { targetResolver = fn; }
export function setDefenseResolver(fn: ((dodge: boolean) => void) | null) { defenseResolver = fn; }
export function setChoiceResolver(fn: ((yes: boolean) => void) | null) { choiceResolver = fn; }
export function setPotiResolver(fn: ((used: boolean) => void) | null) { potiResolver = fn; }
export function setQuellStrifeResolver(fn: ((used: boolean) => void) | null) { quellStrifeResolver = fn; }
export function setCardNoticeResolver(fn: (() => void) | null) { cardNoticeResolver = fn; }

export function requestTargetSeats(
  set: SetFn,
  get: GetFn,
  title: string,
  sourceLabel: string,
  candidates: number[],
  min: number,
  max: number
): Promise<number[] | null> {
  const actor = get().players[get().activeSeat];
  if (!actor.isHuman) {
    return Promise.resolve(aiPickTargets(get(), actor.seat, candidates, min, max));
  }
  return new Promise((resolve) => {
    targetResolver = resolve;
    set((s) => {
      s.pendingTarget = {
        title, sourceLabel, candidates, min, max,
        onConfirm: (_seats: number[]) => { s.pendingTarget = null; },
        onCancel: () => { s.pendingTarget = null; },
      };
    });
  });
}

/**
 * AI 选目标：按威胁度与阵营目标排序，而不是"60% 概率盯着人类玩家、否则随机"。
 * 这样焚稿人会去打篇幅最高的人，无名海岸会优先处理守序阵营，
 * 补刀残血也终于变成了自然行为。
 */
export function aiPickTargets(
  state: GameState,
  actorSeat: number,
  candidates: number[],
  min: number,
  max: number,
): number[] {
  if (candidates.length === 0) return [];
  const difficulty = readDifficulty();
  const count = Math.max(min, Math.min(max, candidates.length));
  const remaining = [...candidates];
  const chosen: number[] = [];
  while (chosen.length < count && remaining.length > 0) {
    const pick = pickBestTarget(state, actorSeat, remaining, difficulty);
    const idx = remaining.indexOf(pick);
    if (idx < 0) break;
    remaining.splice(idx, 1);
    chosen.push(pick);
  }
  return chosen;
}

export async function requestDefense(
  set: SetFn,
  get: GetFn,
  attackerSeat: number,
  targetSeat: number,
  damage: number,
  unavoidable: boolean,
  reason: string
): Promise<{ dodged: boolean; usedLiubaiPing: boolean; usedAnyHand: boolean }> {
  const target = get().players[targetSeat];
  const hasLiubai = target.hand.some((c) => c.key === "liubai");
  // [P2-41] liubaiping: if no liubai but has any hand, can use any card to defend
  const hasLiubaiPingArmor = equipAt(target, "armor")?.key === "liubaiping";
  const hasAnyHand = target.hand.length > 0;
  let hasDodge = hasLiubai;
  if (hasLiubaiPingArmor && hasAnyHand) hasDodge = true;
  if (!target.isHuman) {
    let dodge = false;
    let usedAny = false;
    if (!unavoidable && hasDodge) {
      dodge = shouldDefend(target, damage, readDifficulty());
      if (dodge && !hasLiubai) usedAny = true;
    }
    return { dodged: dodge, usedLiubaiPing: usedAny, usedAnyHand: usedAny };
  }
  if (unavoidable || !hasDodge) return { dodged: false, usedLiubaiPing: false, usedAnyHand: false };
  return new Promise((resolve) => {
    defenseResolver = (dodge: boolean) => {
      const usedAny = dodge && !hasLiubai;
      resolve({ dodged: dodge, usedLiubaiPing: usedAny, usedAnyHand: usedAny });
    };
    set((s) => {
      s.pendingDefense = {
        attackerSeat, targetSeat, damage, unavoidable, reason,
        onResolved: () => {},
      };
    });
  });
}

export async function requestChoice(
  set: SetFn,
  get: GetFn,
  seat: number,
  title: string,
  desc: string,
  yesLabel: string,
  noLabel: string,
  aiChance: number
): Promise<boolean> {
  const p = get().players[seat];
  if (!p.isHuman) {
    return Promise.resolve(rand() < aiChance);
  }
  return new Promise((resolve) => {
    choiceResolver = resolve;
    set((s) => {
      s.pendingChoice = { title, desc, yesLabel, noLabel, resolve: () => {} };
    });
  });
}

// Show a notification modal to human player when a card is used against them
export async function requestCardNotice(
  set: SetFn,
  get: GetFn,
  fromSeat: number,
  targetSeat: number,
  cardKey: string,
  cardName: string,
  desc: string,
  caption?: string,
): Promise<void> {
  const target = get().players[targetSeat];
  if (!target.isHuman) {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    cardNoticeResolver = resolve;
    set((s) => {
      s.pendingCardNotice = { fromSeat, targetSeat, cardKey, cardName, desc, caption, onAcknowledged: () => {} };
    });
  });
}

// Request poti (破题) response window from other players
export async function requestPotiResponse(
  set: SetFn,
  get: GetFn,
  casterSeat: number,
  cardKey: string,
  targetSeat: number
): Promise<{ countered: boolean; counterSeat: number | null }> {
  // Check all other alive players for poti in hand (not caster, not target initially - but anyone can counter per card text)
  for (const p of get().players) {
    if (p.seat === casterSeat || !p.alive) continue;
    const potiIdx = p.hand.findIndex((c) => c.key === "poti");
    if (potiIdx < 0) continue;
    let usePoti = false;
    if (!p.isHuman) {
      usePoti = shouldCounter(p, casterSeat, targetSeat, readDifficulty());
    } else {
      usePoti = await new Promise<boolean>((resolve) => {
        potiResolver = resolve;
        set((s) => {
          s.pendingChoice = {
            title: "破题响应",
            desc: `${pName(get().players[casterSeat])}使用了策略牌【${cardKey}】，是否打出【破题】使其失效？`,
            yesLabel: "打出破题",
            noLabel: "不响应",
            resolve: () => {},
          };
        });
      });
    }
    if (usePoti) {
      set((s) => {
        const pl = s.players[p.seat];
        const idx = pl.hand.findIndex((c) => c.key === "poti");
        if (idx >= 0) {
          const [c] = pl.hand.splice(idx, 1);
          s.discardPile.push(c);
        }
        log(s, `${pName(pl)} 打出【破题】，抵消了${pName(s.players[casterSeat])}的策略牌！`, "card");
        pushNotice(s, casterSeat, "策略牌被破题", "block");
        pushNotice(s, p.seat, "破题！", "buff");
      });
      // [P1-16] breach_penalty: if countered player has breach_penalty skill, counterSeat takes 1 damage
      const countered = get().players[casterSeat];
      if (skillUnlocked(countered, "breach_penalty") && !countered.skillUses["breach_penalty_turn"]) {
        set((s) => {
          const cpl = s.players[casterSeat];
          cpl.skillUses["breach_penalty_turn"] = 1;
          log(s, `${pName(cpl)}的【违约之罚】发动，${pName(s.players[p.seat])}受到1段伤害！`, "skill");
        });
        await new Promise<void>((r) => set((s) => { applyDamageSync(s, p.seat, 1, casterSeat, "违约之罚"); r(); }));
      }
      return { countered: true, counterSeat: p.seat };
    }
  }
  return { countered: false, counterSeat: null };
}

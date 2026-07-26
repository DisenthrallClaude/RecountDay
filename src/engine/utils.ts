import type { CardDef, EquipSlot } from "../data/cards";
import type { PlayerState } from "./types";

/**
 * 畸变物是否处于生效状态。
 * 【破邪】会挂上 equips_suppressed，让目标的畸变物在一轮内全部失效
 * （卡面是"失效"，不是"销毁"）。所有读取装备"功能"的地方都必须走这里，
 * 只有纯展示用途才直接读 p.equips。
 */
export function equipsActive(p: PlayerState): boolean {
  return !p.statusFlags["equips_suppressed"];
}

/** 取某个栏位上"当前生效"的畸变物 */
export function equipAt(p: PlayerState, slot: EquipSlot): CardDef | undefined {
  return equipsActive(p) ? p.equips[slot] : undefined;
}

export function seatDistance(a: PlayerState, b: PlayerState, playerCount = 4): number {
  if (a.seat === b.seat) return 0;
  const diff = Math.abs(a.seat - b.seat);
  const base = Math.min(diff, playerCount - diff); // 1 = neighbor, 2 = opposite
  let mod = 0;
  if (equipAt(a, "mount-")) mod -= 1; // attacker's -1 mount shortens distance to others
  if (equipAt(b, "mount+")) mod += 1; // defender's +1 mount lengthens distance from others
  return Math.max(1, base + mod);
}

export function attackRange(p: PlayerState, bonus = 0): number {
  const weaponRange = equipAt(p, "weapon")?.range ?? 1;
  return weaponRange + bonus;
}

export function rankFromTurnCount(ownTurnCount: number): 1 | 2 | 3 | 4 {
  // ownTurnCount = number of turns already taken (0-indexed before current)
  const n = ownTurnCount + 1; // the turn about to happen / happening
  if (n <= 2) return 1;
  if (n <= 4) return 2;
  if (n <= 6) return 3;
  return 4;
}

export function nextAliveSeat(players: PlayerState[], from: number): number {
  const n = players.length;
  for (let i = 1; i <= n; i++) {
    const idx = (from + i) % n;
    if (players[idx].alive) return idx;
  }
  return from;
}

export function aliveCount(players: PlayerState[]): number {
  return players.filter((p) => p.alive).length;
}

let idCounter = 1;
export function nextId(): number {
  idCounter += 1;
  return idCounter;
}

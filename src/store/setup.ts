import { buildFullDeck, shuffle } from "../data/cards";
import { CHARACTERS, getCharacter } from "../data/characters";
import { getFactionsByCategory, type FactionCategory } from "../data/factions";
import type { GameState, PlayerState } from "../engine/types";
import { drawCards, log, makePlayer } from "./helpers";

export function pickFactionsAndAssign(state: GameState) {
  const cats = Object.keys({ ORDER: 1, SHADOW: 1, SEEKER: 1, TRANSCENDENT: 1, SANCTUARY: 1, COURIER: 1 }) as FactionCategory[];
  const chosenCats = shuffle(cats).slice(0, 4);
  const chosenFactions = chosenCats.map((c) => shuffle(getFactionsByCategory(c))[0]);
  const shuffledFactions = shuffle(chosenFactions);
  state.players.forEach((p, i) => {
    p.factionId = shuffledFactions[i].id;
  });
}

export interface InitOptions {
  characterId: number;
}

export function buildInitialState(opts: InitOptions): GameState {
  const usedIds = new Set([opts.characterId]);
  const aiIds: number[] = [];
  while (aiIds.length < 3) {
    const cand = CHARACTERS[Math.floor(Math.random() * CHARACTERS.length)].id;
    if (!usedIds.has(cand)) { usedIds.add(cand); aiIds.push(cand); }
  }
  const players: PlayerState[] = [
    makePlayer(0, true, opts.characterId, 0),
    makePlayer(1, false, aiIds[0], 0),
    makePlayer(2, false, aiIds[1], 0),
    makePlayer(3, false, aiIds[2], 0),
  ];
  const state: GameState = {
    started: true, round: 1, activeSeat: 0, phase: "recover",
    players, deck: shuffle(buildFullDeck()), discardPile: [],
    log: [], winner: null, pendingTarget: null, pendingDefense: null,
    pendingChoice: null, pendingCardNotice: null, pendingDiscard: null,
    statusEffects: [], selectedHandUid: null, animTick: 0,
    lastPlayedStrategyKey: null, lastPlayedStrategyCaster: null, duelState: null, narrationBanner: null,
    floatingNotices: [],
    cardPlayEffect: null,
  };
  pickFactionsAndAssign(state);
  // drawCards 已经累加了 drawnTotal，这里不能再赋值覆盖，否则起手牌被漏计
  state.players.forEach((p) => drawCards(state, p.seat, 4));
  // 纸鸢社(12) 需要知道"开局有哪些对手"，淘汰时会同步剔除
  state.players.forEach((p) => {
    state.players.forEach((o) => { if (o.seat !== p.seat) p.stats.initialOpponents.add(o.seat); });
  });
  state.activeSeat = Math.floor(Math.random() * 4);
  log(state, `游戏开始！由座位${state.activeSeat + 1}先手。`, "system");
  return state;
}

// re-export getCharacter for convenience (used by skills.ts via helpers)
export { getCharacter };

import type { CardDef, EquipSlot } from "../data/cards";

export type Phase = "recover" | "draw" | "play" | "discard";

export interface StatusEffect {
  key: string;
  label: string;
  expiresAfterPlayerTurnId: number; // owner index whose turn-start clears it ("直到你的下回合开始")
  data?: Record<string, unknown>;
}

export interface LogEntry {
  id: number;
  text: string;
  kind?: "damage" | "heal" | "skill" | "system" | "win" | "card";
}

export interface PlayerStats {
  factionFlags: Set<number>;
  killedCount: number;
  residueCount: number;
  totalHealed: number;
  handsOrEquipTaken: number;
  drawnTotal: number;
  /** 曾被本玩家造成过伤害的座位（伤害账本）。用于"助攻"类胜利条件 */
  damagedSeats: Set<number>;
  /** damagedSeats 中最终被淘汰的座位 —— 第七灯塔(17) */
  damagedEliminated: Set<number>;
  /** 真正看过全部手牌的座位（单张窥牌不计）—— 纸鸢社(12) */
  viewedFullHandOf: Set<number>;
  /** 开局时的对手座位集合，纸鸢社据此判定"所有其他玩家" */
  initialOpponents: Set<number>;
  equipAcquiredCount: number; // 长夜档案馆
  recoveredFromLowCount: number; // 迷途
  usedActiveSkillEver: boolean;
  usedBifaAsUser: boolean;
  /** 是否装备过任何畸变物（任意栏位）—— 失语者同盟(19) / 乌墨海(22) */
  everEquippedAberration: boolean;
  everEquippedTrinket: boolean;
  minFragmentRatio: number; // lowest fragments/max ratio ever reached (while alive)
  /** 初始最大篇幅。烬余爆发会永久降低 maxFragments，白烛修会(13) 必须以初始值为分母 */
  initialMaxFragments: number;
}

export interface PlayerState {
  seat: number; // 0..3 clockwise, 0 = human
  isHuman: boolean;
  characterId: number;
  factionId: number;
  fragments: number;
  maxFragments: number;
  hand: CardDef[];
  equips: Partial<Record<EquipSlot, CardDef>>;
  judgement: CardDef[];
  alive: boolean;
  rank: 1 | 2 | 3 | 4;
  ownTurnCount: number;
  overloaded: boolean; // active this coming turn
  turnSpent: number; // fragments spent this turn (for overload calc)
  usedBifaThisTurn: boolean;
  skillUses: Record<string, number>; // this-turn usage count
  gameSkillUses: Record<string, number>; // whole-game usage count
  onceFlags: Record<string, boolean | number | string>;
  stored: CardDef | null; // 崔攸 藏锋
  shadowClone: { hp: number; expiresAfterPlayerTurnId: number } | null;
  puppetTarget: number | null; // 宋凉 替身傀儡 -> seat that takes damage instead, with expiry tracked in statusEffects
  stats: PlayerStats;
  factionRevealed: boolean;
  eliminatedRound?: number;
  statusFlags: Record<string, { expireSeat: number; meta?: number }>;
  tempRangeBonus: number;
  tempFullRange: boolean;
  overloadActiveThisTurn: boolean;
}

export interface PendingTarget {
  title: string;
  sourceLabel: string;
  candidates: number[]; // seat indices
  min: number;
  max: number;
  onConfirm: (targets: number[]) => void;
  onCancel?: () => void;
}

export interface PendingChoice {
  title: string;
  desc: string;
  yesLabel: string;
  noLabel: string;
  resolve: (yes: boolean) => void;
}

export interface PendingDefense {
  attackerSeat: number;
  targetSeat: number;
  damage: number;
  unavoidable: boolean;
  reason: string;
  onResolved: (dodged: boolean) => void;
}

export interface PendingCardNotice {
  fromSeat: number;      // 头像所属者（出牌者，或被窥牌者）
  targetSeat: number;    // 收到这条通知的人（通常是人类玩家）
  cardKey: string;       // card key for image lookup
  cardName: string;      // card display name
  desc: string;          // effect description
  /** 头像下方的小标题。默认"对你使用了卡牌"，窥牌等场景需要不同措辞 */
  caption?: string;
  onAcknowledged: () => void;
}

export interface GameState {
  started: boolean;
  round: number;
  activeSeat: number;
  phase: Phase;
  players: PlayerState[];
  deck: CardDef[];
  discardPile: CardDef[];
  log: LogEntry[];
  winner: { seats: number[]; text: string; surrendered?: boolean } | null;
  pendingTarget: PendingTarget | null;
  pendingDefense: PendingDefense | null;
  pendingChoice: PendingChoice | null;
  pendingCardNotice: PendingCardNotice | null;
  pendingDiscard: { count: number } | null;
  statusEffects: StatusEffect[];
  selectedHandUid: string | null;
  animTick: number;
  lastPlayedStrategyKey: string | null;
  lastPlayedStrategyCaster: number | null;
  duelState: { a: number; b: number; turn: number; damageTarget: number } | null;
  narrationBanner: string | null;
  /**
   * 座位上方的浮动提示。
   *
   * 破题反制、正身符印/空白之身免疫、叙事壁垒抵消这类效果原本只写进战报，
   * 而战报面板默认是收起的 —— 玩家眼里就是"我的策略牌凭空消失了"。
   * 这些关键判定必须在棋盘上当场可见。
   */
  floatingNotices: { id: number; seat: number; text: string; tone: "block" | "buff" | "info" }[];
  /**
   * 最近一次出牌演出。targetSeats 让特效层知道牌该"飞向谁"，
   * 而不是一律飞到屏幕中心 —— 这是出牌动效有没有说服力的关键。
   */
  cardPlayEffect: {
    id: number;
    cardKey: string;
    cardName: string;
    fromSeat: number;
    targetSeats: number[];
  } | null;
}

import type { GameState, PlayerState } from "./types";
import { FACTIONS } from "../data/factions";
import { getCharacter } from "../data/characters";

/**
 * 阵营隐藏胜利条件判定
 * ============================================================================
 * 设计原则（本轮重构确立）：
 *  1. 每个条件都必须有真实记录的统计字段支撑 —— 不允许"永远为假"的死条件。
 *  2. 条件语义必须与 factions.ts 的文案一致；文案与实现只能有一个真相。
 *  3. 阈值按实际对局长度校准：四人局通常在 24~32 个玩家回合内结束，
 *     因此需要"累计到 N"的条件必须在这个窗口内可达，且不能唾手可得。
 *  4. 终局类条件（存活到最后2人）必须真的构成博弈，不能被纯计时条件抢跑。
 * ============================================================================
 */

function aliveSeats(state: GameState): number[] {
  return state.players.filter((p) => p.alive).map((p) => p.seat);
}

function alivePlayers(state: GameState): PlayerState[] {
  return state.players.filter((p) => p.alive);
}

/** 同时装备中的畸变物件数（两种坐骑共享一个"坐骑"位） */
function equippedCount(p: PlayerState): number {
  let n = 0;
  if (p.equips.weapon) n++;
  if (p.equips.armor) n++;
  if (p.equips["mount+"] || p.equips["mount-"]) n++;
  if (p.equips.trinket) n++;
  return n;
}

/** 白烛修会以"初始最大篇幅"为分母 —— 烬余爆发会永久降低 maxFragments */
function initialRatio(p: PlayerState): number {
  const denom = p.stats.initialMaxFragments || p.maxFragments || 1;
  return p.fragments / denom;
}

export function checkFactionWin(state: GameState, p: PlayerState): boolean {
  if (!p.alive) return false;
  const endgameLE2 = aliveSeats(state).length <= 2;

  switch (p.factionId) {
    case 1: // 灰塔：淘汰2名其他玩家
      return p.stats.killedCount >= 2;

    case 2: // 白纸城：存活到自己的第8回合结束
      return p.ownTurnCount >= 8;

    case 3: // 镜湖议会：不以自己为使用者打出笔伐，且成为最后存活的2人之一
      return !p.stats.usedBifaAsUser && endgameLE2;

    case 4: // 长夜档案馆：累计获得3件畸变物（篡取或装备均计）
      return p.stats.equipAcquiredCount >= 3;

    case 5: // 焚稿人：淘汰当前篇幅最高的其他玩家
      return p.stats.factionFlags.has(5);

    case 6: // 第十三书签：淘汰1名玩家后存活到自己的下一回合结束
      return p.stats.factionFlags.has(6);

    case 7: // 黑帆书库：累计从其他玩家处获得4张手牌或畸变物
      return p.stats.handsOrEquipTaken >= 4;

    case 8: // 无名海岸：淘汰守序阵营的1名玩家
      return p.stats.factionFlags.has(8);

    case 9: {
      // 远星：叙事等级达到四阶时仍存活，且篇幅不低于最大篇幅的一半。
      // 原实现只要求 rank===4（自己的第7回合），无任何附加条件，
      // 会稳定抢在所有其他阵营之前触发，等同于"谁活到第7回合谁赢"。
      return p.rank === 4 && p.fragments * 2 >= p.maxFragments;
    }

    case 10: // 旧日读书会：同时装备3件畸变物
      return equippedCount(p) >= 3;

    case 11: // 锈字修道院：累计恢复篇幅达到12段
      return p.stats.totalHealed >= 12;

    case 12: {
      // 纸鸢社：查看过所有"当前仍存活的其他玩家"的全部手牌各至少1次。
      // initialOpponents 会在有人淘汰时同步剔除，避免出现
      // "看了2个人 → 死了1个 → 阈值降到2 → 未看过的人被跳过"的误判。
      const need = alivePlayers(state).filter((o) => o.seat !== p.seat).map((o) => o.seat);
      if (need.length === 0) return false;
      return need.every((s) => p.stats.viewedFullHandOf.has(s));
    }

    case 13: // 白烛修会：全程篇幅不低于初始最大篇幅的50%，且成为最后存活的2人之一
      return p.stats.minFragmentRatio >= 0.5 && initialRatio(p) >= 0.5 && endgameLE2;

    case 14: // 留白：不主动使用角色技能，存活到最后2人
      return !p.stats.usedActiveSkillEver && endgameLE2;

    case 15: // 冬夜学派：淘汰1名玩家，且淘汰时篇幅不低于最大篇幅的75%
      return p.stats.factionFlags.has(15);

    case 16: // 墨冢：拾取2个叙事残片
      return p.stats.residueCount >= 2;

    case 17: // 第七灯塔：对2名被淘汰的玩家均造成过至少1段篇幅伤害（助攻即可）
      return p.stats.damagedEliminated.size >= 2;

    case 18: // 迷途：从2段及以下篇幅恢复到满篇幅2次
      return p.stats.recoveredFromLowCount >= 2;

    case 19: // 失语者同盟：不主动使用技能且不装备任何畸变物，存活到最后2人
      return !p.stats.usedActiveSkillEver && !p.stats.everEquippedAberration && endgameLE2;

    case 20: // 渡鸦邮局：累计从牌堆摸牌数达到20张
      return p.stats.drawnTotal >= 20;

    case 21: // 纸船会：直接淘汰1名玩家时，篇幅不低于最大篇幅的50%
      return p.stats.factionFlags.has(21);

    case 22: // 乌墨海：全程不装备任何畸变物，且存活到最后2人
      return !p.stats.everEquippedAberration && endgameLE2;

    default:
      return false;
  }
}

function displayName(state: GameState, seat: number): string {
  const p = state.players[seat];
  if (!p) return `座位${seat + 1}`;
  return getCharacter(p.characterId).name;
}

function factionName(factionId: number): string {
  return FACTIONS.find((f) => f.id === factionId)?.name ?? "未知";
}

export function evaluateWinners(state: GameState): { seats: number[]; text: string } | null {
  const alive = alivePlayers(state);

  // 全灭：无人胜出（由上层流程收束，这里不宣布赢家）
  if (alive.length === 0) return null;

  // 阵营条件优先于"最后存活者"结算：
  // 若最后2人中有人已达成隐藏条件，应当以阵营胜利收束，而不是等到剩1人。
  const winners = state.players.filter((p) => p.alive && checkFactionWin(state, p));
  if (winners.length > 0) {
    const names = winners
      .map((w) => `${displayName(state, w.seat)}（${factionName(w.factionId)}）`)
      .join("、");
    return {
      seats: winners.map((w) => w.seat),
      text: `${names} 达成阵营的隐藏胜利条件！`,
    };
  }

  // 最后存活者兜底
  if (alive.length === 1) {
    const last = alive[0];
    return {
      seats: [last.seat],
      text: `${displayName(state, last.seat)} 成为最后存活者，获得胜利！`,
    };
  }

  return null;
}

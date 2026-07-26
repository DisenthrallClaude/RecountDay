import type { CardDef } from "../data/cards";
import { FACTIONS } from "../data/factions";
import type { GameState, PlayerState } from "../engine/types";
import { equipAt, nextAliveSeat } from "../engine/utils";
import {
  alivePlayers,
  log,
  maybeDeclareWinner,
  pName,
  pushNotice,
  skillUnlocked,
  updateMinRatio,
} from "./helpers";

// ---- damage / heal core ----
// applyDamageSync: synchronous damage application on immer draft
export function applyDamageSync(state: GameState, targetSeat: number, amount: number, sourceSeat: number | null, reason: string) {
  let t = state.players[targetSeat];
  // [P0-6] early return if dead
  if (!t.alive) return;
  // [P0-2] puppet redirection FIXED: when target (owner) has puppet_active and puppetTarget, redirect damage to puppetTarget
  if (t.puppetTarget !== null && t.statusFlags["puppet_active"]) {
    const puppetSeat = t.puppetTarget;
    if (puppetSeat !== targetSeat && state.players[puppetSeat].alive) {
      log(state, `${pName(t)}的【替身傀儡】发动，伤害由${pName(state.players[puppetSeat])}承担！`, "skill");
      targetSeat = puppetSeat;
      t = state.players[targetSeat];
    }
  }
  // shadow clone absorption
  if (t.shadowClone && t.shadowClone.hp > 0) {
    const absorb = Math.min(amount, t.shadowClone.hp);
    t.shadowClone.hp -= absorb;
    amount -= absorb;
    log(state, `${pName(t)}的万影分身吸收了${absorb}段伤害。`, "skill");
    if (t.shadowClone.hp <= 0) {
      t.shadowClone = null;
      log(state, `${pName(t)}的分身已消散。`, "skill");
    }
  }
  if (amount <= 0) return;
  // fate intervene passive
  if (skillUnlocked(t, "fate_intervene") && (t.gameSkillUses["fate_intervene"] ?? 0) < 3 && !t.skillUses["fate_intervene_turn"]) {
    amount -= 1;
    t.gameSkillUses["fate_intervene"] = (t.gameSkillUses["fate_intervene"] ?? 0) + 1;
    t.skillUses["fate_intervene_turn"] = 1;
    log(state, `${pName(t)}发动【命运干预】，抵消1段伤害。`, "skill");
    pushNotice(state, targetSeat, "命运干预 · −1", "block");
    if (amount <= 0) return;
  }
  // 叙事壁垒：每回合完全抵消第 1 次【笔伐】伤害。
  // 原实现对任何来源都只减 1 点，导致：
  //   a) 论辨/重叙/技能伤害也被它挡（超出卡面描述）；
  //   b) 面对染血墨笔的 2 段笔伐仍会漏 1 点（未做到"抵消"）。
  if (
    equipAt(t, "armor")?.key === "bilei" &&
    !t.skillUses["bilei_used_turn"] &&
    reason.includes("笔伐")
  ) {
    t.skillUses["bilei_used_turn"] = 1;
    log(state, `${pName(t)}的【叙事壁垒】完全抵消了这次笔伐（${amount}段）！`, "skill");
    pushNotice(state, targetSeat, "叙事壁垒 · 抵消", "block");
    return;
  }
  t.fragments -= amount;
  log(state, `${pName(t)} 受到 ${amount} 段篇幅伤害。(${reason})`, "damage");
  // 伤害账本：记录"我伤害过谁"。第七灯塔(17) 需要的是助攻语义，
  // 不是击杀语义 —— 目标日后被任何人淘汰时再结算。
  if (sourceSeat !== null && sourceSeat !== targetSeat) {
    state.players[sourceSeat].stats.damagedSeats.add(targetSeat);
  }
  // [P1-29] spreading_pain / [P2-37] suoshi: set no_regen_next BEFORE clearExpiredStatus
  if (sourceSeat !== null) {
    const src = state.players[sourceSeat];
    if (skillUnlocked(src, "spreading_pain") && t.alive) {
      t.statusFlags["no_regen_next"] = { expireSeat: nextAliveSeat(state.players, targetSeat) };
    }
    if (equipAt(src, "weapon")?.key === "suoshi" && t.alive) {
      t.statusFlags["no_regen_next"] = { expireSeat: nextAliveSeat(state.players, targetSeat) };
      log(state, `${pName(src)}的【溯时沙漏】生效，${pName(t)}下回合无法自然恢复！`, "skill");
    }
  }
  updateMinRatio(t);
  if (t.fragments <= 0) {
    // immortal body
    if (skillUnlocked(t, "immortal_body") && !t.onceFlags["immortal_used"]) {
      t.fragments = 1;
      t.onceFlags["immortal_used"] = true;
      updateMinRatio(t);
      log(state, `${pName(t)}的【不朽之躯】发动，篇幅保留为1段！`, "skill");
      pushNotice(state, targetSeat, "不朽之躯", "buff");
      return;
    }
    // self canmo rescue (auto-use)
    const canmoIdx = t.hand.findIndex((c) => c.key === "canmo");
    if (canmoIdx >= 0) {
      const [c] = t.hand.splice(canmoIdx, 1);
      state.discardPile.push(c);
      // 走 healPlayer 而不是直接赋值，否则这次治疗不会计入 totalHealed，
      // 锈字修道院(11) 与迷途(18) 的统计就漏了自救这一大块。
      t.fragments = 0;
      healPlayer(state, targetSeat, 1, "残墨自救");
      updateMinRatio(t);
      return;
    }
    eliminatePlayer(state, targetSeat, sourceSeat);
  }
}

export function healPlayer(state: GameState, seat: number, amount: number, cause: string) {
  const p = state.players[seat];
  if (!p.alive) return;
  const before = p.fragments;
  const wasLow = before <= 2;
  p.fragments = Math.min(p.maxFragments, p.fragments + amount);
  const healed = p.fragments - before;
  if (healed > 0) {
    p.stats.totalHealed += healed;
    if (cause) log(state, `${pName(p)} 恢复 ${healed} 段篇幅。(${cause})`, "heal");
    // 迷途(18)："从2段及以下恢复到满篇幅"是一段旅程，不是一次治疗。
    // 自然恢复每回合只 +1，要求单次治疗从 2 跳到满几乎不可能，
    // 所以除了原来的"本次治疗起点就很低"，还接受 updateMinRatio 留下的低谷标记。
    const cameFromLow = wasLow || !!p.onceFlags["was_low_fragments"];
    if (cameFromLow && p.fragments >= p.maxFragments) {
      p.stats.recoveredFromLowCount += 1;
      delete p.onceFlags["was_low_fragments"];
    }
  }
}


export function eliminatePlayer(state: GameState, seat: number, killerSeat: number | null) {
  const p = state.players[seat];
  if (!p.alive) return;
  // [P4-52][P4-54] Record original fragments BEFORE setting to 0 / heal
  const originalFragments = p.fragments;
  p.alive = false;
  p.fragments = 0;
  p.factionRevealed = true;
  p.eliminatedRound = state.round;
  log(state, `${pName(p)} 篇幅归零，已被归档出局！其阵营【${FACTIONS.find(f=>f.id===p.factionId)?.name}】已公开。`, "system");
  // 结算助攻：所有曾伤害过该玩家的人，都记下"我伤害过的人被淘汰了"
  for (const other of state.players) {
    if (other.seat !== seat && other.stats.damagedSeats.has(seat)) {
      other.stats.damagedEliminated.add(seat);
    }
  }
  // 纸鸢社(12)：被淘汰者退出"需要看穿的对手"名单，避免死人拖住条件
  for (const other of state.players) {
    other.stats.viewedFullHandOf.delete(seat);
  }
  // [P5-62] Clean up statusFlags for dead player and reset puppetTarget references
  p.statusFlags = {};
  for (const other of state.players) {
    if (other.puppetTarget === seat) {
      other.puppetTarget = null;
      delete other.statusFlags["puppet_active"];
    }
  }
  // residue
  let recipient = killerSeat;
  if (recipient === null || recipient === seat) {
    const alive = alivePlayers(state).filter((pp) => pp.seat !== seat);
    if (alive.length) {
      alive.sort((a, b) => seatDistance(p, a) - seatDistance(p, b));
      recipient = alive[0].seat;
    }
  }
  if (recipient !== null && state.players[recipient]?.alive) {
    const killer = state.players[recipient];
    // [P4-54] Check faction flags BEFORE healPlayer
    if (killerSeat === recipient) {
      checkKillTimeFactionFlags(state, killer, p, originalFragments);
    }
    healPlayer(state, recipient, 2, "拾取叙事残片");
    killer.stats.residueCount += 1;
    if (killerSeat === recipient) {
      killer.stats.killedCount += 1;
      // 直接击杀也算作"伤害过并使其淘汰"
      killer.stats.damagedEliminated.add(seat);
    }
  }
  // 手牌 / 装备 / 判定区 / 藏锋区，全部入弃牌堆。
  // 藏锋区（崔攸）此前被漏掉了：那张牌会永远卡在一个已淘汰玩家身上，
  // 既不回弃牌堆、也不参与洗牌，等于从这一局里凭空消失。
  // skills.ts:283/300 处理换牌与释放时都是把 stored 推进弃牌堆的，
  // 这里保持同一套约定。
  state.discardPile.push(
    ...p.hand,
    ...(Object.values(p.equips).filter(Boolean) as CardDef[]),
    ...p.judgement,
    ...(p.stored ? [p.stored] : []),
  );
  p.hand = []; p.equips = {}; p.judgement = []; p.stored = null;

  // 淘汰会同时改变击杀数、残片数、助攻数和存活人数 —— 立刻结算，
  // 否则达成条件的玩家可能在同一回合内被反杀而丢掉胜利。
  maybeDeclareWinner(state);
}

// [P4-52][P4-54] checkKillTimeFactionFlags: check faction flags BEFORE heal
function checkKillTimeFactionFlags(state: GameState, killer: PlayerState, victim: PlayerState, victimOriginalFragments: number) {
  // 焚稿人 (5): 淘汰篇幅最高的其他存活玩家
  if (killer.factionId === 5) {
    const othersAlive = state.players.filter((p) => p.alive && p.seat !== killer.seat && p.seat !== victim.seat);
    const maxOtherFrag = othersAlive.length ? Math.max(...othersAlive.map((p) => p.fragments)) : 0;
    if (victimOriginalFragments >= maxOtherFrag) {
      killer.stats.factionFlags.add(5);
      log(state, `${pName(killer)}达成【焚稿人】胜利条件：淘汰了篇幅最高的玩家！`, "skill");
    }
  }
  // [P4-53] 第十三书签 (6): set kill turn marker, triggers at killer's NEXT own turn end
  if (killer.factionId === 6) {
    killer.onceFlags["pending_13signature_kill_turnCount"] = state.players.reduce((s, pp) => s + pp.ownTurnCount, 0);
    killer.onceFlags["pending_13signature_active"] = true;
    log(state, `${pName(killer)}的【第十三书签】印记已刻下，存活到自己下回合结束即可胜利。`, "skill");
  }
  // 无名海岸(8): 淘汰守序玩家
  const victimFaction = FACTIONS.find((f) => f.id === victim.factionId);
  if (killer.factionId === 8 && victimFaction?.category === "ORDER") killer.stats.factionFlags.add(8);
  // 冬夜学派(15): 淘汰时篇幅>=75%
  if (killer.factionId === 15 && killer.fragments / killer.maxFragments >= 0.75) killer.stats.factionFlags.add(15);
  // 纸船会(21): 直接淘汰时篇幅>=50%
  if (killer.factionId === 21 && killer.fragments / killer.maxFragments >= 0.5) killer.stats.factionFlags.add(21);
}

// spend fragments (for skill costs), check for death
export function spendSync(state: GameState, seat: number, amount: number, reason: string) {
  const p = state.players[seat];
  if (!p.alive) return;
  p.fragments -= amount;
  p.turnSpent += amount;
  log(state, `${pName(p)} 消耗 ${amount} 段篇幅。(${reason})`, "system");
  updateMinRatio(p);
  // [P1-35] After spend, check for death (like applyDamage)
  if (p.fragments <= 0) {
    if (skillUnlocked(p, "immortal_body") && !p.onceFlags["immortal_used"]) {
      p.fragments = 1;
      p.onceFlags["immortal_used"] = true;
      updateMinRatio(p);
      log(state, `${pName(p)}的【不朽之躯】发动，篇幅保留为1段！`, "skill");
      return;
    }
    const canmoIdx = p.hand.findIndex((c) => c.key === "canmo");
    if (canmoIdx >= 0) {
      const [c] = p.hand.splice(canmoIdx, 1);
      state.discardPile.push(c);
      p.fragments = 0;
      healPlayer(state, seat, 1, "残墨自救");
      updateMinRatio(p);
      return;
    }
    eliminatePlayer(state, seat, null);
  }
}

// local seatDistance re-export for eliminatePlayer
import { seatDistance } from "../engine/utils";

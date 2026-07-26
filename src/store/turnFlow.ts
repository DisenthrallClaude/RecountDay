import { evaluateWinners } from "../engine/win";
import { equipAt, nextAliveSeat, rankFromTurnCount } from "../engine/utils";
import { playCardInternal, processJudgementEffect, resolveJudgement } from "./cardEffects";
import { applyDamageSync, healPlayer } from "./damage";
import { useSkillInternal } from "./skills";
import { chooseAction, pickDiscards, readDifficulty } from "./ai";
import {
  alivePlayers,
  clearExpiredStatus,
  drawCards,
  log,
  pName,
  setAnim,
  skillUnlocked,
  sleep,
} from "./helpers";
import type { SetFn, GetFn } from "./helpers";

/**
 * 进入"终章"的玩家回合数阈值。
 * 计时类阵营条件大多落在自己的第 7~8 回合（约 28~32 个玩家回合），
 * 这里留到 44 才收网，既给足达成空间，又保证对局必然终结。
 */
const FINAL_CHAPTER_AT = 44;

/**
 * "每回合限1次"的防御性效果。
 * 这些属于被动防守，理应在每一个进攻回合都重新可用，
 * 而不是等到自己的回合才刷新。
 */
const DEFENSIVE_PER_TURN_KEYS = [
  "bilei_used_turn",
  "zhengshen_turn",
  "blank_body_turn",
  "law_body_turn",
  "fate_intervene_turn",
  "quell_strife_turn",
  "cost_transfer_turn",
];

// ---------------- Turn Flow ----------------
export async function startTurn(set: SetFn, get: GetFn, seat: number) {
  set((s) => {
    const p = s.players[seat];
    s.phase = "recover";
    s.activeSeat = seat;
    clearExpiredStatus(s, seat);
    // 清理"每回合限1次"的计数。
    //
    // 注意这里只清了当前行动者自己的计数，于是防御型的每回合限制
    // （叙事壁垒、正身符印、万法不侵、命运干预…）实际变成了"每一轮1次"：
    // 一个装着叙事壁垒的人在别人的三个回合里只能挡下 1 次笔伐。
    // 防御性效果应当在"每一个他人回合"都刷新，所以这里把全场的
    // 防御类计数一并重置，只保留行动者自身的进攻类计数语义。
    p.skillUses = {};
    for (const other of s.players) {
      if (other.seat === seat) continue;
      for (const k of DEFENSIVE_PER_TURN_KEYS) delete other.skillUses[k];
    }
    p.usedBifaThisTurn = false;
    p.overloadActiveThisTurn = false;
    p.tempFullRange = false;
    p.tempRangeBonus = 0;
    p.turnSpent = 0;
    // 【叙事回音】只能复制"本回合"打出的策略牌，因此每个回合开始时清空记录。
    s.lastPlayedStrategyKey = null;
    s.lastPlayedStrategyCaster = null;
    // Update rank
    p.rank = rankFromTurnCount(p.ownTurnCount);
    log(s, `—— ${pName(p)} 的回合开始（回合${p.ownTurnCount + 1}，${p.rank}阶）——`, "system");
    setAnim(s);
  });
  await sleep(400);

  // ── 终章 ──
  // 四人局的伤害经济天然趋向僵持：每人每回合自然恢复 1 段，
  // 而牌堆里 28 张笔伐对 24 张留白，约一半攻击会被挡下，
  // 净伤害长期低于回复速度。若抽到的四个阵营恰好都不是计时类条件，
  // 对局可以无限拖下去（实测出现过 413 个玩家回合仍未分胜负）。
  // 因此在 FINAL_CHAPTER_AT 之后进入终章：停止自然恢复，并逐轮加重侵蚀，
  // 保证任何一局都会收束，同时把结局推向一个有张力的高潮。
  {
    const st = get();
    if (st.round === FINAL_CHAPTER_AT) {
      set((s) => {
        log(s, "—— 终章降临：世界文本开始崩解，叙事者不再自然恢复 ——", "win");
        s.narrationBanner = "终章 · 世界文本开始崩解";
      });
      await sleep(600);
      set((s) => { s.narrationBanner = null; });
    }
  }
  const inFinalChapter = get().round >= FINAL_CHAPTER_AT;

  // Recovery phase: heal 1 (unless no_regen_next / 终章)
  const p = get().players[seat];
  if (inFinalChapter) {
    // 侵蚀强度随终章推进而升高，确保收敛
    const depth = Math.floor((get().round - FINAL_CHAPTER_AT) / (get().players.length * 2)) + 1;
    const erosion = Math.min(3, depth);
    set((s) => log(s, `${pName(s.players[seat])} 被终章侵蚀，失去 ${erosion} 段篇幅。`, "damage"));
    await new Promise<void>((r) => set((s) => { applyDamageSync(s, seat, erosion, null, "终章侵蚀"); r(); }));
    if (!get().players[seat].alive) {
      await passTurnAfterDeath(set, get, seat);
      return;
    }
  } else if (p.statusFlags["no_regen_next"]) {
    set((s) => { log(s, `${pName(s.players[seat])} 受状态影响，本回合不自然恢复。`, "system"); });
  } else {
    await new Promise<void>((r) => set((s) => { healPlayer(s, seat, 1, "自然恢复"); r(); }));
  }
  set((s) => { delete s.players[seat].statusFlags["no_regen_next"]; });
  await sleep(300);

  // Process judgement cards
  const pl = get().players[seat];
  const jcards = [...pl.judgement];
  for (const jc of jcards) {
    // 翻开一张判定牌，用它的花色点数裁决 jc（封笔 / 重叙）的效果
    const flip = await resolveJudgement(set, get, seat, jc.key);
    const result = await processJudgementEffect(set, get, seat, jc, flip);
    set((s) => {
      const plj = s.players[seat];
      // 只有"确实还在判定区、被我们移走"的牌才推进弃牌堆。
      //
      // 重叙判定可以直接把人打死（3 段伤害），而 eliminatePlayer 会把
      // 死者判定区里的所有牌一次性倒进弃牌堆。若这里再无条件 push 一次，
      // 同一张判定牌和同一张翻开牌就会各自多出一份 —— 每有一人死于重叙判定，
      // 牌库净增 2 张。
      const fidx = plj.judgement.findIndex((x) => x.uid === flip.uid);
      if (fidx >= 0) {
        plj.judgement.splice(fidx, 1);
        s.discardPile.push({ ...flip, uid: flip.uid.replace("_j", "") });
      }

      if (result === "remove") {
        const jidx = plj.judgement.findIndex((x) => x.uid === jc.uid);
        if (jidx >= 0) {
          plj.judgement.splice(jidx, 1);
          s.discardPile.push({ ...jc, uid: jc.uid.replace("_j", "") });
        }
      }
      // result === "pass"：重叙本体已在 processJudgementEffect 中移交下家，
      // 这里不能再弃置它，否则"传给下家"链条会当场断掉。
    });
    await sleep(500);
    if (!get().players[seat].alive) {
      // 判定阶段把自己判死了（重叙 3 段伤害足以致命）。
      // 原实现在这里直接 return，回合链就此断掉 —— 没有胜负、也不会轮到下一家，
      // 整局静止。必须显式把回合交出去。
      await passTurnAfterDeath(set, get, seat);
      return;
    }
  }

  // Draw phase
  set((s) => { s.phase = "draw"; });
  let drawCount = 2;
  // duya trinket: +1 card
  if (equipAt(get().players[seat], "trinket")?.key === "duya") drawCount += 1;
  // 【天眷好运】卡面写的是"每回合限1次摸牌可多摸1张"，是确定效果，
  // 原实现却做成 50% 概率，且没有任何次数标记。
  if (skillUnlocked(get().players[seat], "heaven_luck") && !get().players[seat].skillUses["heaven_luck_draw"]) {
    drawCount += 1;
    set((s) => {
      s.players[seat].skillUses["heaven_luck_draw"] = 1;
      log(s, `${pName(s.players[seat])}的【天眷好运】发动，额外摸1张牌！`, "skill");
    });
  }
  await new Promise<void>((r) => set((s) => { drawCards(s, seat, drawCount); log(s, `${pName(s.players[seat])} 摸${drawCount}张牌。`, "system"); r(); }));
  await sleep(300);

  // [P0-4] skip_play check: enter play or jump to discard
  const me = get().players[seat];
  if (me.statusFlags["skip_play"]) {
    set((s) => {
      log(s, `${pName(s.players[seat])} 跳过出牌阶段。`, "system");
      delete s.players[seat].statusFlags["skip_play"];
    });
    await endDiscard(set, get, seat);
    return;
  }

  // Play phase
  set((s) => { s.phase = "play"; });
  // Check if AI
  if (!get().players[seat].isHuman) {
    await aiTurn(set, get, seat);
  }
  // Human players interact via UI; when they end play phase, endDiscard is called
}

export async function endDiscard(set: SetFn, get: GetFn, seat: number) {
  set((s) => { s.phase = "discard"; });
  const p = get().players[seat];
  const handSize = p.hand.length;
  const maxHand = p.fragments; // discard down to fragments count
  if (handSize > maxHand) {
    const needDiscard = handSize - maxHand;
    if (!p.isHuman) {
      // AI 按牌的实际价值弃牌，而不是随机丢 ——
      // 旧实现经常把救命的留白/残墨丢进弃牌堆。
      const toDiscard = pickDiscards(p, needDiscard);
      set((s) => {
        const pl = s.players[seat];
        for (const uid of toDiscard) {
          const idx = pl.hand.findIndex((c) => c.uid === uid);
          if (idx >= 0) { const [c] = pl.hand.splice(idx, 1); s.discardPile.push(c); }
        }
        log(s, `${pName(pl)} 弃置了${toDiscard.length}张牌。`, "system");
      });
    } else {
      // Request discard from human
      await new Promise<void>((resolve) => {
        set((s) => {
          s.pendingDiscard = { count: needDiscard };
        });
        // Wait for confirmDiscard - it will resolve via a promise
        (window as any).__discardResolve = resolve;
      });
    }
  }
  await continueEndTurn(set, get, seat);
}

/**
 * 当前行动者在自己的回合内出局时，把回合安全地交给下一家。
 * 死者不再有出牌/弃牌阶段，但回合链必须继续，否则整局会卡死。
 */
export async function passTurnAfterDeath(set: SetFn, get: GetFn, seat: number) {
  if (get().winner) return;
  const alive = alivePlayers(get());
  if (alive.length <= 1) {
    const w = evaluateWinners(get());
    if (w) set((s) => { s.winner = { ...w }; log(s, w.text, "win"); });
    return;
  }
  const nextSeat = nextAliveSeat(get().players, seat);
  set((s) => { log(s, `—— ${pName(s.players[seat])} 在回合中被归档，回合移交 ——`, "system"); });
  await sleep(400);
  if (get().winner) return;
  await startTurn(set, get, nextSeat);
}

export async function continueEndTurn(set: SetFn, get: GetFn, seat: number) {
  set((s) => {
    s.players[seat].ownTurnCount += 1;
    s.round += 1;
    log(s, `—— ${pName(s.players[seat])} 回合结束 ——`, "system");
    setAnim(s);
  });

  // [P0-3] Check winner after turn end
  {
    const w = evaluateWinners(get());
    if (w) {
      set((s) => { s.winner = { ...w }; log(s, w.text, "win"); });
      return;
    }
  }

  // [P4-53] 第十三书签 check: after killer's own turn ends, if pending and at least one own turn passed
  {
    const me = get().players[seat];
    if (me.factionId === 6 && me.onceFlags["pending_13signature_active"]) {
      const killTurn = me.onceFlags["pending_13signature_kill_turnCount"] as number | undefined;
      const currentTotal = get().players.reduce((s, pp) => s + pp.ownTurnCount, 0);
      if (killTurn !== undefined && currentTotal > killTurn + 1) {
        set((s) => {
          s.players[seat].stats.factionFlags.add(6);
          s.players[seat].onceFlags["pending_13signature_active"] = false;
          log(s, `${pName(s.players[seat])}的【第十三书签】达成，存活到下回合结束！`, "skill");
        });
        const w = evaluateWinners(get());
        if (w) {
          set((s) => { s.winner = { ...w }; log(s, w.text, "win"); });
          return;
        }
      }
    }
  }

  // Next alive player
  const nextSeat = nextAliveSeat(get().players, seat);
  if (get().winner) return;
  // Check only 1 alive
  const alive = alivePlayers(get());
  if (alive.length <= 1) {
    const w = evaluateWinners(get());
    if (w) set((s) => { s.winner = { ...w }; log(s, w.text, "win"); });
    return;
  }
  await sleep(500);
  await startTurn(set, get, nextSeat);
}

// ---------------- AI Turn ----------------
/**
 * AI 回合：反复向决策引擎索要"当前最佳行动"，直到它认为该收手。
 *
 * 相比旧实现（一串写死优先级的 if + Math.random 门槛），这里的每一步
 * 都基于实时局面重新打分，因此 AI 会随血线、手牌、对手威胁和
 * 自身阵营目标改变打法。
 */
export async function aiTurn(set: SetFn, get: GetFn, seat: number) {
  const difficulty = readDifficulty();
  // 上限保护：单回合最多 12 个动作，防止任何意外造成死循环
  for (let step = 0; step < 12; step++) {
    const state = get();
    if (state.winner) break;
    const me = state.players[seat];
    if (!me.alive) break;

    const action = chooseAction(state, seat, difficulty);
    if (action.kind === "pass") break;

    if (action.kind === "skill" && action.skillKey) {
      const ok = await useSkillInternal(set, get, seat, action.skillKey);
      // 技能被前置检查挡下时不算消耗回合，但要避免同一步重复尝试
      if (!ok) {
        set((s) => { s.players[seat].skillUses[action.skillKey!] = (s.players[seat].skillUses[action.skillKey!] ?? 0) + 1; });
      }
      await sleep(420);
      continue;
    }

    if (action.kind === "card" && action.uid) {
      const played = await playCardInternal(set, get, seat, action.uid);
      if (!played) {
        // 这张牌当前打不出（例如目标全被免疫），丢弃它以免卡死循环
        set((s) => {
          const pl = s.players[seat];
          const idx = pl.hand.findIndex((c) => c.uid === action.uid);
          if (idx >= 0) { const [c] = pl.hand.splice(idx, 1); s.discardPile.push(c); }
        });
      }
      await sleep(420);
      continue;
    }
    break;
  }
  // End play phase
  await new Promise<void>((r) => set((s) => { s.phase = "discard"; r(); }));
  await endDiscard(set, get, seat);
}

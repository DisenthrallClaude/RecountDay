import type { CardDef } from "../data/cards";
import { getCharacter } from "../data/characters";
import type { GameState, PlayerState } from "../engine/types";
import { equipAt, nextAliveSeat, seatDistance } from "../engine/utils";
import { applyDamageSync, healPlayer } from "./damage";
import {
  attackRangeOf,
  absorbStrategy,
  inAttackBand,
  minAttackDistanceOf,
  discardRandomHand,
  drawCards,
  emitCardEffect,
  ensureDeck,
  log,
  maybeDeclareWinner,
  pName,
  setAnim,
  sleep,
  skillUnlocked,
  targetableBy,
  updateMinRatio,
} from "./helpers";
import type { SetFn, GetFn } from "./helpers";
import {
  requestCardNotice,
  requestChoice,
  requestDefense,
  requestPotiResponse,
  requestTargetSeats,
  setQuellStrifeResolver,
} from "./resolvers";

/**
 * 单目标策略牌的免疫结算。
 *
 * 若目标以【正身符印】或【空白之身】吸收了这张牌，则：
 *   1. 消耗该次免疫（写入每回合计数）；
 *   2. 弃掉这张策略牌 —— 这一步是原实现漏掉的，会导致牌留在手上被反复打出；
 *   3. 记录 lastPlayedStrategyKey，让【叙事回音】仍能复制它。
 * 返回 true 表示调用方应立即 return，不再执行牌效果。
 */
function absorbStrategyAndDiscard(
  set: SetFn,
  get: GetFn,
  seat: number,
  uid: string,
  cardKey: string,
  targetSeat: number,
): boolean {
  const t = get().players[targetSeat];
  const blocked =
    (skillUnlocked(t, "blank_body") && !t.skillUses["blank_body_turn"] && !t.onceFlags["blank_body_disabled"]) ||
    (equipAt(t, "armor")?.key === "zhengshen" && !t.skillUses["zhengshen_turn"]);
  if (!blocked) return false;
  set((s) => {
    absorbStrategy(s, targetSeat);
    const pl = s.players[seat];
    const idx = pl.hand.findIndex((c) => c.uid === uid);
    if (idx >= 0) { const [c] = pl.hand.splice(idx, 1); s.discardPile.push(c); }
    s.lastPlayedStrategyKey = cardKey;
    s.lastPlayedStrategyCaster = seat;
  });
  return true;
}

// perform an attack (笔伐) from attacker to target, resolving dodge / damage
export async function performStrike(
  set: SetFn,
  get: GetFn,
  attackerSeat: number,
  targetSeat: number,
  opts: { unavoidable?: boolean; forcedDamage?: number; label?: string; ignoreBifaLimit?: boolean } = {}
) {
  const label = opts.label ?? "笔伐";
  set((s) => log(s, `${pName(s.players[attackerSeat])} 对 ${pName(s.players[targetSeat])} 使用【${label}】！`, "card"));
  await sleep(400);
  let dmg = opts.forcedDamage ?? 1;
  let ranxueBoosted = false;
  {
    const attacker = get().players[attackerSeat];
    if (!opts.forcedDamage) {
      if (equipAt(attacker, "weapon")?.key === "ranxue" && !attacker.skillUses["ranxue_turn"]) {
        dmg = 2;
        ranxueBoosted = true;
      }
      if (skillUnlocked(attacker, "ember_power") && attacker.fragments <= 2) dmg = 2;
      if (skillUnlocked(attacker, "worldly_echo") && attacker.fragments === 1) dmg = 2;
    }
  }
  // [P1-13] rumor_amp: mochao/liuyan damage +1
  // This is handled in the card effect code, but also check here for generic strikes
  let unavoidable = !!opts.unavoidable;
  // [P0-4] next_bifa_unavoidable (piercing_blade / 穿肠之刃)
  {
    const attackerCheck = get().players[attackerSeat];
    if (attackerCheck.onceFlags["next_bifa_unavoidable"]) {
      unavoidable = true;
      set((s) => {
        s.players[attackerSeat].onceFlags["next_bifa_unavoidable"] = false;
        log(s, `${pName(s.players[attackerSeat])}的【穿肠之刃】生效，本次笔伐无法被闪避！`, "skill");
      });
    }
  }

  // [P1-9] law_body: second strike auto-blocked if law_body_turn already set
  {
    const tgt = get().players[targetSeat];
    if (skillUnlocked(tgt, "law_body") && tgt.skillUses["law_body_turn"]) {
      set((s) => {
        const t = s.players[targetSeat];
        delete t.skillUses["law_body_turn"];
        log(s, `${pName(t)}的【万法不侵】生效，第二次笔伐被留白自动抵挡！`, "skill");
      });
      return;
    }
  }

  // ── 息争 ──
  // 由"被攻击者"主动把这次笔伐推给距离1以内的另一名玩家。
  {
    const tgt = get().players[targetSeat];
    const canQuell =
      skillUnlocked(tgt, "quell_strife") &&
      tgt.fragments >= 2 && // 付出 1 段后不能把自己付死
      !tgt.skillUses["quell_strife_turn"];
    if (canQuell) {
      const nearby = get().players.filter(
        (o) => o.alive && o.seat !== targetSeat && o.seat !== attackerSeat && seatDistance(tgt, o) <= 1,
      );
      if (nearby.length > 0) {
        const wantQuell = tgt.isHuman
          ? await new Promise<boolean>((resolve) => {
              setQuellStrifeResolver(resolve);
              set((s) => {
                s.pendingChoice = {
                  title: "息争",
                  desc: `你将受到${dmg}段篇幅伤害。是否消耗1段篇幅发动【息争】，将这次笔伐转移给距离1以内的另一名玩家？`,
                  yesLabel: "发动息争",
                  noLabel: "不发动",
                  resolve: () => {},
                };
              });
            })
          : tgt.fragments <= 2 && Math.random() < 0.6;
        if (wantQuell) {
          let redirect = nearby[0].seat;
          if (tgt.isHuman && nearby.length > 1) {
            const picked = await requestTargetSeats(
              set, get, "【息争】转移给谁？", "息争", nearby.map((o) => o.seat), 1, 1,
            );
            if (picked && picked.length) redirect = picked[0];
          } else if (!tgt.isHuman) {
            redirect = nearby[Math.floor(Math.random() * nearby.length)].seat;
          }
          set((s) => {
            const pl = s.players[targetSeat];
            pl.fragments -= 1;
            pl.turnSpent += 1;
            pl.skillUses["quell_strife_turn"] = 1;
            updateMinRatio(pl);
            log(s, `${pName(pl)} 发动【息争】，将这次${label}转移给${pName(s.players[redirect])}！`, "skill");
          });
          targetSeat = redirect;
        }
      }
    }
  }

  // ── 叙事壁垒预判 ──
  // 壁垒的抵消发生在 applyDamageSync 里，而防御窗口在那之前弹出，
  // 于是玩家会为一记本来就打不中的笔伐白扔一张留白。
  // 这里提前判定：若壁垒必定吃下这一击，就跳过防御窗口，直接进入结算。
  const bileiWillAbsorb = (() => {
    const t = get().players[targetSeat];
    return (
      equipAt(t, "armor")?.key === "bilei" &&
      !t.skillUses["bilei_used_turn"] &&
      label.includes("笔伐")
    );
  })();

  // ── 捕影画框 ──
  // 卡面："使用笔伐时可查看目标1张手牌"。
  // 原实现塞在"命中且目标存活"之后，被留白挡下就什么都看不到；
  // 而且结果只写进公共战报，一行小字滚过去，玩家基本感知不到 ——
  // 这就是它"看起来没生效"的原因。
  // 现在改为在防御结算之前触发（此时窥牌才有决策价值），
  // 并对人类玩家弹出专门的展示，而不是只记一行日志。
  if (label === "笔伐" || label.includes("笔伐")) {
    const atkNow = get().players[attackerSeat];
    const tgtNow = get().players[targetSeat];
    if (equipAt(atkNow, "weapon")?.key === "buying" && tgtNow.hand.length > 0) {
      const peek = tgtNow.hand[Math.floor(Math.random() * tgtNow.hand.length)];
      const victimName = getCharacter(tgtNow.characterId).name;
      set((s) => {
        // 窥牌是私密情报：公共战报里只说"窥视发生了"，不公开具体牌名，
        // 否则被窥的人反而从战报里知道了对手掌握什么。
        log(s, `${pName(s.players[attackerSeat])}的【捕影画框】窥视了${pName(s.players[targetSeat])}的手牌。`, "skill");
      });
      if (atkNow.isHuman) {
        // 只窥见 1 张，因此不写入 viewedFullHandOf —— 纸鸢社(12) 的
        // "查看全部手牌"必须靠记忆投射这类真正的透视技能达成。
        //
        // requestCardNotice(set, get, fromSeat, targetSeat, ...)：
        // fromSeat 决定弹窗里显示谁的头像。这里"出示情报的人"是被窥者，
        // 观看者是攻击者，所以 from=targetSeat、to=attackerSeat。
        await requestCardNotice(
          set, get, targetSeat, attackerSeat, peek.key, peek.name,
          `你的【捕影画框】窥见了 ${victimName} 手中的这张牌。`,
          "被你窥见的手牌",
        );
      } else {
        await sleep(260);
      }
    }
  }

  const defenseResult = bileiWillAbsorb
    ? { dodged: false, usedLiubaiPing: false, usedAnyHand: false }
    : await requestDefense(set, get, attackerSeat, targetSeat, dmg, unavoidable, label);
  const dodged = defenseResult.dodged;
  const usedLbpAny = defenseResult.usedAnyHand;

  set((s) => {
    const atk = s.players[attackerSeat];
    // 只有真正由染血墨笔加成、且命中时才消耗每回合次数。
    // 原实现在被留白挡下时照样扣次数，也会把 ember_power/worldly_echo 造成的
    // 2 段伤害误记到染血墨笔头上。
    if (!dodged && ranxueBoosted) atk.skillUses["ranxue_turn"] = 1;
    if (dodged) {
      const t = s.players[targetSeat];
      if (skillUnlocked(t, "law_body") && !t.skillUses["law_body_turn"] && !usedLbpAny) {
        t.skillUses["law_body_turn"] = 1;
        log(s, `${pName(t)} 打出【留白】，【万法不侵】生效，留白不被消耗且可再抵挡1次笔伐！`, "card");
      } else {
        if (usedLbpAny && equipAt(t, "armor")?.key === "liubaiping") {
          const discarded = discardRandomHand(s, targetSeat);
          if (discarded) {
            log(s, `${pName(t)} 凭借【留白屏障】弃置【${discarded.name}】，抵消了伤害！`, "card");
          }
        } else {
          const idx = t.hand.findIndex((c) => c.key === "liubai");
          if (idx >= 0) { const [c] = t.hand.splice(idx, 1); s.discardPile.push(c); }
          log(s, `${pName(t)} 打出【留白】，抵消了伤害！`, "card");
        }
      }
    }
  });

  if (!dodged) {
    // ── 代价转嫁 ──（宋凉）伤害落地前的最后一次改道机会
    {
      const victim = get().players[targetSeat];
      const canTransfer =
        skillUnlocked(victim, "cost_transfer") &&
        victim.fragments >= 2 &&
        !victim.skillUses["cost_transfer_turn"];
      if (canTransfer) {
        const nearby = get().players.filter(
          (o) => o.alive && o.seat !== targetSeat && seatDistance(victim, o) <= 1,
        );
        if (nearby.length > 0) {
          const want = victim.isHuman
            ? await requestChoice(set, get, targetSeat, "代价转嫁",
                `你将受到${dmg}段篇幅伤害。是否消耗1段篇幅，将这份伤害转嫁给距离1以内的另一名玩家？`,
                "转嫁", "自己承受", 0.5)
            : victim.fragments <= 2 && Math.random() < 0.65;
          if (want) {
            const redirect = nearby[Math.floor(Math.random() * nearby.length)].seat;
            set((s) => {
              const pl = s.players[targetSeat];
              pl.fragments -= 1;
              pl.turnSpent += 1;
              pl.skillUses["cost_transfer_turn"] = 1;
              updateMinRatio(pl);
              log(s, `${pName(pl)} 发动【代价转嫁】，伤害改由${pName(s.players[redirect])}承担！`, "skill");
            });
            targetSeat = redirect;
          }
        }
      }
    }
    await new Promise<void>((resolve) => {
      set((s) => {
        applyDamageSync(s, targetSeat, dmg, attackerSeat, label);
        resolve();
      });
    });

    // Post-damage effects (on hit, if target alive)
    set((s) => {
      const atk = s.players[attackerSeat];
      const tgt = s.players[targetSeat];
      if (!tgt.alive) return;
      // [P2-39] caizhi: discard one random equip from target
      if (equipAt(atk, "weapon")?.key === "caizhi") {
        const equipEntries = Object.entries(tgt.equips).filter(([, v]) => v) as [string, CardDef][];
        if (equipEntries.length) {
          const [slot, eq] = equipEntries[Math.floor(Math.random() * equipEntries.length)];
          tgt.equips[slot as keyof PlayerState["equips"]] = undefined;
          s.discardPile.push({ ...eq });
          log(s, `${pName(atk)}的【裁纸利刃】弃置了${pName(tgt)}的【${eq.name}】！`, "skill");
        }
      }
    });

    // [P1-18] echo_strike: after hitting with bifa, if attacker has echo_strike and a bifa in hand, can use another bifa
    {
      const atk = get().players[attackerSeat];
      if (skillUnlocked(atk, "echo_strike") && !atk.skillUses["echo_strike_turn"]) {
        const hasBifa = atk.hand.some((c) => c.key === "bifa");
        if (hasBifa && atk.fragments >= 1) {
          const wantEcho = await requestChoice(set, get, attackerSeat, "回响连击",
            "是否消耗1段篇幅发动【回响连击】，额外使用1张笔伐？", "发动", "不发动", 0.5);
          if (wantEcho) {
            set((s) => {
              const pl = s.players[attackerSeat];
              pl.fragments -= 1;
              pl.turnSpent += 1;
              pl.skillUses["echo_strike_turn"] = 1;
              updateMinRatio(pl);
              log(s, `${pName(pl)} 发动【回响连击】，追加笔伐！`, "skill");
            });
            const newTarget = targetSeat;
            set((s) => {
              const pl = s.players[attackerSeat];
              const bifaIdx = pl.hand.findIndex((c) => c.key === "bifa");
              if (bifaIdx >= 0) { const [c] = pl.hand.splice(bifaIdx, 1); s.discardPile.push(c); }
              pl.usedBifaThisTurn = true;
              pl.stats.usedBifaAsUser = true;
            });
            await performStrike(set, get, attackerSeat, newTarget, { label: "回响连击·笔伐" });
          }
        }
      }
    }
  }
}

// judgement flip (fengbi/chongxu)
export function flipJudgementCard(state: GameState): CardDef {
  ensureDeck(state, 1);
  const c = state.deck.shift()!;
  log(state, `判定牌翻开：${c.suit}${c.rank}【${c.name}】`, "system");
  return c;
}

// [P1-27] resolveJudgement with heaven_luck re-roll
export async function resolveJudgement(
  set: SetFn,
  get: GetFn,
  targetSeat: number,
  _cardKey: string
): Promise<CardDef> {
  let flip: CardDef;
  set((s) => {
    flip = flipJudgementCard(s);
    s.players[targetSeat].judgement.push({ ...flip, uid: flip.uid + "_j" });
  });
  flip = get().players[targetSeat].judgement[get().players[targetSeat].judgement.length - 1];
  // heaven_luck: offer re-flip once per turn
  const tgt = get().players[targetSeat];
  if (skillUnlocked(tgt, "heaven_luck") && !tgt.skillUses["heaven_luck_turn"]) {
    const wantReroll = await requestChoice(set, get, targetSeat, "天眷好运",
      "是否发动【天眷好运】重新判定？（每回合限1次）", "重新判定", "不重判", 0.5);
    if (wantReroll) {
      set((s) => {
        const pl = s.players[targetSeat];
        pl.skillUses["heaven_luck_turn"] = 1;
        const old = pl.judgement.pop();
        if (old) s.discardPile.push({ ...old, uid: old.uid.replace("_j", "") });
        const newFlip = flipJudgementCard(s);
        pl.judgement.push({ ...newFlip, uid: newFlip.uid + "_j" });
        log(s, `${pName(pl)} 发动【天眷好运】，重新判定！`, "skill");
        flip = newFlip;
      });
      flip = get().players[targetSeat].judgement[get().players[targetSeat].judgement.length - 1];
    }
  }
  return flip!;
}

/**
 * 结算判定区的一张牌。
 *
 * 这里必须区分两张不同的牌：
 *   - `judgementCard` 是放在判定区的那张牌（封笔 / 重叙），决定"发生什么"；
 *   - `flip` 是从牌堆翻开的判定牌，它的花色点数决定"是否命中"。
 *
 * 原实现只传了 `flip` 一张牌，却用它的 key 去判断是封笔还是重叙 ——
 * 翻到的几乎总是笔伐/留白之类的普通牌，于是两张判定牌在绝大多数对局里
 * 完全不生效。这是本次修复中影响最大的一处。
 */
export async function processJudgementEffect(
  set: SetFn,
  get: GetFn,
  targetSeat: number,
  judgementCard: CardDef,
  flip: CardDef,
): Promise<"remove" | "pass"> {
  if (judgementCard.key === "fengbi") {
    if (flip.suit !== "heart") {
      set((s) => {
        // expireSeat 必须是目标自己：turnFlow 在目标回合开始时清理过期标记，
        // 而 skip_play 要在紧随其后的出牌阶段被读取，因此由消费方主动删除。
        s.players[targetSeat].statusFlags["skip_play"] = { expireSeat: -1 };
        log(s, `${pName(s.players[targetSeat])}的【封笔】判定为${flip.name}（非红桃），跳过本回合书写阶段！`, "card");
      });
    } else {
      set((s) => log(s, `${pName(s.players[targetSeat])}的【封笔】判定为红桃，封笔失效！`, "card"));
    }
    return "remove";
  }

  if (judgementCard.key === "chongxu") {
    const ranks = ["2", "3", "4", "5", "6", "7", "8", "9"];
    if (flip.suit === "spade" && ranks.includes(flip.rank)) {
      set((s) => log(s, `${pName(s.players[targetSeat])}的【重叙】判定命中黑桃${flip.rank}，受到3段篇幅伤害！`, "card"));
      await new Promise<void>((r) => set((s) => { applyDamageSync(s, targetSeat, 3, null, "重叙"); r(); }));
      return "remove";
    }
    // 未命中：重叙本体继续传给下家，形成"击鼓传花"的紧张感
    const nextSeat = nextAliveSeat(get().players, targetSeat);
    if (nextSeat === targetSeat) return "remove";
    set((s) => {
      const tgt = s.players[targetSeat];
      const jidx = tgt.judgement.findIndex((jc) => jc.uid === judgementCard.uid);
      if (jidx >= 0) tgt.judgement.splice(jidx, 1);
      // 传的是【重叙】本体，不是翻开的判定牌
      s.players[nextSeat].judgement.push({ ...judgementCard });
      log(s, `${pName(s.players[targetSeat])}的【重叙】判定未中，重叙传给了${pName(s.players[nextSeat])}！`, "card");
    });
    return "pass";
  }

  return "remove";
}

// ---------------- Card Play ----------------
export async function playCardInternal(
  set: SetFn,
  get: GetFn,
  seat: number,
  uid: string
): Promise<boolean> {
  const me = get().players[seat];
  const card = me.hand.find((c) => c.uid === uid);
  if (!card) return false;
  if (get().winner) return false;
  if (seat !== get().activeSeat) return false;

  // 【天命预判】兑现：这是被预言者本回合打出的第1张牌
  {
    const prophecy = me.statusFlags["fate_prediction"];
    if (prophecy && !me.skillUses["fate_prediction_resolved"]) {
      const predictedBasic = prophecy.meta === 1;
      const actuallyBasic = card.kind === "basic";
      const hit = predictedBasic === actuallyBasic;
      const seerSeat = prophecy.expireSeat;
      set((s) => {
        const t = s.players[seat];
        t.skillUses["fate_prediction_resolved"] = 1;
        delete t.statusFlags["fate_prediction"];
        if (hit) {
          log(s, `${pName(t)} 打出【${card.name}】，正中【天命预判】所言，受到2段篇幅伤害！`, "skill");
          applyDamageSync(s, seat, 2, seerSeat >= 0 ? seerSeat : null, "天命预判");
        } else {
          log(s, `${pName(t)} 打出【${card.name}】，避开了【天命预判】。`, "skill");
        }
      });
      if (!get().players[seat].alive) return true;
    }
  }
  if (get().phase !== "play") return false;

  if (card.kind === "basic" && card.key === "bifa") {
    if (me.statusFlags["cannot_bifa"]) {
      set((s) => log(s, `${pName(s.players[seat])} 受状态限制，无法使用笔伐！`, "system"));
      return false;
    }
    if (me.usedBifaThisTurn && !me.onceFlags["ignore_bifa_limit"]) {
      set((s) => log(s, `${pName(s.players[seat])} 本回合已使用过笔伐（每回合限1次）。`, "system"));
      return false;
    }
    const rng = attackRangeOf(me);
    const minD = minAttackDistanceOf(me);
    const candidates = get().players
      .filter((p) => p.alive && p.seat !== seat && inAttackBand(me, p) && targetableBy(get(), seat, p.seat, "bifa"))
      .map((p) => p.seat);
    if (candidates.length === 0) {
      set((s) => log(s, minD > 1
        ? `${pName(s.players[seat])} 手持纯远程武器，射程 ${minD}~${rng} 内没有可笔伐的目标。`
        : `${pName(s.players[seat])} 攻击范围内没有可笔伐的目标。`, "system"));
      return false;
    }
    const rangeLabel = minD > 1 ? `${minD}~${rng}` : `${rng}`;
    const targets = await requestTargetSeats(set, get, `选择【笔伐】目标（范围${rangeLabel}）`, "笔伐", candidates, 1, 1);
    if (!targets || targets.length === 0) return false;
    const targetSeat = targets[0];
    const unav = !!me.onceFlags["next_bifa_unavoidable"];
    set((s) => {
      const pl = s.players[seat];
      const idx = pl.hand.findIndex((c) => c.uid === uid);
      if (idx >= 0) { const [c] = pl.hand.splice(idx, 1); s.discardPile.push(c); }
      pl.usedBifaThisTurn = true;
      pl.stats.usedBifaAsUser = true;
      setAnim(s);
      emitCardEffect(s, card.key, card.name, seat, [targetSeat]);
    });
    await performStrike(set, get, seat, targetSeat, { unavoidable: unav });
    return true;
  }

  if (card.kind === "basic" && card.key === "canmo") {
    set((s) => {
      const pl = s.players[seat];
      const idx = pl.hand.findIndex((c) => c.uid === uid);
      if (idx >= 0) { const [c] = pl.hand.splice(idx, 1); s.discardPile.push(c); }
      setAnim(s);
      emitCardEffect(s, card.key, card.name, seat, []);
    });
    await new Promise<void>((r) => set((s) => { healPlayer(s, seat, 1, "残墨"); r(); }));
    return true;
  }

  if (card.kind === "strategy") {
    if (me.statusFlags["cannot_strategy"]) {
      set((s) => log(s, `${pName(s.players[seat])} 受状态限制，无法使用策略牌！`, "system"));
      return false;
    }
    const blankFieldActive = get().players.some((p) => p.statusFlags["blank_field_active"]);
    if (blankFieldActive) {
      set((s) => log(s, `【空白领域】生效中，本回合无法使用策略牌！`, "system"));
      return false;
    }

    if (card.key === "poti") {
      set((s) => log(s, "【破题】是反应牌，需要在其他玩家使用策略牌时打出。", "system"));
      return false;
    }

    if (card.key === "xubi") {
      {
        const { countered } = await requestPotiResponse(set, get, seat, card.name, seat);
        if (countered) {
          set((s) => {
            const pl = s.players[seat];
            const idx = pl.hand.findIndex((c) => c.uid === uid);
            if (idx >= 0) { const [c] = pl.hand.splice(idx, 1); s.discardPile.push(c); }
            s.lastPlayedStrategyKey = card.key; s.lastPlayedStrategyCaster = seat;
          });
          return true;
        }
      }
      set((s) => {
        const pl = s.players[seat];
        const idx = pl.hand.findIndex((c) => c.uid === uid);
        if (idx >= 0) { const [c] = pl.hand.splice(idx, 1); s.discardPile.push(c); }
        setAnim(s);
        emitCardEffect(s, card.key, card.name, seat, []);
      });
      await new Promise<void>((r) => set((s) => { drawCards(s, seat, 2); log(s, `${pName(s.players[seat])} 使用【续笔】，摸2张牌。`, "card"); r(); }));
      set((s) => { s.lastPlayedStrategyKey = card.key; s.lastPlayedStrategyCaster = seat; });
      return true;
    }

    if (card.key === "pangzhu") {
      const candidates = get().players
        .filter((p) => p.alive && p.seat !== seat && targetableBy(get(), seat, p.seat, "strategy"))
        .map((p) => p.seat);
      if (candidates.length === 0) { set((s) => log(s, "没有可旁注的目标。", "system")); return false; }
      const targets = await requestTargetSeats(set, get, "选择【旁注】目标", "旁注", candidates, 1, 1);
      if (!targets) return false;
      const tgt = targets[0];
      const { countered } = await requestPotiResponse(set, get, seat, card.name, tgt);
      if (countered) {
        set((s) => {
          const pl = s.players[seat];
          const idx = pl.hand.findIndex((c) => c.uid === uid);
          if (idx >= 0) { const [c] = pl.hand.splice(idx, 1); s.discardPile.push(c); }
        });
        set((s) => { s.lastPlayedStrategyKey = card.key; s.lastPlayedStrategyCaster = seat; });
        return true;
      }
      let actualTarget = tgt;
      // 正身符印 / 空白之身吸收本次策略牌。必须同时弃掉旁注本身 ——
      // 否则牌留在手里，AI 会在同一回合反复重打，人类玩家也等于白嫖一张牌。
      if (absorbStrategyAndDiscard(set, get, seat, uid, card.key, tgt)) return true;
      // 代价转嫁已改为在 performStrike 的伤害管线中生效（见上），
      // 这里不再劫持旁注的目标 —— 那与卡面描述的"转移伤害"是两回事。
      set((s) => {
        const pl = s.players[seat];
        const idx = pl.hand.findIndex((c) => c.uid === uid);
        if (idx >= 0) { const [c] = pl.hand.splice(idx, 1); s.discardPile.push(c); }
        const t = s.players[actualTarget];
        const equipEntries = Object.entries(t.equips).filter(([, v]) => v) as [string, CardDef][];
        if (equipEntries.length) {
          const [slot, eq] = equipEntries[Math.floor(Math.random() * equipEntries.length)];
          t.equips[slot as keyof PlayerState["equips"]] = undefined;
          s.discardPile.push({ ...eq });
          log(s, `${pName(pl)} 使用【旁注】，弃置了${pName(t)}的【${eq.name}】！`, "card");
        } else if (t.judgement.length) {
          const jc = t.judgement.shift()!;
          s.discardPile.push({ ...jc, uid: jc.uid.replace("_j", "") });
          log(s, `${pName(pl)} 使用【旁注】，弃置了${pName(t)}判定区的1张牌！`, "card");
        } else {
          log(s, `${pName(pl)} 使用【旁注】，但${pName(t)}没有可弃置的装备或判定牌。`, "card");
        }
        setAnim(s);
        emitCardEffect(s, card.key, card.name, seat, [actualTarget]);
      });
      if (actualTarget === 0 && seat !== 0) {
        await requestCardNotice(set, get, seat, actualTarget, card.key, card.name, "你的一张装备牌或判定区的牌被弃置了。");
      }
      set((s) => { s.lastPlayedStrategyKey = card.key; s.lastPlayedStrategyCaster = seat; });
      return true;
    }

    if (card.key === "cuanqu") {
      const candidates = get().players.filter((p) => p.alive && p.seat !== seat && seatDistance(me, p) <= 1 && targetableBy(get(), seat, p.seat, "strategy")).map((p) => p.seat);
      if (candidates.length === 0) { set((s) => log(s, "距离1以内没有可篡取的目标。", "system")); return false; }
      const targets = await requestTargetSeats(set, get, "选择【篡取】目标（距离1）", "篡取", candidates, 1, 1);
      if (!targets) return false;
      const tgt = targets[0];
      const { countered } = await requestPotiResponse(set, get, seat, card.name, tgt);
      if (countered) {
        set((s) => { const pl = s.players[seat]; const idx = pl.hand.findIndex((c) => c.uid === uid); if (idx >= 0) { const [c] = pl.hand.splice(idx, 1); s.discardPile.push(c); } });
        set((s) => { s.lastPlayedStrategyKey = card.key; s.lastPlayedStrategyCaster = seat; });
        return true;
      }
      if (absorbStrategyAndDiscard(set, get, seat, uid, card.key, tgt)) return true;
      set((s) => {
        const pl = s.players[seat];
        const idx = pl.hand.findIndex((c) => c.uid === uid);
        if (idx >= 0) { const [c] = pl.hand.splice(idx, 1); s.discardPile.push(c); }
        const t = s.players[tgt];
        const equipEntries = Object.entries(t.equips).filter(([, v]) => v) as [string, CardDef][];
        // 有装备就按 40% 抢装备；若对方无手牌，则装备是唯一可抢的东西，必抢。
        const stealEquip = equipEntries.length > 0 && (t.hand.length === 0 || Math.random() < 0.4);
        if (stealEquip) {
          const [slot, eq] = equipEntries[Math.floor(Math.random() * equipEntries.length)];
          t.equips[slot as keyof PlayerState["equips"]] = undefined;
          pl.hand.push({ ...eq });
          pl.stats.handsOrEquipTaken += 1;
          // 注意：这里不计 equipAcquiredCount —— 牌只是进了手牌，尚未装备。
          // 真正装备时 playCardInternal 的 equip 分支会计数，否则同一件畸变物会被算两次。
          log(s, `${pName(pl)} 使用【篡取】，获得了${pName(t)}的【${eq.name}】！`, "card");
        } else if (t.hand.length) {
          const stolenIdx = Math.floor(Math.random() * t.hand.length);
          const [stolen] = t.hand.splice(stolenIdx, 1);
          pl.hand.push(stolen);
          pl.stats.handsOrEquipTaken += 1;
          log(s, `${pName(pl)} 使用【篡取】，获得了${pName(t)}的1张手牌！`, "card");
          maybeDeclareWinner(s); // 黑帆书库(7) 计数变化
        } else {
          log(s, `${pName(pl)} 使用【篡取】，但${pName(t)}没有可获取的牌。`, "card");
        }
        setAnim(s);
        emitCardEffect(s, card.key, card.name, seat, [tgt]);
      });
      if (tgt === 0 && seat !== 0) {
        await requestCardNotice(set, get, seat, tgt, card.key, card.name, "你的一张装备牌或手牌被对方获得了。");
      }
      set((s) => { s.lastPlayedStrategyKey = card.key; s.lastPlayedStrategyCaster = seat; });
      return true;
    }

    if (card.key === "fengbi") {
      const candidates = get().players.filter((p) => p.alive && p.seat !== seat && targetableBy(get(), seat, p.seat, "strategy")).map((p) => p.seat);
      if (candidates.length === 0) { set((s) => log(s, "没有可封笔的目标。", "system")); return false; }
      const targets = await requestTargetSeats(set, get, "选择【封笔】目标", "封笔", candidates, 1, 1);
      if (!targets) return false;
      const tgt = targets[0];
      const { countered } = await requestPotiResponse(set, get, seat, card.name, tgt);
      if (countered) {
        set((s) => { const pl = s.players[seat]; const idx = pl.hand.findIndex((c) => c.uid === uid); if (idx >= 0) { const [c] = pl.hand.splice(idx, 1); s.discardPile.push(c); } });
        set((s) => { s.lastPlayedStrategyKey = card.key; s.lastPlayedStrategyCaster = seat; });
        return true;
      }
      if (absorbStrategyAndDiscard(set, get, seat, uid, card.key, tgt)) return true;
      set((s) => {
        const pl = s.players[seat];
        const idx = pl.hand.findIndex((c) => c.uid === uid);
        if (idx >= 0) { const [c] = pl.hand.splice(idx, 1); s.players[tgt].judgement.push({ ...c, uid: c.uid + "_j" }); }
        log(s, `${pName(pl)} 对 ${pName(s.players[tgt])} 使用【封笔】！`, "card");
        setAnim(s);
        emitCardEffect(s, card.key, card.name, seat, [tgt]);
      });
      if (tgt === 0 && seat !== 0) {
        await requestCardNotice(set, get, seat, tgt, card.key, card.name, "【封笔】被放置于你的判定区。下回合开始时判定：若非红桃，你将跳过整个书写阶段。");
      }
      set((s) => { s.lastPlayedStrategyKey = card.key; s.lastPlayedStrategyCaster = seat; });
      return true;
    }

    if (card.key === "lunbian") {
      const candidates = get().players.filter((p) => p.alive && p.seat !== seat && targetableBy(get(), seat, p.seat, "strategy")).map((p) => p.seat);
      if (candidates.length === 0) { set((s) => log(s, "没有可论辨的目标。", "system")); return false; }
      const targets = await requestTargetSeats(set, get, "选择【论辨】目标", "论辨", candidates, 1, 1);
      if (!targets) return false;
      const tgt = targets[0];
      const { countered } = await requestPotiResponse(set, get, seat, card.name, tgt);
      if (countered) {
        set((s) => { const pl = s.players[seat]; const idx = pl.hand.findIndex((c) => c.uid === uid); if (idx >= 0) { const [c] = pl.hand.splice(idx, 1); s.discardPile.push(c); } });
        set((s) => { s.lastPlayedStrategyKey = card.key; s.lastPlayedStrategyCaster = seat; });
        return true;
      }
      if (absorbStrategyAndDiscard(set, get, seat, uid, card.key, tgt)) return true;
      set((s) => {
        const pl = s.players[seat];
        const idx = pl.hand.findIndex((c) => c.uid === uid);
        if (idx >= 0) { const [c] = pl.hand.splice(idx, 1); s.discardPile.push(c); }
        s.duelState = { a: seat, b: tgt, turn: 0, damageTarget: tgt };
        log(s, `${pName(pl)} 对 ${pName(s.players[tgt])} 发起【论辨】！`, "card");
        setAnim(s);
        emitCardEffect(s, card.key, card.name, seat, [tgt]);
      });
      while (get().duelState) {
        const ds = get().duelState!;
        const currentSeat = ds.turn % 2 === 0 ? ds.a : ds.b;
        const cur = get().players[currentSeat];
        const bifaIdx = cur.hand.findIndex((c) => c.key === "bifa");
        const hasBifa = bifaIdx >= 0;
        let canPlay: boolean;
        if (!hasBifa) {
          // 手里根本没有笔伐就别再问了。
          // 原实现照样弹窗，"打出笔伐"按钮是亮的，点下去却直接判负 ——
          // 玩家会以为是 bug。
          canPlay = false;
          if (cur.isHuman) {
            set((s) => log(s, `${pName(s.players[currentSeat])} 手中已无笔伐，论辨落败。`, "card"));
            await sleep(420);
          }
        } else if (!cur.isHuman) {
          // AI 手里有笔伐就该打。原来的 `fragments > 1` 让 1 篇幅的 AI
          // 宁可认输挨打也不出牌，等于自杀。
          canPlay = true;
        } else {
          canPlay = await requestChoice(
            set, get, currentSeat, "论辨",
            "请打出一张笔伐继续论辨，否则受到1段篇幅伤害。",
            "打出笔伐", "认输", 0.7,
          );
        }
        if (canPlay) {
          set((s) => {
            const c = s.players[currentSeat];
            const bi = c.hand.findIndex((cc) => cc.key === "bifa");
            if (bi >= 0) { const [cc] = c.hand.splice(bi, 1); s.discardPile.push(cc); }
            log(s, `${pName(c)} 打出笔伐继续论辨！`, "card");
          });
          await sleep(400);
          set((s) => { if (s.duelState) s.duelState.turn += 1; });
        } else {
          const dsCur = get().duelState!;
          const winnerSeat = currentSeat === dsCur.a ? dsCur.b : dsCur.a;
          set((s) => {
            log(s, `${pName(s.players[currentSeat])} 无法继续论辨，受到1段伤害！`, "card");
            s.duelState = null;
          });
          // 伤害来源是"赢的那一方"，不是永远的施法者 ——
          // 否则施法者自己论辨输了，还会被自己的溯时沙漏/痛苦蔓延反噬。
          await new Promise<void>((r) => set((s) => { applyDamageSync(s, currentSeat, 1, winnerSeat, "论辨"); r(); }));
          set((s) => {
            const w = s.players[winnerSeat];
            if (!w.alive) return;
            // 【胜者为王】此前只挂在王寇对决上，论辨这场同样是"对决获胜"
            if (skillUnlocked(w, "king_or_bandit")) {
              const loser = s.players[currentSeat];
              if (loser.alive && loser.hand.length > 0) {
                const [stolen] = loser.hand.splice(Math.floor(Math.random() * loser.hand.length), 1);
                w.hand.push(stolen);
                w.stats.handsOrEquipTaken += 1;
                log(s, `${pName(w)}的【胜者为王】发动，夺取了${pName(loser)}的1张手牌！`, "skill");
              } else {
                healPlayer(s, winnerSeat, 1, "胜者为王");
              }
            }
            drawCards(s, winnerSeat, 1);
            log(s, `${pName(w)} 论辨获胜，摸1张牌！`, "card");
          });
          break;
        }
      }
      set((s) => { s.lastPlayedStrategyKey = card.key; s.lastPlayedStrategyCaster = seat; });
      return true;
    }

    if (card.key === "mochao" || card.key === "liuyan") {
      // 两张群体牌的差别在于"要求打出什么牌"：
      //   墨潮   —— 须打出【笔伐】（以攻代守）
      //   流言风暴 —— 须打出【留白】（纯防御）
      // 原实现两者都要求留白，墨潮完全退化成流言风暴的复制品。
      const isMochao = card.key === "mochao";
      const cardLabel = isMochao ? "墨潮" : "流言风暴";
      const needKey = isMochao ? "bifa" : "liubai";
      const needName = isMochao ? "笔伐" : "留白";

      // 群体牌同样可以被破题反制
      {
        const { countered } = await requestPotiResponse(set, get, seat, card.name, seat);
        if (countered) {
          set((s) => {
            const pl = s.players[seat];
            const idx = pl.hand.findIndex((c) => c.uid === uid);
            if (idx >= 0) { const [c] = pl.hand.splice(idx, 1); s.discardPile.push(c); }
            s.lastPlayedStrategyKey = card.key; s.lastPlayedStrategyCaster = seat;
          });
          return true;
        }
      }

      set((s) => {
        const pl = s.players[seat];
        const idx = pl.hand.findIndex((c) => c.uid === uid);
        if (idx >= 0) { const [c] = pl.hand.splice(idx, 1); s.discardPile.push(c); }
        log(s, `${pName(pl)} 发动【${cardLabel}】！所有其他玩家须打出【${needName}】，否则受到伤害。`, "card");
        setAnim(s);
        emitCardEffect(s, card.key, card.name, seat, s.players.filter((p) => p.alive && p.seat !== seat).map((p) => p.seat));
      });

      const rumorBonus = skillUnlocked(me, "rumor_amp") && me.rank >= 3 ? 1 : 0;
      const dmg = 1 + rumorBonus;

      // 按座位号迭代，但每次都从 get() 取最新状态 ——
      // 原实现遍历的是循环开始前的快照，前一名玩家的弃牌/伤害对后续判断不可见。
      // 迷途指南针等"不能以你为策略牌目标"的效果对群体牌同样有效 ——
      // 卡面没有给 AoE 开例外。
      const order = get().players
        .filter((p) => p.alive && p.seat !== seat && targetableBy(get(), seat, p.seat, "strategy"))
        .map((p) => p.seat);
      for (const victimSeat of order) {
        const cur = get().players[victimSeat];
        if (!cur.alive || get().winner) continue;

        // 正身符印 / 空白之身可以吸收整张群体牌
        let absorbed = false;
        set((s) => { absorbed = absorbStrategy(s, victimSeat); });
        if (absorbed) { await sleep(250); continue; }

        const fresh = get().players[victimSeat];
        const hasNeeded = fresh.hand.some((c) => c.key === needKey);
        // 留白屏障只在"须打出留白"时可以顶替（弃一张手牌代替留白）
        const canUseBarrier = !isMochao && equipAt(fresh, "armor")?.key === "liubaiping" && fresh.hand.length > 0;
        const canRespond = hasNeeded || canUseBarrier;

        if (!canRespond) {
          await new Promise<void>((r) => set((s) => { applyDamageSync(s, victimSeat, dmg, seat, cardLabel); r(); }));
          await sleep(280);
          continue;
        }

        let responds: boolean;
        if (!fresh.isHuman) {
          // AI：血线越低越倾向于消耗牌保命
          responds = fresh.fragments <= 2 || Math.random() < 0.7;
        } else {
          responds = await requestChoice(
            set, get, victimSeat, cardLabel,
            `${pName(get().players[seat])} 发动【${cardLabel}】，你须打出【${needName}】，否则受到${dmg}段篇幅伤害。`,
            `打出${needName}`, `承受${dmg}段伤害`, 0.7,
          );
        }

        if (!responds) {
          await new Promise<void>((r) => set((s) => { applyDamageSync(s, victimSeat, dmg, seat, cardLabel); r(); }));
          await sleep(280);
          continue;
        }

        set((s) => {
          const t = s.players[victimSeat];
          const idx = t.hand.findIndex((c) => c.key === needKey);
          if (idx >= 0) {
            const [c] = t.hand.splice(idx, 1);
            s.discardPile.push(c);
            log(s, `${pName(t)} 打出【${needName}】，化解了${cardLabel}！`, "card");
          } else if (t.hand.length > 0) {
            const [c] = t.hand.splice(Math.floor(Math.random() * t.hand.length), 1);
            s.discardPile.push(c);
            log(s, `${pName(t)} 凭借【留白屏障】弃置【${c.name}】，化解了${cardLabel}！`, "card");
          }
        });
        await sleep(280);
      }
      set((s) => { s.lastPlayedStrategyKey = card.key; s.lastPlayedStrategyCaster = seat; });
      return true;
    }

    if (card.key === "gongxu") {
      const candidates = get().players
        .filter((p) => p.alive && p.seat !== seat && targetableBy(get(), seat, p.seat, "strategy"))
        .map((p) => p.seat);
      if (candidates.length === 0) { set((s) => log(s, "没有可共叙的对象。", "system")); return false; }
      const targets = await requestTargetSeats(set, get, "选择【共叙】目标（1名其他玩家）", "共叙", candidates, 1, 1);
      if (!targets) return false;
      const tgt = targets[0];
      const { countered } = await requestPotiResponse(set, get, seat, card.name, tgt);
      if (countered) {
        set((s) => { const pl = s.players[seat]; const idx = pl.hand.findIndex((c) => c.uid === uid); if (idx >= 0) { const [c] = pl.hand.splice(idx, 1); s.discardPile.push(c); } });
        set((s) => { s.lastPlayedStrategyKey = card.key; s.lastPlayedStrategyCaster = seat; });
        return true;
      }
      set((s) => {
        const pl = s.players[seat];
        const idx = pl.hand.findIndex((c) => c.uid === uid);
        if (idx >= 0) { const [c] = pl.hand.splice(idx, 1); s.discardPile.push(c); }
        healPlayer(s, seat, 1, "共叙");
        healPlayer(s, tgt, 1, "共叙");
        log(s, `${pName(pl)} 使用【共叙】，自己和${pName(s.players[tgt])}各恢复1段篇幅！`, "card");
        setAnim(s);
        emitCardEffect(s, card.key, card.name, seat, [tgt]);
      });
      if (tgt === 0 && seat !== 0) {
        await requestCardNotice(set, get, seat, tgt, card.key, card.name, "对方使用【共叙】，你和对方各恢复1段篇幅。");
      }
      set((s) => { s.lastPlayedStrategyKey = card.key; s.lastPlayedStrategyCaster = seat; });
      return true;
    }

    if (card.key === "jiemo") {
      // 只有"手里有笔伐、且射程内够得着某人"的玩家才值得被驱使 ——
      // 否则借墨只是白白给对方送 1 段伤害，完全背离卡面意图。
      const candidates = get().players
        .filter((p) => p.alive && p.seat !== seat && targetableBy(get(), seat, p.seat, "strategy"))
        .filter((p) => get().players.some((q) => q.alive && q.seat !== p.seat && inAttackBand(p, q)))
        .map((p) => p.seat);
      if (candidates.length === 0) { set((s) => log(s, "没有可被【借墨】驱使的玩家。", "system")); return false; }
      const forcedTargets = await requestTargetSeats(set, get, "选择被驱使的玩家", "借墨", candidates, 1, 1);
      if (!forcedTargets) return false;
      const forcedSeat = forcedTargets[0];
      // 笔伐目标必须落在被驱使者的实际射程内
      const forcedPlayer = get().players[forcedSeat];
      // 用 inAttackBand 而不是裸 seatDistance：否则持锈迹刻刀（纯远程）的玩家
      // 会被借墨逼着去打贴身目标 —— 那是他自己回合里做不到的事。
      const enemyCandidates = get().players
        .filter((p) => p.alive && p.seat !== forcedSeat && inAttackBand(forcedPlayer, p))
        .map((p) => p.seat);
      if (enemyCandidates.length === 0) { set((s) => log(s, `${pName(forcedPlayer)}的射程内没有可攻击的目标。`, "system")); return false; }
      const attackTargets = await requestTargetSeats(set, get, "选择笔伐目标（须在其射程内）", "借墨", enemyCandidates, 1, 1);
      if (!attackTargets) return false;
      const attackTgt = attackTargets[0];
      const { countered } = await requestPotiResponse(set, get, seat, card.name, forcedSeat);
      if (countered) {
        set((s) => { const pl = s.players[seat]; const idx = pl.hand.findIndex((c) => c.uid === uid); if (idx >= 0) { const [c] = pl.hand.splice(idx, 1); s.discardPile.push(c); } });
        set((s) => { s.lastPlayedStrategyKey = card.key; s.lastPlayedStrategyCaster = seat; });
        return true;
      }
      if (absorbStrategyAndDiscard(set, get, seat, uid, card.key, forcedSeat)) return true;
      set((s) => {
        const pl = s.players[seat];
        const idx = pl.hand.findIndex((c) => c.uid === uid);
        if (idx >= 0) { const [c] = pl.hand.splice(idx, 1); s.discardPile.push(c); }
        log(s, `${pName(pl)} 使用【借墨】，驱使${pName(s.players[forcedSeat])}对${pName(s.players[attackTgt])}使用笔伐！`, "card");
        setAnim(s);
        emitCardEffect(s, card.key, card.name, seat, [forcedSeat, attackTgt]);
      });
      if (forcedSeat === 0 && seat !== 0) {
        const attackTgtName = get().players[attackTgt] ? getCharacter(get().players[attackTgt].characterId).name : "目标";
        await requestCardNotice(set, get, seat, forcedSeat, card.key, card.name, `你被驱使对${attackTgtName}使用笔伐！若你有笔伐将自动打出，否则受到1段伤害。`);
      }
      {
        const forced = get().players[forcedSeat];
        const bifaIdx = forced.hand.findIndex((c) => c.key === "bifa");
        if (bifaIdx >= 0) {
          set((s) => {
            const fpl = s.players[forcedSeat];
            const bi = fpl.hand.findIndex((c) => c.key === "bifa");
            if (bi >= 0) { const [c] = fpl.hand.splice(bi, 1); s.discardPile.push(c); }
          });
          const savedUsed = get().players[forcedSeat].usedBifaThisTurn;
          set((s) => {
            s.players[forcedSeat].usedBifaThisTurn = false;
            s.players[forcedSeat].stats.usedBifaAsUser = true;
          });
          await performStrike(set, get, forcedSeat, attackTgt, { label: "借墨·笔伐" });
          set((s) => { s.players[forcedSeat].usedBifaThisTurn = savedUsed; });
        } else {
          set((s) => log(s, `${pName(s.players[forcedSeat])}没有笔伐可出，受到1段伤害！`, "card"));
          await new Promise<void>((r) => set((s) => { applyDamageSync(s, forcedSeat, 1, seat, "借墨"); r(); }));
        }
      }
      set((s) => { s.lastPlayedStrategyKey = card.key; s.lastPlayedStrategyCaster = seat; });
      return true;
    }

    if (card.key === "chongxu") {
      const candidates = get().players.filter((p) => p.alive && targetableBy(get(), seat, p.seat, "strategy")).map((p) => p.seat);
      if (candidates.length === 0) { set((s) => log(s, "没有可放置【重叙】的目标。", "system")); return false; }
      const targets = await requestTargetSeats(set, get, "选择【重叙】放置目标", "重叙", candidates, 1, 1);
      if (!targets) return false;
      const tgt = targets[0];
      {
        const { countered } = await requestPotiResponse(set, get, seat, card.name, tgt);
        if (countered) {
          set((s) => {
            const pl = s.players[seat];
            const idx = pl.hand.findIndex((c) => c.uid === uid);
            if (idx >= 0) { const [c] = pl.hand.splice(idx, 1); s.discardPile.push(c); }
            s.lastPlayedStrategyKey = card.key; s.lastPlayedStrategyCaster = seat;
          });
          return true;
        }
      }
      if (absorbStrategyAndDiscard(set, get, seat, uid, card.key, tgt)) return true;
      set((s) => {
        const pl = s.players[seat];
        const idx = pl.hand.findIndex((c) => c.uid === uid);
        if (idx >= 0) { const [c] = pl.hand.splice(idx, 1); s.players[tgt].judgement.push({ ...c, uid: c.uid + "_j" }); }
        log(s, `${pName(pl)} 使用【重叙】，放置于${pName(s.players[tgt])}的判定区！`, "card");
        setAnim(s);
        emitCardEffect(s, card.key, card.name, seat, [tgt]);
      });
      if (tgt === 0 && seat !== 0) {
        await requestCardNotice(set, get, seat, tgt, card.key, card.name, "【重叙】被放置于你的判定区。下回合判定：若为黑桃2~9，你将受到3段篇幅伤害；否则它会继续传给下家。");
      }
      set((s) => { s.lastPlayedStrategyKey = card.key; s.lastPlayedStrategyCaster = seat; });
      return true;
    }

    // unknown strategy - just discard
    set((s) => {
      const pl = s.players[seat];
      const idx = pl.hand.findIndex((c) => c.uid === uid);
      if (idx >= 0) { const [c] = pl.hand.splice(idx, 1); s.discardPile.push(c); }
      log(s, `${pName(pl)} 使用了【${card.name}】。`, "card");
    });
    set((s) => { s.lastPlayedStrategyKey = card.key; s.lastPlayedStrategyCaster = seat; });
    return true;
  }

  if (card.kind === "equip") {
    set((s) => {
      const pl = s.players[seat];
      const idx = pl.hand.findIndex((c) => c.uid === uid);
      if (idx >= 0) { const [c] = pl.hand.splice(idx, 1);
        const slot = c.equipSlot!;
        if (pl.equips[slot]) s.discardPile.push(pl.equips[slot]!);
        pl.equips[slot] = c;
        if (slot === "trinket") pl.stats.everEquippedTrinket = true;
        // 失语者同盟(19) / 乌墨海(22) 的条件是"不装备任何畸变物"，不限于饰品栏
        pl.stats.everEquippedAberration = true;
        pl.stats.equipAcquiredCount += 1;
        log(s, `${pName(pl)} 装备了【${c.name}】！`, "card");
        setAnim(s);
        emitCardEffect(s, card.key, card.name, seat, []);
        // 旧日读书会(10) 看的是"同时装备3件"，必须当场结算，
        // 否则回合内被旁注/篡取拆掉一件就白装了。
        maybeDeclareWinner(s);
      }
    });
    return true;
  }

  return false;
}

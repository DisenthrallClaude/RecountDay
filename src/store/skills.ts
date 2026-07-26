import type { CardDef } from "../data/cards";
import { CHARACTERS, getCharacter } from "../data/characters";
import type { GameState, PlayerState } from "../engine/types";
import { seatDistance } from "../engine/utils";
import { applyDamageSync, healPlayer, spendSync } from "./damage";
import { performStrike, playCardInternal } from "./cardEffects";
import {
  attackRangeOf,
  drawCards,
  ensureDeck,
  hasSkill,
  log,
  pName,
  setAnim,
  skillUnlocked,
  sleep,
  targetableBy,
  updateMinRatio,
} from "./helpers";
import type { SetFn, GetFn } from "./helpers";
import {
  requestChoice,
  requestTargetSeats,
} from "./resolvers";

/**
 * 所有"每回合限1次"的主动技能。
 * 用 Set 集中声明，避免原来散落在函数体里、漏掉几个键就变成可无限重复的隐患。
 */
const SKILL_ONCE_PER_TURN = new Set<string>([
  "anchor", "heart_lock", "purge_evil", "stop_war", "hide_edge", "edge_release",
  "retrospect", "awaken_scroll", "cut_link", "sever", "pray_luck", "fate_predict",
  "blind_sign", "fate_draw", "memory_project", "shadow_clone", "puppet", "sign_seal",
  "narrative_echo", "disguise", "steal_power", "misfortune", "curse_transfer",
  "obsession", "piercing_blade", "burnout", "seal_guard", "duel_challenge",
  "shrink_land", "sacrifice", "equal_exchange", "spread_rumor", "blank_field",
]);

/** 【红尘余波】：篇幅为1时所有技能消耗降为0 */
export function effectiveSkillCost(p: PlayerState, baseCost: number): number {
  if (baseCost <= 0) return 0;
  if (skillUnlocked(p, "worldly_echo") && p.fragments === 1) return 0;
  return baseCost;
}

/**
 * 技能前置可行性检查。返回非空字符串表示"现在用不出来"，
 * 调用方应在扣费前直接拒绝。
 */
function skillPrecheck(state: GameState, seat: number, key: string): string | null {
  const me = state.players[seat];
  const others = state.players.filter((p) => p.alive && p.seat !== seat);
  const near = others.filter((p) => seatDistance(me, p) <= 1);

  switch (key) {
    case "hide_edge":
      if (me.stored) return "已经藏有一张笔伐了。";
      if (!me.hand.some((c) => c.key === "bifa")) return "手中没有可藏的笔伐。";
      return null;
    case "edge_release":
      if (!me.stored) return "没有已藏的笔伐可以释放。";
      return null;
    case "awaken_scroll":
      if (!state.discardPile.some((c) => c.kind === "strategy")) return "弃牌堆中没有策略牌。";
      return null;
    case "narrative_echo":
      if (!state.lastPlayedStrategyKey || state.lastPlayedStrategyKey === "poti") {
        return "本回合没有可复制的策略牌。";
      }
      return null;
    case "burnout":
      if (me.fragments !== 1) return "只有篇幅为1时才能发动烬余爆发。";
      if (me.maxFragments <= 1) return "最大篇幅已无法再削减。";
      return null;
    case "steal_power": {
      const dead = state.players.filter((p) => !p.alive);
      if (dead.length === 0) return "场上还没有已淘汰的角色可供窃取。";
      return null;
    }
    case "curse_transfer":
      if (near.length === 0) return "距离1以内没有其他玩家。";
      if (!Object.keys(me.statusFlags).some((k) => NEGATIVE_FLAGS.has(k))) return "身上没有可转移的负面效果。";
      return null;
    case "puppet":
      if (near.length === 0) return "距离1以内没有可指定的玩家。";
      return null;
    case "sign_seal":
      if (!others.some((p) => p.hand.length > 0)) return "没有持有手牌的玩家可以画押。";
      return null;
    case "sacrifice":
      if (others.length === 0) return "没有可指定的玩家。";
      return null;
    case "cut_link":
      if (!others.some((p) => Object.values(p.equips).some(Boolean))) return "没有玩家装备着畸变物。";
      return null;
    case "sever":
      if (others.length < 2) return "存活玩家不足，无法裁断。";
      return null;
    case "equal_exchange":
      if (me.hand.length === 0) return "手中没有可弃置的牌。";
      return null;
    case "duel_challenge":
      if (others.length === 0) return "没有可对决的玩家。";
      return null;
    default:
      return null;
  }
}

/** 可被【厄运转移】搬走的负面状态。刻意不含 untargetable_strategy —— 那是伪装带来的增益 */
const NEGATIVE_FLAGS = new Set<string>([
  "cannot_bifa", "cannot_strategy", "cannot_skill", "skip_play", "no_regen_next",
]);

export async function useSkillInternal(
  set: SetFn,
  get: GetFn,
  seat: number,
  key: string
): Promise<boolean> {
  const me = get().players[seat];
  if (get().winner) return false;
  if (seat !== get().activeSeat) return false;
  if (get().phase !== "play") return false;
  const sk = hasSkill(me, key);
  if (!sk) return false;
  if (me.rank < sk.rankReq) return false;
  // [P1-8] cannot_skill flag (from heart_lock)
  if (me.statusFlags["cannot_skill"]) {
    set((s) => log(s, `${pName(s.players[seat])} 受状态限制，无法使用技能！`, "system"));
    return false;
  }
  // 被动 / 触发式被动 不能被主动点击。
  // 原实现只挡了"被动"，四个触发式被动（息争、流言放大、代价转嫁、回响连击）
  // 点下去会照常扣 1 段篇幅然后 break 掉什么也不做 —— 在 1 篇幅时直接把自己点死。
  if (sk.type === "被动" || sk.type === "触发式被动") {
    set((s) => log(s, `【${sk.name}】是${sk.type}，会在条件满足时自动触发，无需主动使用。`, "system"));
    return false;
  }

  // 红尘余波：篇幅为1时所有技能消耗降为0。
  // 这条被动此前完全没有实现，而 UI 却按"能用"来点亮按钮，
  // 结果玩家在 1 篇幅时点技能会被 spendSync 扣到 0 而当场出局。
  const cost = effectiveSkillCost(me, sk.cost);
  if (cost > 0 && me.fragments <= cost) {
    set((s) => log(s, `${pName(s.players[seat])} 篇幅不足，无法使用【${sk.name}】。`, "system"));
    return false;
  }

  if (SKILL_ONCE_PER_TURN.has(key) && (me.skillUses[key] ?? 0) >= 1) {
    set((s) => log(s, `${pName(s.players[seat])} 本回合已用过【${sk.name}】。`, "system"));
    return false;
  }

  const gameLimit: Record<string, number> = { burnout: 2, steal_power: 2 };
  if (gameLimit[key] && (me.gameSkillUses[key] ?? 0) >= gameLimit[key]) {
    set((s) => log(s, `${pName(s.players[seat])} 本局已用完【${sk.name}】次数。`, "system"));
    return false;
  }

  // 前置可行性检查：在扣费与计数之前判定"这个技能现在到底做不做得成事"。
  // 原实现先扣费再进 switch，任何 `return true` 的空转分支
  // （没有藏牌、弃牌堆没策略牌、没有可选目标……）都会白白吃掉
  // 篇幅、每回合次数，甚至每局限用次数。
  const blockReason = skillPrecheck(get(), seat, key);
  if (blockReason) {
    set((s) => log(s, `${pName(s.players[seat])} ${blockReason}`, "system"));
    return false;
  }

  // Mark skill usage
  set((s) => {
    s.players[seat].skillUses[key] = (s.players[seat].skillUses[key] ?? 0) + 1;
    s.players[seat].gameSkillUses[key] = (s.players[seat].gameSkillUses[key] ?? 0) + 1;
    s.players[seat].stats.usedActiveSkillEver = true;
    setAnim(s);
  });

  // Pay cost
  if (cost > 0) {
    await new Promise<void>((r) => set((s) => { spendSync(s, seat, cost, sk.name); r(); }));
    // Check if player died after spending
    if (!get().players[seat].alive) return true;
  }

  // 效果本体抽成独立函数，便于【千面窃能】以同样的语义复用
  return runSkillEffect(set, get, seat, key, sk.name);
}

/** 技能效果本体。调用方负责鉴权、扣费与次数统计。 */
async function runSkillEffect(
  set: SetFn,
  get: GetFn,
  seat: number,
  key: string,
  skillName: string,
): Promise<boolean> {
  const me = get().players[seat];
  switch (key) {
    case "anchor": { // [P1-7] 苏予·锚定: expireSeat should be target's next turn
      const candidates = get().players.filter((p) => p.alive && p.seat !== seat).map((p) => p.seat);
      const targets = await requestTargetSeats(set, get, "选择【锚定】目标", "锚定", candidates, 1, 1);
      if (!targets) return true;
      const tgt = targets[0];
      set((s) => {
        s.players[tgt].statusFlags["cannot_strategy"] = { expireSeat: seat };
        log(s, `${pName(s.players[seat])} 对${pName(s.players[tgt])}发动【锚定】，其下回合不能使用策略牌！`, "skill");
      });
      break;
    }
    case "heart_lock": { // [P1-8] 心锁: set both cannot_bifa and cannot_skill
      const candidates = get().players.filter((p) => p.alive && p.seat !== seat).map((p) => p.seat);
      const targets = await requestTargetSeats(set, get, "选择【心锁】目标", "心锁", candidates, 1, 1);
      if (!targets) return true;
      const tgt = targets[0];
      set((s) => {
        // 卡面是"不能使用笔伐 *或* 不能使用角色技能"，是二选一而非全都锁死。
        // 随机挑一个可以保留心理博弈，也避免一个1费技能直接废掉对手整个回合。
        const lockSkill = Math.random() < 0.5;
        s.players[tgt].statusFlags[lockSkill ? "cannot_skill" : "cannot_bifa"] = { expireSeat: seat };
        log(s, `${pName(s.players[seat])} 对${pName(s.players[tgt])}发动【心锁】，其下回合不能使用${lockSkill ? "角色技能" : "笔伐"}！`, "skill");
      });
      break;
    }
    case "law_body": break; // passive, handled in performStrike
    case "purge_evil": { // [P1-10] 破邪: discard all equips from target (put into discardPile)
      const candidates = get().players.filter((p) => p.alive).map((p) => p.seat);
      const targets = await requestTargetSeats(set, get, "选择【破邪】目标", "破邪", candidates, 1, 1);
      if (!targets) return true;
      const tgt = targets[0];
      set((s) => {
        const t = s.players[tgt];
        // 卡面是"失效"而非"销毁"：挂一个到施法者下回合解除的压制标记，
        // 原实现直接把畸变物推进弃牌堆，是不可逆的摧毁，远超卡面强度。
        t.statusFlags["equips_suppressed"] = { expireSeat: seat };
        const n = Object.values(t.equips).filter(Boolean).length;
        log(s, `${pName(s.players[seat])} 发动【破邪】，${pName(t)}的${n}件畸变物直到下回合前全部失效！`, "skill");
      });
      break;
    }
    case "stop_war": { // [P1-11] 止戈: cannot_bifa on target, expireSeat = caster's next turn
      const candidates = get().players.filter((p) => p.alive && p.seat !== seat).map((p) => p.seat);
      const targets = await requestTargetSeats(set, get, "选择【止戈】目标", "止戈", candidates, 1, 1);
      if (!targets) return true;
      const tgt = targets[0];
      set((s) => {
        s.players[tgt].statusFlags["cannot_bifa"] = { expireSeat: seat };
        log(s, `${pName(s.players[seat])} 对${pName(s.players[tgt])}发动【止戈】，直到施法者下回合其不能使用笔伐！`, "skill");
      });
      break;
    }
    case "quell_strife": break; // [P1-12] 触发式被动, handled in performStrike
    case "spread_rumor": {
      const candidates = get().players.filter((p) => p.alive && p.seat !== seat).map((p) => p.seat);
      const targets = await requestTargetSeats(set, get, "选择【散布流言】目标", "散布流言", candidates, 1, 1);
      if (!targets) return true;
      const tgt = targets[0];
      // Ask target to show a specific type (basic), if they don't have it take damage
      set((s) => {
        const t = s.players[tgt];
        const hasBasic = t.hand.some((c) => c.kind === "basic");
        if (!hasBasic) {
          log(s, `${pName(s.players[seat])} 发动【散布流言】，${pName(t)}没有基本牌，受到1段伤害！`, "skill");
          applyDamageSync(s, tgt, 1, seat, "散布流言");
        } else {
          // Show a random basic card
          const basics = t.hand.filter((c) => c.kind === "basic");
          const shown = basics[Math.floor(Math.random() * basics.length)];
          log(s, `${pName(s.players[seat])} 发动【散布流言】，${pName(t)}展示了【${shown.name}】。`, "skill");
        }
      });
      break;
    }
    case "rumor_amp": break; // [P1-13] passive, handled in mochao/liuyan
    case "hide_edge": {
      set((s) => {
        const pl = s.players[seat];
        const idx = pl.hand.findIndex((c) => c.key === "bifa");
        if (idx < 0) return;
        // 若已藏有一张，先把旧的退回弃牌堆 —— 原实现直接覆盖，
        // 那张牌既不在手牌也不在弃牌堆，等于凭空从牌库消失。
        if (pl.stored) s.discardPile.push(pl.stored);
        const [c] = pl.hand.splice(idx, 1);
        pl.stored = c;
        log(s, `${pName(pl)} 发动【藏锋】，暗置1张笔伐。`, "skill");
      });
      break;
    }
    case "edge_release": {
      if (!me.stored) { set((s) => log(s, "没有已藏的笔伐。", "system")); return true; }
      const candidates = get().players.filter((p) => p.alive && p.seat !== seat && seatDistance(me, p) <= attackRangeOf(me) && targetableBy(get(), seat, p.seat, "bifa")).map((p) => p.seat);
      if (candidates.length === 0) { set((s) => log(s, "没有可释放锋芒的目标。", "system")); return true; }
      const targets = await requestTargetSeats(set, get, "选择【锋芒乍现】目标", "锋芒乍现", candidates, 1, 1);
      if (!targets) return true;
      const tgt = targets[0];
      set((s) => {
        const pl = s.players[seat];
        // 释放的笔伐要正常进入弃牌堆，否则每次发动都会让牌库少一张
        if (pl.stored) s.discardPile.push(pl.stored);
        pl.stored = null;
        pl.stats.usedBifaAsUser = true;
        log(s, `${pName(pl)} 发动【锋芒乍现】，藏锋出鞘！`, "skill");
      });
      await performStrike(set, get, seat, tgt, { unavoidable: true, label: "锋芒乍现" });
      break;
    }
    case "retrospect": { // [P1-25] 回溯: show top 3 cards (do not reorder for simplicity)
      set((s) => {
        ensureDeck(s, 3);
        const top3 = s.deck.slice(0, 3);
        const names = top3.map((c) => `${c.suit}${c.rank}【${c.name}】`).join("、");
        log(s, `${pName(s.players[seat])} 发动【回溯】，查看牌堆顶3张：${names}。`, "skill");
      });
      break;
    }
    case "awaken_scroll": { // [P1-26] 唤醒古卷: random strategy from discard pile
      const strats = get().discardPile.filter((c) => c.kind === "strategy");
      if (strats.length === 0) { set((s) => log(s, "弃牌堆中没有策略牌。", "system")); return true; }
      set((s) => {
        const pl = s.players[seat];
        const avail = s.discardPile.filter((c) => c.kind === "strategy");
        if (avail.length) {
          const chosen = avail[Math.floor(Math.random() * avail.length)];
          const idx = s.discardPile.findIndex((c) => c.uid === chosen.uid);
          if (idx >= 0) s.discardPile.splice(idx, 1);
          pl.hand.push({ ...chosen, uid: chosen.uid + "_a" });
          log(s, `${pName(pl)} 发动【唤醒古卷】，获得了【${chosen.name}】！`, "skill");
        }
      });
      break;
    }
    case "cut_link": {
      const candidates = get().players.filter((p) => p.alive && p.seat !== seat).map((p) => p.seat);
      const targets = await requestTargetSeats(set, get, "选择【断联】目标", "断联", candidates, 1, 1);
      if (!targets) return true;
      const tgt = targets[0];
      set((s) => {
        const t = s.players[tgt];
        const equipEntries = Object.entries(t.equips).filter(([, v]) => v) as [string, CardDef][];
        if (equipEntries.length) {
          const [slot, eq] = equipEntries[Math.floor(Math.random() * equipEntries.length)];
          t.equips[slot as keyof PlayerState["equips"]] = undefined;
          s.discardPile.push({ ...eq });
          log(s, `${pName(s.players[seat])} 发动【断联】，弃置了${pName(t)}的【${eq.name}】！`, "skill");
        } else {
          log(s, `${pName(s.players[seat])} 发动【断联】，但${pName(t)}没有畸变物。`, "skill");
        }
        drawCards(s, seat, 1);
        log(s, `${pName(s.players[seat])} 摸1张牌。`, "card");
      });
      break;
    }
    case "sever": {
      const candidates = get().players.filter((p) => p.alive).map((p) => p.seat);
      const targets = await requestTargetSeats(set, get, "选择【裁断】的2名玩家", "裁断", candidates, 2, 2);
      if (!targets || targets.length < 2) return true;
      set((s) => {
        s.players[targets[0]].statusFlags["sever_pair"] = { expireSeat: seat, meta: targets[1] };
        s.players[targets[1]].statusFlags["sever_pair"] = { expireSeat: seat, meta: targets[0] };
        log(s, `${pName(s.players[seat])} 发动【裁断】，${pName(s.players[targets[0]])}和${pName(s.players[targets[1]])}不能互指目标！`, "skill");
      });
      break;
    }
    case "heaven_luck": break; // passive handled in resolveJudgement and draw
    case "pray_luck": {
      set((s) => {
        const pl = s.players[seat];
        drawCards(s, seat, 1);
        const top = pl.hand[pl.hand.length - 1];
        if (top && top.key === "canmo") {
          // 残墨留在手里 —— 卡面从未说过要弃掉它
          healPlayer(s, seat, 1, "祈求天眷");
          drawCards(s, seat, 1);
          log(s, `${pName(pl)} 发动【祈求天眷】，摸到残墨，额外恢复1段并再摸1张！`, "skill");
        } else {
          log(s, `${pName(pl)} 发动【祈求天眷】，摸1张牌。`, "skill");
        }
      });
      break;
    }
    case "fate_predict": {
      // 预测目标"下回合打出的第1张牌"属于哪一类。
      // 预言写进 statusFlags，由 playCardInternal 在对方真正出牌时兑现，
      // 这才是"不改变结果，只调整路径"的天命语义。
      const candidates = get().players
        .filter((p) => p.alive && p.seat !== seat && targetableBy(get(), seat, p.seat, "strategy"))
        .map((p) => p.seat);
      if (candidates.length === 0) { set((s) => log(s, "没有可预判的目标。", "system")); break; }
      const targets = await requestTargetSeats(set, get, "选择【天命预判】目标", "天命预判", candidates, 1, 1);
      if (!targets) return true;
      const tgt = targets[0];
      const guessBasic = await requestChoice(
        set, get, seat, "天命预判",
        "预测该玩家下回合打出的第1张牌是哪一类？猜中则其受到2段篇幅伤害。",
        "基本牌（笔伐/留白/残墨）", "策略牌或畸变物", 0.5,
      );
      set((s) => {
        const t = s.players[tgt];
        // meta: 1 = 预测基本牌, 0 = 预测非基本牌；expireSeat 绑定施法者，
        // 使预言在目标完整走完一个回合后才失效。
        t.statusFlags["fate_prediction"] = { expireSeat: seat, meta: guessBasic ? 1 : 0 };
        log(s, `${pName(s.players[seat])} 对${pName(t)}发动【天命预判】，预言其下回合首牌为${guessBasic ? "基本牌" : "策略牌或畸变物"}。`, "skill");
      });
      break;
    }
    case "fate_intervene": break; // passive
    case "blind_sign": { // [P1-22] 盲签: target draws a card, if bifa they must use it on nearest player next turn; other cards go to caster
      const candidates = get().players.filter((p) => p.alive && p.seat !== seat).map((p) => p.seat);
      const targets = await requestTargetSeats(set, get, "选择【盲签】目标", "盲签", candidates, 1, 1);
      if (!targets) return true;
      const tgt = targets[0];
      set((s) => {
        const pl = s.players[seat];
        const t = s.players[tgt];
        ensureDeck(s, 1);
        const c = s.deck.shift()!;
        t.stats.drawnTotal += 1;
        log(s, `${pName(pl)} 对${pName(t)}发动【盲签】，${pName(t)}摸到【${c.name}】！`, "skill");
        if (c.key === "bifa") {
          t.hand.push(c);
          t.onceFlags["blind_sign_must_bifa"] = true;
          log(s, `${pName(t)}必须在下回合对最近玩家使用笔伐！`, "skill");
        } else {
          pl.hand.push(c);
          pl.stats.handsOrEquipTaken += 1;
          log(s, `${pName(pl)}获得了这张【${c.name}】！`, "skill");
        }
      });
      break;
    }
    case "fate_draw": { // [P1-23] 命运抽签: all others draw, if basic take 1 damage
      set((s) => {
        const pl = s.players[seat];
        log(s, `${pName(pl)} 发动【命运抽签】！所有其他玩家各摸1张牌，基本牌者受1段伤害。`, "skill");
        for (const p of s.players) {
          if (!p.alive || p.seat === seat) continue;
          ensureDeck(s, 1);
          const c = s.deck.shift()!;
          p.stats.drawnTotal += 1;
          p.hand.push(c);
          log(s, `${pName(p)} 摸到【${c.name}】。`, "card");
          if (c.kind === "basic") {
            log(s, `${pName(p)}摸到基本牌，受到1段伤害！`, "skill");
            applyDamageSync(s, p.seat, 1, seat, "命运抽签");
          }
        }
      });
      break;
    }
    case "memory_project": {
      const candidates = get().players.filter((p) => p.alive && p.seat !== seat).map((p) => p.seat);
      const targets = await requestTargetSeats(set, get, "选择【记忆投射】目标", "记忆投射", candidates, 1, 1);
      if (!targets) return true;
      const tgt = targets[0];
      set((s) => {
        const t = s.players[tgt];
        const pl = s.players[seat];
        pl.stats.viewedFullHandOf.add(tgt);
        const names = t.hand.map((c) => `【${c.name}】`).join("");
        log(s, `${pName(pl)} 发动【记忆投射】，查看了${pName(t)}的手牌：${names || "（无手牌）"}。`, "skill");
      });
      break;
    }
    case "shadow_clone": { // [P1-30] shadow clone expires at owner's next turn start (cleared in clearExpiredStatus)
      set((s) => {
        s.players[seat].shadowClone = { hp: 2, expiresAfterPlayerTurnId: seat };
        log(s, `${pName(s.players[seat])} 召唤【万影分身】（2HP）！`, "skill");
      });
      break;
    }
    case "cost_transfer": break; // 触发式被动 handled in performStrike and strategy targeting
    case "puppet": { // [P1-15] puppet: target at distance 1, redirect damage until owner's next turn
      const candidates = get().players.filter((p) => p.alive && p.seat !== seat && seatDistance(me, p) <= 1).map((p) => p.seat);
      if (candidates.length === 0) { set((s) => log(s, "距离1以内没有可作为傀儡的目标。", "system")); return true; }
      const targets = await requestTargetSeats(set, get, "选择【替身傀儡】目标", "替身傀儡", candidates, 1, 1);
      if (!targets) return true;
      const tgt = targets[0];
      set((s) => {
        s.players[seat].puppetTarget = tgt;
        s.players[seat].statusFlags["puppet_active"] = { expireSeat: seat };
        log(s, `${pName(s.players[seat])} 发动【替身傀儡】，伤害将由${pName(s.players[tgt])}承担！`, "skill");
      });
      break;
    }
    case "sign_seal": { // [P1-32] keep random (simplified per spec), but log it as random
      const candidates = get().players.filter((p) => p.alive && p.seat !== seat && p.hand.length > 0).map((p) => p.seat);
      if (candidates.length === 0) { set((s) => log(s, "没有可画押的目标。", "system")); return true; }
      const targets = await requestTargetSeats(set, get, "选择【画押】目标", "画押", candidates, 1, 1);
      if (!targets) return true;
      const tgt = targets[0];
      set((s) => {
        const pl = s.players[seat];
        const t = s.players[tgt];
        if (t.hand.length > 0) {
          const idx = Math.floor(Math.random() * t.hand.length);
          const [c] = t.hand.splice(idx, 1);
          pl.hand.push(c);
          pl.stats.handsOrEquipTaken += 1;
          log(s, `${pName(pl)} 发动【画押】，随机获得了${pName(t)}的1张手牌【${c.name}】！`, "skill");
        }
      });
      break;
    }
    case "breach_penalty": break; // passive handled in poti response
    case "narrative_echo": { // [P1-17] 叙事回音: copy last strategy
      const lastKey = get().lastPlayedStrategyKey;
      if (!lastKey) { set((s) => log(s, "本回合还没有已结算的策略牌可复制。", "system")); return true; }
      // 只从弃牌堆取回原牌重打。
      // 原实现允许回退到"某个玩家手里的同名牌"作为模板，却只往手牌里 push、
      // 从不把那张牌移走，于是每次发动都凭空多出一张牌，牌库持续膨胀。
      const template = get().discardPile.find((c) => c.key === lastKey);
      if (!template) { set((s) => log(s, "弃牌堆中已无该策略牌，无法回音。", "system")); return true; }
      const echoUid = template.uid;
      set((s) => {
        const di = s.discardPile.findIndex((c) => c.uid === template.uid);
        if (di >= 0) s.discardPile.splice(di, 1);
        s.players[seat].hand.push({ ...template });
        log(s, `${pName(s.players[seat])} 发动【叙事回音】，重现上一张策略牌【${template.name}】！`, "skill");
      });
      await playCardInternal(set, get, seat, echoUid);
      break;
    }
    case "echo_strike": break; // 触发式被动 handled in performStrike
    case "disguise": {
      set((s) => {
        s.players[seat].statusFlags["untargetable_strategy"] = { expireSeat: seat };
        log(s, `${pName(s.players[seat])} 发动【伪装】，直到下回合不能被策略牌指定为目标！`, "skill");
      });
      break;
    }
    case "steal_power": {
      // 真正"变成对方"：挑一个已淘汰角色的主动技，当场以吕柒的身份施放一次。
      const deadChs = get().players.filter((p) => !p.alive);
      const deadSkills: { chId: number; sk: typeof CHARACTERS[0]["skills"][0] }[] = [];
      for (const dp of deadChs) {
        const ch = getCharacter(dp.characterId);
        for (const dsk of ch.skills) {
          // 只窃取真正能立即施放的主动技，且排除会递归回自身的窃能
          if ((dsk.type === "主动" || dsk.type === "终极") && dsk.key !== "steal_power") {
            deadSkills.push({ chId: dp.characterId, sk: dsk });
          }
        }
      }
      if (deadSkills.length === 0) {
        set((s) => log(s, "已淘汰角色没有可窃取的主动技能。", "system"));
        break;
      }
      const picked = deadSkills[Math.floor(Math.random() * deadSkills.length)];
      set((s) => {
        log(s, `${pName(s.players[seat])} 发动【千面窃能】，化身【${getCharacter(picked.chId).name}】，施放【${picked.sk.name}】！`, "skill");
      });
      await sleep(300);
      // 借用被窃技能的效果分支。绕过 useSkillInternal 的鉴权/扣费，
      // 因为千面窃能自己已经付过代价了。
      await runStolenSkill(set, get, seat, picked.sk.key);
      break;
    }
    case "misfortune": {
      const candidates = get().players.filter((p) => p.alive && p.seat !== seat).map((p) => p.seat);
      const targets = await requestTargetSeats(set, get, "选择【祸水东引】目标（受2段伤害，你受1段）", "祸水东引", candidates, 1, 1);
      if (!targets) return true;
      const tgt = targets[0];
      set((s) => {
        applyDamageSync(s, tgt, 2, seat, "祸水东引");
      });
      await new Promise<void>((r) => set((s) => { applyDamageSync(s, seat, 1, null, "祸水东引"); r(); }));
      break;
    }
    case "curse_transfer": { // [P1-31] 厄运转移: only negative flags
      const myFlags = Object.keys(me.statusFlags).filter((k) => NEGATIVE_FLAGS.has(k));
      if (myFlags.length === 0) { set((s) => log(s, "你身上没有可转移的负面效果。", "system")); return true; }
      const candidates = get().players.filter((p) => p.alive && p.seat !== seat && seatDistance(me, p) <= 1).map((p) => p.seat);
      if (candidates.length === 0) { set((s) => log(s, "距离1以内没有可转移厄运的目标。", "system")); return true; }
      const targets = await requestTargetSeats(set, get, "选择【厄运转移】目标（距离1）", "厄运转移", candidates, 1, 1);
      if (!targets) return true;
      const tgt = targets[0];
      set((s) => {
        const pl = s.players[seat];
        const t = s.players[tgt];
        // 卡面是"1个"负面效果，不是全部
        const fk = myFlags[0];
        t.statusFlags[fk] = { ...pl.statusFlags[fk] };
        delete pl.statusFlags[fk];
        log(s, `${pName(pl)} 发动【厄运转移】，将1个负面效果转移给${pName(t)}！`, "skill");
      });
      break;
    }
    case "obsession": {
      const candidates = get().players.filter((p) => p.alive && p.seat !== seat).map((p) => p.seat);
      const targets = await requestTargetSeats(set, get, "选择【执念植入】目标", "执念植入", candidates, 1, 1);
      if (!targets) return true;
      const tgt = targets[0];
      const choice = await requestChoice(set, get, seat, "执念植入", "选择禁止目标使用的牌型：", "禁止笔伐", "禁止策略", 0.5);
      set((s) => {
        if (choice) {
          s.players[tgt].statusFlags["cannot_bifa"] = { expireSeat: tgt };
        } else {
          s.players[tgt].statusFlags["cannot_strategy"] = { expireSeat: tgt };
        }
        log(s, `${pName(s.players[seat])} 对${pName(s.players[tgt])}发动【执念植入】，下回合不能使用${choice ? "笔伐" : "策略牌"}！`, "skill");
      });
      break;
    }
    case "worldly_echo": break; // passive
    case "piercing_blade": {
      set((s) => {
        s.players[seat].onceFlags["next_bifa_unavoidable"] = true;
        log(s, `${pName(s.players[seat])} 发动【穿肠之刃】，下一张笔伐无法被闪避！`, "skill");
      });
      break;
    }
    case "spreading_pain": break; // passive handled in applyDamageSync
    case "immortal_body": break; // passive
    case "seal_guard": {
      set((s) => {
        s.players[seat].statusFlags["untargetable"] = { expireSeat: seat };
        log(s, `${pName(s.players[seat])} 发动【封印自守】，直到下回合不能被任何牌指定！`, "skill");
      });
      break;
    }
    case "burnout": { // [P5-57] burnout maxFragments boundary
      // Re-read current state (me may be stale after cost payment)
      const burnoutMe = get().players[seat];
      if (burnoutMe.fragments !== 1) { set((s) => log(s, "篇幅必须为1才能发动【烬余爆发】。", "system")); return true; }
      set((s) => {
        const pl = s.players[seat];
        pl.fragments = 3;
        pl.maxFragments = Math.max(1, pl.maxFragments - 1);
        log(s, `${pName(pl)} 发动【烬余爆发】，恢复至3段篇幅，但最大篇幅-${pl.maxFragments === 0 ? 0 : 1}！`, "skill");
        updateMinRatio(pl);
      });
      break;
    }
    case "ember_power": break; // passive
    case "duel_challenge": {
      // reuse lunbian duel logic with different cost/label
      const candidates = get().players.filter((p) => p.alive && p.seat !== seat && targetableBy(get(), seat, p.seat, "strategy")).map((p) => p.seat);
      if (candidates.length === 0) { set((s) => log(s, "没有可发起对决的目标。", "system")); return true; }
      const targets = await requestTargetSeats(set, get, "选择【王寇对决】目标", "王寇对决", candidates, 1, 1);
      if (!targets) return true;
      const tgt = targets[0];
      set((s) => {
        s.duelState = { a: seat, b: tgt, turn: 0, damageTarget: tgt };
        log(s, `${pName(s.players[seat])} 对${pName(s.players[tgt])}发起【王寇对决】！`, "skill");
      });
      while (get().duelState) {
        const ds = get().duelState!;
        const curSeat = ds.turn % 2 === 0 ? ds.a : ds.b;
        const cur = get().players[curSeat];
        const bifaIdx = cur.hand.findIndex((c) => c.key === "bifa");
        let canPlay = bifaIdx >= 0 && cur.fragments > 1;
        if (cur.isHuman) {
          canPlay = await requestChoice(set, get, curSeat, "王寇对决", "打出笔伐继续，否则受1段伤害。", "打出笔伐", "放弃", 0.7);
          canPlay = canPlay && bifaIdx >= 0;
        }
        if (canPlay) {
          set((s) => {
            const c = s.players[curSeat];
            const bi = c.hand.findIndex((cc) => cc.key === "bifa");
            if (bi >= 0) { const [cc] = c.hand.splice(bi, 1); s.discardPile.push(cc); }
            log(s, `${pName(c)} 打出笔伐！`, "card");
          });
          set((s) => { if (s.duelState) s.duelState.turn += 1; });
          await sleep(300);
        } else {
          const loserSeat = curSeat;
          const dsCur = get().duelState!;
          const winnerSeat = loserSeat === dsCur.a ? dsCur.b : dsCur.a;
          set((s) => {
            log(s, `${pName(s.players[loserSeat])} 无法继续对决，受到1段伤害！`, "skill");
            s.duelState = null;
          });
          await new Promise<void>((r) => set((s) => { applyDamageSync(s, loserSeat, 1, winnerSeat, "王寇对决"); r(); }));
          set((s) => {
            const w = s.players[winnerSeat];
            if (w.alive) {
              // king_or_bandit: steal a card or heal
              if (skillUnlocked(w, "king_or_bandit")) {
                const l = s.players[loserSeat];
                if (l.alive && l.hand.length > 0) {
                  const idx = Math.floor(Math.random() * l.hand.length);
                  const [stolen] = l.hand.splice(idx, 1);
                  w.hand.push(stolen);
                  w.stats.handsOrEquipTaken += 1;
                  log(s, `${pName(w)}的【胜者为王】发动，夺取了1张手牌！`, "skill");
                } else {
                  healPlayer(s, winnerSeat, 1, "胜者为王");
                }
              }
              drawCards(s, winnerSeat, 1);
              log(s, `${pName(w)} 对决获胜，摸1张牌！`, "skill");
            }
          });
          break;
        }
      }
      break;
    }
    case "king_or_bandit": break; // passive handled in duel
    case "close_range": break; // passive
    case "shrink_land": {
      set((s) => {
        s.players[seat].tempFullRange = true;
        s.players[seat].statusFlags["shrink_land_active"] = { expireSeat: seat };
        log(s, `${pName(s.players[seat])} 发动【缩地成寸】，本回合攻击范围全场！`, "skill");
      });
      break;
    }
    case "equal_exchange": {
      // discard 1, draw 2
      set((s) => {
        const pl = s.players[seat];
        if (pl.hand.length > 0) {
          const idx = Math.floor(Math.random() * pl.hand.length);
          const [c] = pl.hand.splice(idx, 1);
          s.discardPile.push(c);
          log(s, `${pName(pl)} 发动【等价交换】，弃置【${c.name}】。`, "skill");
        }
        drawCards(s, seat, 2);
      });
      break;
    }
    case "sacrifice": {
      const candidates = get().players.filter((p) => p.alive && p.seat !== seat).map((p) => p.seat);
      const targets = await requestTargetSeats(set, get, "选择【祭祀】目标", "祭祀", candidates, 1, 1);
      if (!targets) return true;
      const tgt = targets[0];
      set((s) => {
        const t = s.players[tgt];
        if (t.hand.length > 0) {
          const idx = Math.floor(Math.random() * t.hand.length);
          const [c] = t.hand.splice(idx, 1);
          s.discardPile.push(c);
          log(s, `${pName(s.players[seat])} 发动【祭祀】，${pName(t)}弃置了【${c.name}】。`, "skill");
        } else {
          log(s, `${pName(t)}没有手牌，受到1段伤害！`, "skill");
          applyDamageSync(s, tgt, 1, seat, "祭祀");
        }
      });
      break;
    }
    case "blank_body": break; // passive handled in targetableBy
    case "blank_field": {
      set((s) => {
        const pl = s.players[seat];
        // 直到自己的下回合开始，所有笔伐对自己无效
        pl.statusFlags["immune_bifa"] = { expireSeat: seat };
        // 代价：下一轮不能再依赖【空白之身】的策略牌免疫
        pl.onceFlags["blank_body_disabled"] = true;
        log(s, `${pName(pl)} 展开【空白领域】，直到下回合开始，所有笔伐对其无效！`, "skill");
        log(s, `${pName(pl)} 因展开领域，下回合无法使用【空白之身】。`, "system");
      });
      break;
    }
    default:
      set((s) => log(s, `${pName(s.players[seat])} 使用了技能【${skillName}】。`, "skill"));
  }
  return true;
}

/**
 * 施放一个"被窃取"的技能。
 *
 * 与 useSkillInternal 的区别：不做角色归属、阶位、消耗、次数校验 ——
 * 那些代价已经由【千面窃能】本身支付过了。这里只跑效果本体，
 * 因此把 switch 的实现复用出来，而不是像原实现那样发2张牌敷衍了事。
 */
export async function runStolenSkill(
  set: SetFn,
  get: GetFn,
  seat: number,
  key: string,
): Promise<void> {
  // 临时把技能挂到施放者身上，让 hasSkill / skillUnlocked 认得它
  set((s) => { s.players[seat].onceFlags[`granted_${key}`] = true; });
  try {
    await runSkillEffect(set, get, seat, key, key);
  } finally {
    set((s) => { delete s.players[seat].onceFlags[`granted_${key}`]; });
  }
}

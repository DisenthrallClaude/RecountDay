/**
 * useGameAudio.ts
 * ============================================================================
 * 战斗音频反应层 —— 订阅结构化游戏状态并触发对应音效 / BGM。
 *
 * 为什么不复用 BattleEffects 的日志字符串解析：
 *   日志文案是给玩家看的，随时会改；用 `text.includes("摸了")` 判定事件
 *   在任何一次文案调整后都会静默失效。这里只依赖 `log.kind`、`phase`、
 *   `activeSeat`、`winner` 等结构化字段，文案怎么改都不影响音频。
 * ============================================================================
 */

import { useEffect, useRef } from "react";
import { useGameStore } from "../store/gameStore";
import { AudioManager, BGM } from "./AudioManager";

/** 每种日志类型的音效映射；未列出的类型不发声，避免噪音堆叠 */
const LOG_KIND_SFX = {
  damage: { sfx: "damage", volume: 1.0 },
  heal: { sfx: "heal", volume: 0.85 },
  skill: { sfx: "skill", volume: 0.8 },
} as const;

export function useGameAudio(enabled: boolean = true) {
  const log = useGameStore((s) => s.log);
  const phase = useGameStore((s) => s.phase);
  const activeSeat = useGameStore((s) => s.activeSeat);
  const winner = useGameStore((s) => s.winner);
  const started = useGameStore((s) => s.started);

  const lastLogId = useRef<number>(0);
  const lastTurnKey = useRef<string>("");
  const lastPhase = useRef<string>("");
  const winnerFired = useRef(false);
  const startFired = useRef(false);

  // ── 开局号角 ──
  useEffect(() => {
    if (!enabled) return;
    if (started && !startFired.current) {
      startFired.current = true;
      AudioManager.playSfx("gameStart", { volume: 0.9 });
      AudioManager.duckBgm(0.4, 2600);
    }
    if (!started) startFired.current = false;
  }, [started, enabled]);

  // ── 回合开始 / 结束 ──
  useEffect(() => {
    if (!enabled || winner) return;
    const turnKey = `${activeSeat}:${phase}`;
    if (turnKey === lastTurnKey.current) return;
    const prevPhase = lastPhase.current;
    lastTurnKey.current = turnKey;
    lastPhase.current = phase;

    if (phase === "recover" && prevPhase !== "recover") {
      // 玩家自己的回合给更重的钟声，AI 回合压低以免喧宾夺主
      AudioManager.playSfx("turnStart", { volume: activeSeat === 0 ? 0.85 : 0.45 });
    } else if (phase === "draw" && prevPhase === "recover") {
      AudioManager.playSfx("draw", { volume: activeSeat === 0 ? 0.7 : 0.4 });
    } else if (phase === "discard" && prevPhase === "play") {
      AudioManager.playSfx("turnEnd", { volume: activeSeat === 0 ? 0.6 : 0.35 });
    }
  }, [activeSeat, phase, winner, enabled]);

  // ── 日志事件音效（只认 kind，不认文案）──
  useEffect(() => {
    if (!enabled) return;
    if (log.length === 0) {
      lastLogId.current = 0;
      return;
    }
    const fresh = log.filter((l) => l.id > lastLogId.current);
    lastLogId.current = log[log.length - 1].id;
    if (fresh.length === 0) return;

    // 同一批日志里同类事件只发一次声，避免群体牌造成 4 连击
    const fired = new Set<string>();
    for (const entry of fresh) {
      const kind = entry.kind;
      if (!kind || !(kind in LOG_KIND_SFX)) continue;
      if (fired.has(kind)) continue;
      fired.add(kind);
      const map = LOG_KIND_SFX[kind as keyof typeof LOG_KIND_SFX];
      AudioManager.playSfx(map.sfx, { volume: map.volume });
    }
  }, [log, enabled]);

  // ── 终局：胜利 / 失败 BGM ──
  useEffect(() => {
    if (!enabled) return;
    if (!winner) {
      winnerFired.current = false;
      return;
    }
    if (winnerFired.current) return;
    winnerFired.current = true;

    const humanWon = winner.seats.includes(0) && !winner.surrendered;
    AudioManager.playBgm(humanWon ? BGM.victory : BGM.defeat, true);
    if (humanWon) {
      AudioManager.playSfx("win", { volume: 1.0 });
    } else {
      AudioManager.playSfx("alert", { volume: 0.6 });
    }
  }, [winner, enabled]);
}

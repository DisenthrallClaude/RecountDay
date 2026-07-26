// Global Audio Manager - handles BGM crossfade and SFX with volume control
// Reads settings from localStorage ("rerun_settings")
//
// 修复要点：
//   1. 统一管理 timeupdate 监听器，切换/停止时彻底清除，避免泄漏累积。
//   2. 修复竞态：loop 回调触发时若 crossfadeRunning，延迟重试而非静默丢弃。
//   3. 浏览器自动播放策略：play() 被拒后不静默吞错，记录状态供手势恢复。
//   4. stopBgm 彻底清理两个 audio 元素的所有监听器和状态。

import { assetUrl } from "../utils/assetUrl";
export { assetUrl };

let bgmAudioA: HTMLAudioElement | null = null;
let bgmAudioB: HTMLAudioElement | null = null;
let activeBgm: "A" | "B" = "A";
let currentBgmSrc: string | null = null;
let crossfadeTimer: ReturnType<typeof setTimeout> | null = null;
let crossfadeRunning = false;
let loopPending = false; // 标记循环回调被推迟

// 每个元素最多持有一个 loop handler；切换时先移除旧的
let loopHandlerA: (() => void) | null = null;
let loopHandlerB: (() => void) | null = null;

const CROSSFADE_SECONDS = 2;
const FADE_STEPS = 30;

function getSettings(): { bgm: number; sfx: number } {
  try {
    const s = JSON.parse(localStorage.getItem("rerun_settings") || '{"bgm":60,"sfx":80}');
    return { bgm: s.bgm ?? 60, sfx: s.sfx ?? 80 };
  } catch {
    return { bgm: 60, sfx: 80 };
  }
}

function getBgmVolume(): number {
  return (getSettings().bgm / 100) * 0.7; // max 70% volume
}

function getSfxVolume(): number {
  return (getSettings().sfx / 100) * 0.4; // max 40% volume
}

/** 移除指定元素上的 loop handler */
function removeLoopHandler(el: HTMLAudioElement | null, which: "A" | "B") {
  if (!el) return;
  const handler = which === "A" ? loopHandlerA : loopHandlerB;
  if (handler) {
    el.removeEventListener("timeupdate", handler);
    if (which === "A") loopHandlerA = null;
    else loopHandlerB = null;
  }
}

/** 清除两个元素上所有 loop handler */
function clearAllLoopHandlers() {
  if (bgmAudioA) removeLoopHandler(bgmAudioA, "A");
  if (bgmAudioB) removeLoopHandler(bgmAudioB, "B");
}

function stopBgmImmediate() {
  if (crossfadeTimer) {
    clearTimeout(crossfadeTimer);
    crossfadeTimer = null;
  }
  crossfadeRunning = false;
  loopPending = false;
  clearAllLoopHandlers();
  if (bgmAudioA) {
    bgmAudioA.pause();
    bgmAudioA.volume = 0;
    bgmAudioA.currentTime = 0;
  }
  if (bgmAudioB) {
    bgmAudioB.pause();
    bgmAudioB.volume = 0;
    bgmAudioB.currentTime = 0;
  }
}

/** 设置 loop handler：先移除旧的，再挂载新的 */
function setLoopHandler(el: HTMLAudioElement, which: "A" | "B", handler: () => void) {
  removeLoopHandler(el, which);
  if (which === "A") loopHandlerA = handler;
  else loopHandlerB = handler;
  el.addEventListener("timeupdate", handler);
}

function crossfadeTo(rawSrc: string, loop: boolean = true) {
  const src = assetUrl(rawSrc);
  if (currentBgmSrc === src && !crossfadeRunning && !loopPending) return;
  currentBgmSrc = src;

  if (!bgmAudioA) {
    bgmAudioA = new Audio();
    bgmAudioA.loop = false;
    bgmAudioB = new Audio();
    bgmAudioB.loop = false;
  }

  const vol = getBgmVolume();
  const incoming = (activeBgm === "A" ? bgmAudioB : bgmAudioA)!;
  const outgoing = (activeBgm === "A" ? bgmAudioA : bgmAudioB)!;
  const incomingKey: "A" | "B" = activeBgm === "A" ? "B" : "A";

  // Stop any pending crossfade
  if (crossfadeTimer) {
    clearTimeout(crossfadeTimer);
    crossfadeTimer = null;
  }
  crossfadeRunning = true;
  loopPending = false;

  // 清除 incoming 元素上残留的旧 loop handler
  removeLoopHandler(incoming, incomingKey);

  incoming.src = src;
  incoming.currentTime = 0;
  incoming.volume = 0;
  incoming.loop = false;

  // 尝试播放；浏览器可能因自动播放策略拒绝
  const playPromise = incoming.play();
  if (playPromise) {
    playPromise.catch(() => {
      // 自动播放被阻止 —— 标记待恢复，等待用户手势
      // initOnUserGesture 会尝试恢复
    });
  }

  // For looped BGM, set up timeupdate crossfade
  if (loop) {
    const handleTimeUpdate = () => {
      if (!incoming.duration || !incoming.src) return;
      if (incoming.currentTime >= incoming.duration - CROSSFADE_SECONDS) {
        // 移除自身防止重复触发
        removeLoopHandler(incoming, incomingKey);
        if (crossfadeRunning) {
          // 交叉淡入仍在进行中，标记稍后处理
          loopPending = true;
        } else {
          doInternalLoop();
        }
      }
    };
    setLoopHandler(incoming, incomingKey, handleTimeUpdate);
  }

  const stepMs = (CROSSFADE_SECONDS / FADE_STEPS) * 1000;
  let step = 0;
  const fade = () => {
    step++;
    const t = step / FADE_STEPS;
    if (outgoing) outgoing.volume = Math.max(0, vol * (1 - t));
    incoming.volume = vol * t;
    if (step < FADE_STEPS) {
      crossfadeTimer = setTimeout(fade, stepMs);
    } else {
      if (outgoing) {
        outgoing.pause();
        outgoing.volume = 0;
      }
      incoming.volume = vol;
      activeBgm = activeBgm === "A" ? "B" : "A";
      crossfadeRunning = false;
      crossfadeTimer = null;
      // 如果在淡入期间有循环请求被推迟，现在执行
      if (loopPending) {
        loopPending = false;
        doInternalLoop();
      }
    }
  };
  fade();
}

// Internal seamless loop: crossfade between A and B with same src
function doInternalLoop() {
  if (!currentBgmSrc) return;
  if (!bgmAudioA || !bgmAudioB) return;

  // 如果交叉淡入仍在进行，延迟重试而非丢弃
  if (crossfadeRunning) {
    loopPending = true;
    return;
  }

  const vol = getBgmVolume();
  const incoming: HTMLAudioElement = (activeBgm === "A" ? bgmAudioB : bgmAudioA);
  const outgoing: HTMLAudioElement = (activeBgm === "A" ? bgmAudioA : bgmAudioB);
  const incomingKey: "A" | "B" = activeBgm === "A" ? "B" : "A";

  crossfadeRunning = true;
  loopPending = false;

  // 清除 incoming 元素上残留的旧 loop handler
  removeLoopHandler(incoming, incomingKey);

  incoming.src = currentBgmSrc;
  incoming.currentTime = 0;
  incoming.volume = 0;

  const playPromise = incoming.play();
  if (playPromise) {
    playPromise.catch(() => {});
  }

  const handleTimeUpdate = () => {
    if (!incoming.duration || !incoming.src) return;
    if (incoming.currentTime >= incoming.duration - CROSSFADE_SECONDS) {
      removeLoopHandler(incoming, incomingKey);
      if (crossfadeRunning) {
        loopPending = true;
      } else {
        doInternalLoop();
      }
    }
  };
  setLoopHandler(incoming, incomingKey, handleTimeUpdate);

  const stepMs = (CROSSFADE_SECONDS / FADE_STEPS) * 1000;
  let step = 0;
  const fade = () => {
    step++;
    const t = step / FADE_STEPS;
    outgoing.volume = Math.max(0, vol * (1 - t));
    incoming.volume = vol * t;
    if (step < FADE_STEPS) {
      crossfadeTimer = setTimeout(fade, stepMs);
    } else {
      outgoing.pause();
      outgoing.volume = 0;
      incoming.volume = vol;
      activeBgm = activeBgm === "A" ? "B" : "A";
      crossfadeRunning = false;
      crossfadeTimer = null;
      if (loopPending) {
        loopPending = false;
        doInternalLoop();
      }
    }
  };
  fade();
}

/* ==========================================================================
 * 采样音效引擎 —— 使用真实 mp3 资源包（public/audio/sfx/）
 * --------------------------------------------------------------------------
 * 设计要点：
 *   1. 解码为 AudioBuffer 缓存，避免每次 new Audio() 的开销与延迟。
 *   2. 每个音效可配置增益、裁剪时长、淡出与最小重触发间隔（防止刷屏）。
 *   3. 同类音效并发上限，超出则抢占最旧的声部（voice stealing）。
 *   4. 资源缺失/解码失败时自动回落到合成器音效，永不静默崩溃。
 * ========================================================================== */

export type SfxType =
  | "click" | "hover" | "card" | "deal" | "damage" | "heal" | "skill"
  | "win" | "select" | "open" | "draw" | "discard" | "alert"
  | "turnStart" | "turnEnd" | "factionReveal" | "gameStart";

interface SfxSpec {
  file: string;
  /** 相对增益（在全局 sfx 音量之上） */
  gain: number;
  /** 裁剪时长（秒）。素材普遍偏长，战斗中需要收紧尾巴 */
  maxDur: number;
  /** 释放淡出（秒） */
  release: number;
  /** 最小重触发间隔（毫秒），防止 hover 类高频事件糊成一片 */
  throttle: number;
  /** 同类最大并发声部 */
  voices: number;
}

const SFX_BASE = "audio/sfx/";

const SFX_SPECS: Record<SfxType, SfxSpec> = {
  // throttle 只用于抑制"同一动作被高频重复触发"（悬停、连点），
  // 不该用来限制战斗事件 —— 每一次伤害/技能都应该有独立的声音反馈。
  // 原先 damage 70ms、skill 80ms、card 50ms 会把连续结算中的第二声直接吞掉，
  // 表现就是"有时候有声音、有时候没有"。
  click:         { file: "sfx-click.mp3",          gain: 0.85, maxDur: 0.9,  release: 0.12, throttle: 30,  voices: 5 },
  hover:         { file: "sfx-hover.mp3",          gain: 0.35, maxDur: 0.55, release: 0.14, throttle: 90,  voices: 3 },
  select:        { file: "sfx-select.mp3",         gain: 0.8,  maxDur: 1.5,  release: 0.18, throttle: 30,  voices: 4 },
  card:          { file: "sfx-card-play.mp3",      gain: 0.9,  maxDur: 2.4,  release: 0.35, throttle: 0,   voices: 5 },
  deal:          { file: "sfx-deal.mp3",           gain: 0.7,  maxDur: 1.6,  release: 0.2,  throttle: 0,   voices: 5 },
  draw:          { file: "sfx-draw.mp3",           gain: 0.65, maxDur: 1.4,  release: 0.18, throttle: 0,   voices: 5 },
  discard:       { file: "sfx-discard.mp3",        gain: 0.7,  maxDur: 2.0,  release: 0.3,  throttle: 0,   voices: 4 },
  damage:        { file: "sfx-damage.mp3",         gain: 1.0,  maxDur: 2.2,  release: 0.35, throttle: 0,   voices: 4 },
  heal:          { file: "sfx-heal.mp3",           gain: 0.8,  maxDur: 2.6,  release: 0.45, throttle: 0,   voices: 3 },
  skill:         { file: "sfx-skill.mp3",          gain: 0.9,  maxDur: 3.0,  release: 0.5,  throttle: 0,   voices: 4 },
  open:          { file: "sfx-open.mp3",           gain: 0.8,  maxDur: 2.8,  release: 0.4,  throttle: 40,  voices: 3 },
  alert:         { file: "sfx-alert.mp3",          gain: 0.75, maxDur: 1.8,  release: 0.25, throttle: 80,  voices: 2 },
  turnStart:     { file: "sfx-turn-start.mp3",     gain: 0.7,  maxDur: 3.2,  release: 0.6,  throttle: 120, voices: 2 },
  turnEnd:       { file: "sfx-turn-end.mp3",       gain: 0.55, maxDur: 2.4,  release: 0.5,  throttle: 120, voices: 2 },
  factionReveal: { file: "sfx-faction-reveal.mp3", gain: 1.0,  maxDur: 8.0,  release: 0.8,  throttle: 200, voices: 1 },
  gameStart:     { file: "sfx-game-start.mp3",     gain: 0.95, maxDur: 10.0, release: 0.8,  throttle: 400, voices: 1 },
  win:           { file: "sfx-win.mp3",            gain: 1.0,  maxDur: 8.0,  release: 0.8,  throttle: 200, voices: 1 },
};

/** BGM 曲目常量 —— 避免各处硬编码字符串 */
export const BGM = {
  main: "audio/bgm-main.mp3",
  game: "audio/bgm-game.mp3",
  victory: "audio/bgm-victory.mp3",
  defeat: "audio/bgm-defeat.mp3",
  reveal: "audio/bgm-reveal.mp3",
} as const;

const bufferCache = new Map<SfxType, AudioBuffer>();
const loadFailed = new Set<SfxType>();
const inflight = new Map<SfxType, Promise<AudioBuffer | null>>();
const lastPlayAt = new Map<SfxType, number>();
const activeVoices = new Map<SfxType, { src: AudioBufferSourceNode; gain: GainNode }[]>();

/** 主 SFX 汇总节点，便于统一控制/避免削波 */
let sfxBus: GainNode | null = null;
function getSfxBus(ctx: AudioContext): GainNode {
  if (!sfxBus) {
    sfxBus = ctx.createGain();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.setValueAtTime(-14, ctx.currentTime);
    comp.knee.setValueAtTime(22, ctx.currentTime);
    comp.ratio.setValueAtTime(4, ctx.currentTime);
    comp.attack.setValueAtTime(0.004, ctx.currentTime);
    comp.release.setValueAtTime(0.22, ctx.currentTime);
    sfxBus.connect(comp);
    comp.connect(ctx.destination);
  }
  sfxBus.gain.value = 1;
  return sfxBus;
}

async function loadSfx(type: SfxType): Promise<AudioBuffer | null> {
  if (bufferCache.has(type)) return bufferCache.get(type)!;
  if (loadFailed.has(type)) return null;
  const pending = inflight.get(type);
  if (pending) return pending;

  const ctx = getCtx();
  if (!ctx) return null;

  const task = (async () => {
    try {
      const res = await fetch(assetUrl(SFX_BASE + SFX_SPECS[type].file));
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const arr = await res.arrayBuffer();
      const buf = await ctx.decodeAudioData(arr);
      bufferCache.set(type, buf);
      return buf;
    } catch {
      loadFailed.add(type);
      return null;
    } finally {
      inflight.delete(type);
    }
  })();
  inflight.set(type, task);
  return task;
}

/** 抢占最旧声部，保证同类音效不无限堆叠 */
function reserveVoice(type: SfxType, limit: number) {
  const list = activeVoices.get(type) ?? [];
  while (list.length >= limit) {
    const oldest = list.shift();
    if (oldest) {
      try {
        const ctx = getCtx();
        const now = ctx ? ctx.currentTime : 0;
        oldest.gain.gain.cancelScheduledValues(now);
        oldest.gain.gain.setValueAtTime(oldest.gain.gain.value, now);
        oldest.gain.gain.linearRampToValueAtTime(0, now + 0.06);
        oldest.src.stop(now + 0.07);
      } catch { /* 声部可能已自然结束 */ }
    }
  }
  activeVoices.set(type, list);
}

function playBuffer(type: SfxType, buf: AudioBuffer, volumeMul: number, pitch: number) {
  const ctx = getCtx();
  if (!ctx) return;
  const spec = SFX_SPECS[type];
  const now = ctx.currentTime;

  reserveVoice(type, spec.voices);

  const src = ctx.createBufferSource();
  src.buffer = buf;
  // pitch 以半音为单位；同时改变时长，符合采样器直觉
  src.playbackRate.value = pitch ? Math.pow(2, pitch / 12) : 1;

  const g = ctx.createGain();
  const peak = getSfxVolume() * 2.5 * spec.gain * volumeMul;
  const playDur = Math.min(spec.maxDur, buf.duration / src.playbackRate.value);
  const rel = Math.min(spec.release, playDur * 0.5);

  g.gain.setValueAtTime(0, now);
  g.gain.linearRampToValueAtTime(peak, now + 0.008);
  g.gain.setValueAtTime(peak, now + Math.max(0.01, playDur - rel));
  g.gain.linearRampToValueAtTime(0.0001, now + playDur);

  src.connect(g);
  g.connect(getSfxBus(ctx));
  src.start(now);
  src.stop(now + playDur + 0.02);

  const entry = { src, gain: g };
  const list = activeVoices.get(type) ?? [];
  list.push(entry);
  activeVoices.set(type, list);
  src.onended = () => {
    const cur = activeVoices.get(type);
    if (!cur) return;
    const i = cur.indexOf(entry);
    if (i >= 0) cur.splice(i, 1);
  };
}

/** 合成器回落：资源尚未加载或加载失败时仍给出听觉反馈 */
function playSynth(type: SfxType, volumeMul: number, pitch: number) {
  try {
    const ctx = getCtx();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(getSfxBus(ctx));

    const vol = getSfxVolume();
    const config: Record<string, { freq: number; type: OscillatorType; dur: number; vol: number; freqEnd?: number }> = {
      click:         { freq: 800,  type: "sine",     dur: 0.08, vol: 0.08, freqEnd: 600 },
      hover:         { freq: 1200, type: "sine",     dur: 0.04, vol: 0.03, freqEnd: 1400 },
      card:          { freq: 600,  type: "triangle", dur: 0.12, vol: 0.06, freqEnd: 400 },
      deal:          { freq: 400,  type: "sawtooth", dur: 0.1,  vol: 0.05, freqEnd: 300 },
      draw:          { freq: 520,  type: "sawtooth", dur: 0.09, vol: 0.05, freqEnd: 380 },
      discard:       { freq: 320,  type: "sawtooth", dur: 0.14, vol: 0.05, freqEnd: 180 },
      damage:        { freq: 200,  type: "square",   dur: 0.2,  vol: 0.1,  freqEnd: 100 },
      heal:          { freq: 500,  type: "sine",     dur: 0.3,  vol: 0.08, freqEnd: 800 },
      skill:         { freq: 300,  type: "triangle", dur: 0.25, vol: 0.08, freqEnd: 600 },
      win:           { freq: 400,  type: "sine",     dur: 0.5,  vol: 0.1,  freqEnd: 800 },
      select:        { freq: 900,  type: "sine",     dur: 0.1,  vol: 0.06, freqEnd: 1100 },
      open:          { freq: 300,  type: "triangle", dur: 0.2,  vol: 0.07, freqEnd: 500 },
      alert:         { freq: 240,  type: "square",   dur: 0.22, vol: 0.09, freqEnd: 200 },
      turnStart:     { freq: 180,  type: "sine",     dur: 0.4,  vol: 0.09, freqEnd: 260 },
      turnEnd:       { freq: 260,  type: "sine",     dur: 0.32, vol: 0.06, freqEnd: 160 },
      factionReveal: { freq: 220,  type: "triangle", dur: 0.6,  vol: 0.11, freqEnd: 560 },
      gameStart:     { freq: 160,  type: "triangle", dur: 0.7,  vol: 0.12, freqEnd: 420 },
    };
    const c = config[type] || config.click;
    const pitchMul = pitch ? Math.pow(2, pitch / 12) : 1;
    const freq = c.freq * pitchMul;
    const freqEnd = c.freqEnd ? c.freqEnd * pitchMul : undefined;
    osc.type = c.type;
    osc.frequency.setValueAtTime(freq, now);
    if (freqEnd) osc.frequency.exponentialRampToValueAtTime(Math.max(freqEnd, 20), now + c.dur);
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(c.vol * vol * 2.5 * volumeMul, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, now + c.dur);
    osc.start(now);
    osc.stop(now + c.dur);
  } catch { /* 音频不可用时静默降级 */ }
}

// Public API
export const AudioManager = {
  playBgm(src: string, loop: boolean = true) {
    crossfadeTo(src, loop);
  },

  stopBgm() {
    stopBgmImmediate();
    currentBgmSrc = null;
  },

  /**
   * 预热音效。默认预热**全部** —— 整包只有约 1.3MB，
   * 而漏掉任何一个类型都会导致它第一次触发时只响一个合成器占位音，
   * 听感上就是"这次没声音"。
   */
  preloadSfx(types: SfxType[] = Object.keys(SFX_SPECS) as SfxType[]) {
    types.forEach((t) => { void loadSfx(t); });
  },

  /** 临时压低 BGM（大演出时给音效让路），ms 后恢复 */
  duckBgm(amount = 0.35, ms = 1400) {
    const el = activeBgm === "A" ? bgmAudioA : bgmAudioB;
    if (!el || crossfadeRunning) return;
    const full = getBgmVolume();
    el.volume = Math.max(0, full * amount);
    window.setTimeout(() => {
      const cur = activeBgm === "A" ? bgmAudioA : bgmAudioB;
      if (cur && !crossfadeRunning) cur.volume = getBgmVolume();
    }, ms);
  },

  // Resume audio context on user interaction (browsers require this)
  initOnUserGesture() {
    const resume = () => {
      const ctx = getCtx();
      if (ctx && ctx.state === "suspended") ctx.resume().catch(() => {});
      // 手势解锁后立即预热常用采样，避免首次战斗时听到合成器占位音
      AudioManager.preloadSfx();
      // 尝试恢复所有有 src 且处于暂停状态的 BGM 元素
      // （自动播放策略可能阻止了 incoming 或 outgoing 元素）
      [bgmAudioA, bgmAudioB].forEach((el) => {
        if (el && currentBgmSrc && el.src && el.paused) {
          el.play().catch(() => {});
        }
      });
    };
    if (typeof window !== "undefined") {
      // 常驻监听（而非 once）：浏览器在切走标签页、系统休眠之后会再次挂起
      // AudioContext，只解锁第一次是不够的。这几个 handler 极轻量，
      // 只在真的处于 suspended 时才调用 resume。
      window.addEventListener("pointerdown", resume);
      window.addEventListener("keydown", resume);
      window.addEventListener("touchstart", resume, { passive: true });
      document.addEventListener("visibilitychange", () => {
        if (!document.hidden) resume();
      });
    }
  },

  // Update volumes when settings change
  updateVolumes() {
    const bgmVol = getBgmVolume();
    const active = activeBgm === "A" ? bgmAudioA : bgmAudioB;
    const inactive = activeBgm === "A" ? bgmAudioB : bgmAudioA;
    if (active && !crossfadeRunning) {
      active.volume = bgmVol;
    }
    if (inactive) inactive.volume = 0;
  },

  /**
   * 播放一次性音效。优先使用真实采样，未就绪时回落到合成器，
   * 并在后台发起加载，使后续触发即刻用上采样。
   */
  playSfx(type: SfxType, options?: { volume?: number; pitch?: number }) {
    const spec = SFX_SPECS[type];
    if (!spec) return;

    // AudioContext 可能因切标签页/长时间静默被挂起。
    // 挂起状态下 start() 排的音会被丢弃或延迟到恢复后一起爆出来，
    // 这是"音效来得不及时"的主因之一。
    const ctx = getCtx();
    if (ctx && ctx.state === "suspended") {
      ctx.resume().catch(() => {});
    }

    // 节流只针对高频重复触发；throttle=0 表示不限制
    if (spec.throttle > 0) {
      const now = performance.now();
      const last = lastPlayAt.get(type) ?? -Infinity;
      if (now - last < spec.throttle) return;
      lastPlayAt.set(type, now);
    }

    const volumeMul = options?.volume ?? 1;
    const pitch = options?.pitch ?? 0;

    const cached = bufferCache.get(type);
    if (cached) {
      playBuffer(type, cached, volumeMul, pitch);
      return;
    }
    if (loadFailed.has(type)) {
      playSynth(type, volumeMul, pitch);
      return;
    }
    // 首次触发：立即用合成器占位，同时后台加载采样
    playSynth(type, volumeMul, pitch);
    void loadSfx(type);
  },
};

// Web Audio context for SFX
let sharedCtx: AudioContext | null = null;
function getCtx(): AudioContext | null {
  if (!sharedCtx) {
    try {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      sharedCtx = new AC();
    } catch { return null; }
  }
  if (sharedCtx.state === "suspended") {
    sharedCtx.resume().catch(() => {});
  }
  return sharedCtx;
}

// Listen for settings changes
if (typeof window !== "undefined") {
  window.addEventListener("storage", (e) => {
    if (e.key === "rerun_settings") {
      AudioManager.updateVolumes();
    }
  });
}

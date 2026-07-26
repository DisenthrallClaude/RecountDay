/**
 * CardEffectConfig.ts
 * ============================================================================
 * 可复用的卡牌特效配置系统（暗黑哥特 / 神秘学 / 羊皮纸美学）
 * ----------------------------------------------------------------------------
 * 设计原则：
 *  1. 每张卡牌通过配置定义独特演出，禁止共用同一种换色粒子。
 *  2. 每个特效必须包含完整四阶段：起势 → 爆发 → 命中 → 收束。
 *  3. 禁止出牌时弹出任何文字（特别是书法文字）—— textPopup 恒为 "none"。
 *  4. 元素表现：墨迹 / 火焰 / 金属 / 冰裂 / 风压 / 虚空 / 时间 / 光影。
 *  5. 配色系统锚定 CSS 变量（--gold / --blood / --cream / --parchment 等）。
 *  6. 提供性能降级方案（high / medium / low），供 BattleEffects / GameBoard 取用。
 * ============================================================================
 * 可直接被以下文件导入使用：
 *   import { getEffectConfig, getDuration, resolvePerfConfig } from "./CardEffectConfig";
 * ============================================================================
 */

import type { CardKind } from "../data/cards";

/* ========================================================================== *
 * 0. 调色板 —— 与 index.css 中 :root CSS 变量一一对应
 *    在内联 style 中直接使用具体 hex（粒子 / 渐变 / box-shadow 需要），
 *    同时保留 cssVar 字段以便需要 var() 写法时引用。
 * ========================================================================== */

export const PALETTE = {
  gold: "#a08030", // --gold
  goldBright: "#c8a043", // --gold-bright
  goldGlow: "#f0c862", // --gold-glow (亮金)
  goldDim: "#6a5418", // --gold-dim
  blood: "#8a2020", // --blood
  bloodBright: "#c64040", // --blood-bright (代码中惯用)
  cream: "#9c8a68", // --cream
  creamLight: "#c9b896", // --cream-light / --ink-soft
  ink: "#e8dfc8", // --ink (羊皮纸文字色 / 留白白)
  inkMute: "#8a7a5c", // --ink-mute
  parchment: "#1a1612", // --parchment (暗羊皮纸底)
  parchmentDeep: "#12100c", // --parchment-deep
  parchmentDarker: "#0a0806", // --parchment-darker
  shadow: "rgba(0,0,0,0.6)", // --shadow
  // 扩展色（卡牌专属，但仍服从暗黑羊皮纸美学）
  emerald: "#4aa070", // 残墨 / 共叙 绿墨
  emeraldDeep: "#2a6a4a",
  azure: "#4a80c0", // 论辨 守方 蓝
  azureDeep: "#2a5a90",
  violet: "#8a4aa0", // 借墨 / 重叙 紫
  violetBright: "#b070d0",
  stormGray: "#7a7a82", // 流言风暴 灰
  steel: "#b8c0c8", // 金属 冷钢
  rust: "#8a5a28", // 锈迹
  bronze: "#a07840", // 壁垒 青铜
  ravenBlack: "#1a1a22", // 渡鸦
  silver: "#d8dce0", // 指南针 / 画框 银
} as const;

/* ========================================================================== *
 * 1. 类型定义
 * ========================================================================== */

/** 效果原型族（决定整体演出气质） */
export type EffectArchetype =
  | "strike" // 攻击弹道
  | "ward" // 防御护盾
  | "restore" // 恢复汇聚
  | "counter" // 反制打断
  | "disrupt" // 干扰侵蚀
  | "theft" // 窃取牵扯
  | "augment" // 增益飞行
  | "seal" // 封印判定
  | "duel" // 决斗碰撞
  | "tide" // 群体波纹
  | "storm" // 风暴旋涡
  | "harmony" // 和谐双流
  | "puppet" // 傀儡操控
  | "timewarp" // 时间扭曲
  | "equip"; // 装备穿戴

/** 元素表现（决定粒子形态与材质） */
export type EffectElement =
  | "ink" // 墨迹
  | "flame" // 火焰
  | "metal" // 金属
  | "ice" // 冰裂
  | "wind" // 风压
  | "void" // 虚空
  | "light" // 光影
  | "shadow" // 暗影
  | "time"; // 时间

/** 粒子形态（每张牌粒子形状唯一或近唯一，禁止共用换色粒子） */
export type ParticleShape =
  | "droplet" // 墨滴
  | "ember" // 余烬
  | "shard" // 碎片
  | "snowflake" // 雪花
  | "leaf" // 羽/叶
  | "rune" // 符文
  | "spark" // 火花
  | "wisp" // 飘絮
  | "dust" // 尘埃
  | "thread" // 丝线
  | "crack" // 裂纹
  | "none"; // 无粒子（纯几何涟漪）

/** 飞行方式 */
export type FlightStyle =
  | "projectile-arc" // 弧线抛射（笔伐弹道）
  | "direct-linear" // 直线飞行
  | "spiral" // 螺旋飞行
  | "card-fly" // 卡牌飞入（续笔/装备）
  | "radial-burst" // 中心放射（群体）
  | "bidirectional" // 双向流动（共叙/论辨）
  | "puppet-strings" // 丝线牵扯（借墨）
  | "orbit" // 环绕（封印/壁垒）
  | "fold" // 空间折叠（折纸）
  | "none"; // 原地/全屏无飞行

/** 命中表现 */
export type HitPattern =
  | "splash" // 飞溅
  | "shatter" // 崩裂
  | "ripple" // 涟漪
  | "converge" // 汇聚
  | "spark" // 火花
  | "crack" // 裂纹
  | "vortex" // 旋涡
  | "seal-stamp" // 封印盖戳
  | "absorb" // 吸收吞噬
  | "none";

/** 强度等级 */
export type IntensityLevel = "subtle" | "normal" | "intense" | "extreme";

/** 性能档位 */
export type PerfTier = "high" | "medium" | "low";

/** 文字弹窗 —— 恒为 "none"，禁止出牌弹字（含书法文字） */
export type TextPopup = "none";

/** 阶段时长（ms）：起势 → 爆发 → 命中 → 收束 */
export interface PhaseTiming {
  /** 起势：蓄势/预备动作 */
  windup: number;
  /** 爆发：主体能量释放 */
  burst: number;
  /** 命中：作用于目标的瞬间反馈 */
  impact: number;
  /** 收束：余韵消散 */
  settle: number;
}

/** 飞行配置 */
export interface FlightConfig {
  style: FlightStyle;
  /** 飞行轨迹弯曲度 0=直线 1=强弧 */
  curvature: number;
  /** 飞行体尺寸 px */
  size: number;
  /** 飞行体旋转（deg/s，0=不旋转） */
  spin: number;
  /** 拖尾长度 px（0=无拖尾） */
  trailLength: number;
  /** 拖尾颜色 */
  trailColor: string;
}

/** 命中配置 */
export interface HitConfig {
  pattern: HitPattern;
  /** 命中粒子数量 */
  particleCount: number;
  /** 命中粒子颜色 */
  particleColor: string;
  /** 是否产生目标脉冲环 */
  ringPulse: boolean;
  /** 是否震颤目标 */
  targetShake: boolean;
  /** 震颤强度 px（0=不震） */
  shakeIntensity: number;
}

/** 粒子配置（每张牌独立定义，禁止共用换色） */
export interface ParticleConfig {
  shape: ParticleShape;
  /** 主色 */
  color: string;
  /** 辅色（双色粒子时使用） */
  secondaryColor: string;
  /** 数量 */
  count: number;
  /** 尺寸区间 [min, max] px */
  size: [number, number];
  /** 速度区间 [min, max] px/s */
  velocity: [number, number];
  /** 生命周期 ms */
  lifetime: number;
  /** 重力（向下加速度，0=无） */
  gravity: number;
  /** 阻力（0=无阻尼，1=快速衰减） */
  drag: number;
  /** 混合模式 */
  blendMode: "normal" | "screen" | "multiply" | "overlay" | "lighten";
  /** 是否发光 */
  glow: boolean;
  /** 发射模式 */
  emission: "burst" | "stream" | "converge" | "orbit";
}

/** 屏幕反馈 */
export interface ScreenFeedback {
  /** 屏幕震屏 */
  shake: { intensity: number; duration: number } | null;
  /** 全屏闪光 */
  flash: { color: string; opacity: number; duration: number } | null;
  /** 暗角加深 */
  vignette: { color: string; opacity: number; duration: number } | null;
  /** 推近缩放（冲击感） */
  zoom: { scale: number; duration: number } | null;
}

/** 音效配置 */
export interface SoundConfig {
  /** 复用 AudioManager.playSfx 的类型 */
  sfx: "click" | "card" | "deal" | "damage" | "heal" | "skill" | "select" | "open" | "win";
  /** 音量倍率 0~1 */
  volume: number;
  /** 音高偏移（半音，0=默认） */
  pitch: number;
  /** 是否在爆发阶段叠加第二音 */
  secondarySfx?: "click" | "card" | "deal" | "damage" | "heal" | "skill" | "select" | "open" | "win";
}

/** 性能降级方案 */
export interface PerfDegradePlan {
  /** medium 档：减少粒子、关闭部分屏幕反馈 */
  medium: Partial<EffectConfigOverrides>;
  /** low 档：极简，仅保留核心命中与一缕粒子 */
  low: Partial<EffectConfigOverrides>;
}

/** 降级时可覆盖的字段（粒子上限、屏幕反馈开关、阶段时长缩放） */
export interface EffectConfigOverrides {
  particleScale: number; // 粒子数量倍率
  screenShake: boolean;
  screenFlash: boolean;
  screenVignette: boolean;
  screenZoom: boolean;
  phaseScale: number; // 各阶段时长倍率
  glow: boolean; // 粒子发光
}

/** 完整特效配置 */
export interface EffectConfig {
  /** 卡牌 key（对应 CardDef.key） */
  key: string;
  /** 卡牌名称 */
  name: string;
  /** 卡牌类型 */
  kind: CardKind;

  /* ── 核心身份 ── */
  archetype: EffectArchetype;
  element: EffectElement;

  /* ── 配色（锚定 CSS 变量） ── */
  primaryColor: string;
  secondaryColor: string;
  glowColor: string;
  /** 关联的 CSS 变量名（用于 var() 写法场景） */
  cssVarBase: string;

  /* ── 阶段时长 ── */
  phases: PhaseTiming;

  /* ── 飞行 ── */
  flight: FlightConfig;

  /* ── 命中 ── */
  hit: HitConfig;

  /* ── 粒子（独立，禁止共用换色） ── */
  particles: ParticleConfig;

  /* ── 屏幕反馈 ── */
  screen: ScreenFeedback;

  /* ── 音效 ── */
  sound: SoundConfig;

  /* ── 强度 ── */
  intensity: IntensityLevel;

  /* ── 文字弹窗：恒 none，禁止出牌弹字 ── */
  textPopup: TextPopup;

  /* ── 性能降级 ── */
  perfDegrade: PerfDegradePlan;

  /** 独特视觉描述（人类可读，便于排错/文档） */
  visualDesc: string;
}

/* ========================================================================== *
 * 2. 阶段时长辅助
 * ========================================================================== */

/** 默认四阶段时长基线（ms） */
const DEFAULT_PHASES: PhaseTiming = {
  windup: 150, // 起势
  burst: 250, // 爆发
  impact: 200, // 命中
  settle: 300, // 收束
};

/** 快捷构造阶段时长 */
function phases(windup: number, burst: number, impact: number, settle: number): PhaseTiming {
  return { windup, burst, impact, settle };
}

/* ========================================================================== *
 * 3. 性能降级默认档位
 * ========================================================================== */

/** 默认降级方案生成器：按基础粒子数等比缩减 */
function defaultDegrade(
  baseParticleCount: number,
): PerfDegradePlan {
  return {
    medium: {
      particleScale: 0.55,
      screenShake: true,
      screenFlash: true,
      screenVignette: false,
      screenZoom: false,
      phaseScale: 0.85,
      glow: true,
    },
    low: {
      particleScale: Math.max(0.15, 4 / baseParticleCount), // 至少保留 ~4 颗
      screenShake: false,
      screenFlash: false,
      screenVignette: false,
      screenZoom: false,
      phaseScale: 0.6,
      glow: false,
    },
  };
}

/* ========================================================================== *
 * 4. 26 张卡牌的完整配置
 *    每张牌的粒子 shape + 配色 + 飞行 + 命中 均独立设计，禁止共用换色粒子。
 * ========================================================================== */

export const CARD_EFFECT_CONFIGS: Record<string, EffectConfig> = {
  /* ════════════════════════════════════════════════════════════════════
   * 基本牌
   * ════════════════════════════════════════════════════════════════════ */

  // ── 笔伐：墨迹弹道 + 红黑拖尾 ──
  bifa: {
    key: "bifa",
    name: "笔伐",
    kind: "basic",
    archetype: "strike",
    element: "ink",
    primaryColor: PALETTE.bloodBright,
    secondaryColor: PALETTE.blood,
    glowColor: "rgba(198,64,64,0.6)",
    cssVarBase: "--blood",
    phases: phases(160, 260, 200, 300),
    flight: {
      style: "projectile-arc",
      curvature: 0.35,
      size: 24,
      spin: 0,
      trailLength: 120,
      trailColor: `linear-gradient(90deg, transparent, ${PALETTE.bloodBright}, ${PALETTE.blood}, transparent)`,
    },
    hit: {
      pattern: "splash",
      particleCount: 14,
      particleColor: PALETTE.bloodBright,
      ringPulse: true,
      targetShake: true,
      shakeIntensity: 8,
    },
    particles: {
      shape: "droplet",
      color: PALETTE.bloodBright,
      secondaryColor: PALETTE.blood,
      count: 14,
      size: [4, 12],
      velocity: [40, 90],
      lifetime: 600,
      gravity: 120,
      drag: 0.2,
      blendMode: "normal",
      glow: true,
      emission: "burst",
    },
    screen: {
      shake: { intensity: 4, duration: 280 },
      flash: { color: PALETTE.bloodBright, opacity: 0.12, duration: 120 },
      vignette: { color: PALETTE.blood, opacity: 0.25, duration: 400 },
      zoom: null,
    },
    sound: { sfx: "damage", volume: 0.9, pitch: -2, secondarySfx: "card" },
    intensity: "intense",
    textPopup: "none",
    perfDegrade: defaultDegrade(14),
    visualDesc: "墨迹弹道弧线抛射，红黑双色拖尾，命中飞溅墨滴+目标脉冲环+震屏",
  },

  // ── 留白：白色护盾涟漪（无粒子，纯几何） ──
  liubai: {
    key: "liubai",
    name: "留白",
    kind: "basic",
    archetype: "ward",
    element: "light",
    primaryColor: PALETTE.ink,
    secondaryColor: "rgba(232,223,200,0.5)",
    glowColor: "rgba(240,220,170,0.4)",
    cssVarBase: "--ink",
    phases: phases(120, 280, 220, 400),
    flight: { style: "none", curvature: 0, size: 0, spin: 0, trailLength: 0, trailColor: "transparent" },
    hit: {
      pattern: "ripple",
      particleCount: 0,
      particleColor: PALETTE.ink,
      ringPulse: true,
      targetShake: false,
      shakeIntensity: 0,
    },
    particles: {
      shape: "none",
      color: PALETTE.ink,
      secondaryColor: PALETTE.creamLight,
      count: 0,
      size: [0, 0],
      velocity: [0, 0],
      lifetime: 0,
      gravity: 0,
      drag: 0,
      blendMode: "screen",
      glow: false,
      emission: "burst",
    },
    screen: {
      shake: null,
      flash: { color: PALETTE.ink, opacity: 0.08, duration: 200 },
      vignette: { color: PALETTE.ink, opacity: 0.15, duration: 500 },
      zoom: null,
    },
    sound: { sfx: "select", volume: 0.7, pitch: 4 },
    intensity: "subtle",
    textPopup: "none",
    perfDegrade: defaultDegrade(0),
    visualDesc: "三层白色护盾涟漪由内向外扩散，无粒子，留白即空无",
  },

  // ── 残墨：绿色墨滴汇聚 ──
  canmo: {
    key: "canmo",
    name: "残墨",
    kind: "basic",
    archetype: "restore",
    element: "ink",
    primaryColor: PALETTE.emerald,
    secondaryColor: PALETTE.emeraldDeep,
    glowColor: "rgba(74,160,112,0.5)",
    cssVarBase: "--gold", // 绿墨为扩展色，归入羊皮纸金系调性
    phases: phases(200, 400, 250, 450),
    flight: { style: "none", curvature: 0, size: 0, spin: 0, trailLength: 0, trailColor: "transparent" },
    hit: {
      pattern: "converge",
      particleCount: 10,
      particleColor: PALETTE.emerald,
      ringPulse: true,
      targetShake: false,
      shakeIntensity: 0,
    },
    particles: {
      shape: "droplet",
      color: PALETTE.emerald,
      secondaryColor: PALETTE.emeraldDeep,
      count: 10,
      size: [6, 10],
      velocity: [40, 70],
      lifetime: 1000,
      gravity: -60, // 向上汇聚
      drag: 0.3,
      blendMode: "screen",
      glow: true,
      emission: "converge",
    },
    screen: {
      shake: null,
      flash: { color: PALETTE.emerald, opacity: 0.06, duration: 300 },
      vignette: { color: PALETTE.emeraldDeep, opacity: 0.12, duration: 600 },
      zoom: null,
    },
    sound: { sfx: "heal", volume: 0.85, pitch: 2 },
    intensity: "normal",
    textPopup: "none",
    perfDegrade: defaultDegrade(10),
    visualDesc: "十枚绿墨滴由外向内汇聚至目标，伴随绿色脉冲光晕",
  },

  /* ════════════════════════════════════════════════════════════════════
   * 策略牌
   * ════════════════════════════════════════════════════════════════════ */

  // ── 破题：X 形金色光束 + 碎片崩裂 ──
  poti: {
    key: "poti",
    name: "破题",
    kind: "strategy",
    archetype: "counter",
    element: "light",
    primaryColor: PALETTE.goldGlow,
    secondaryColor: "#ffffff",
    glowColor: "rgba(240,200,98,0.8)",
    cssVarBase: "--gold-glow",
    phases: phases(100, 220, 200, 280),
    flight: { style: "none", curvature: 0, size: 0, spin: 0, trailLength: 0, trailColor: "transparent" },
    hit: {
      pattern: "shatter",
      particleCount: 8,
      particleColor: PALETTE.goldGlow,
      ringPulse: false,
      targetShake: true,
      shakeIntensity: 5,
    },
    particles: {
      shape: "shard",
      color: PALETTE.goldGlow,
      secondaryColor: "#ffffff",
      count: 8,
      size: [3, 6],
      velocity: [30, 50],
      lifetime: 500,
      gravity: 80,
      drag: 0.25,
      blendMode: "screen",
      glow: true,
      emission: "burst",
    },
    screen: {
      shake: { intensity: 3, duration: 200 },
      flash: { color: "#ffffff", opacity: 0.2, duration: 100 },
      vignette: null,
      zoom: { scale: 1.02, duration: 150 },
    },
    sound: { sfx: "skill", volume: 0.9, pitch: 6, secondarySfx: "click" },
    intensity: "intense",
    textPopup: "none",
    perfDegrade: defaultDegrade(8),
    visualDesc: "X 形交叉金色光束瞬间斩断，中心白光爆闪，金色碎片崩裂飞散",
  },

  // ── 旁注：边缘墨注侵蚀 + 暗琥珀墨滴 ──
  pangzhu: {
    key: "pangzhu",
    name: "旁注",
    kind: "strategy",
    archetype: "disrupt",
    element: "ink",
    primaryColor: PALETTE.goldDim,
    secondaryColor: PALETTE.parchment,
    glowColor: "rgba(106,84,24,0.5)",
    cssVarBase: "--gold-dim",
    phases: phases(180, 300, 220, 350),
    flight: { style: "direct-linear", curvature: 0, size: 16, spin: 0, trailLength: 60, trailColor: `linear-gradient(90deg, transparent, ${PALETTE.goldDim}, transparent)` },
    hit: {
      pattern: "splash",
      particleCount: 10,
      particleColor: PALETTE.goldDim,
      ringPulse: false,
      targetShake: true,
      shakeIntensity: 4,
    },
    particles: {
      shape: "droplet",
      color: PALETTE.goldDim,
      secondaryColor: PALETTE.parchment,
      count: 10,
      size: [3, 8],
      velocity: [20, 60],
      lifetime: 700,
      gravity: 100,
      drag: 0.3,
      blendMode: "multiply",
      glow: false,
      emission: "stream",
    },
    screen: {
      shake: { intensity: 2, duration: 180 },
      flash: null,
      vignette: { color: PALETTE.goldDim, opacity: 0.18, duration: 450 },
      zoom: null,
    },
    sound: { sfx: "card", volume: 0.7, pitch: -3 },
    intensity: "normal",
    textPopup: "none",
    perfDegrade: defaultDegrade(10),
    visualDesc: "暗琥珀墨注从边缘直线渗入，墨滴 multiply 叠加侵蚀目标装备区",
  },

  // ── 篡取：墨色丝线牵扯 + 吞噬 ──
  cuanqu: {
    key: "cuanqu",
    name: "篡取",
    kind: "strategy",
    archetype: "theft",
    element: "shadow",
    primaryColor: PALETTE.parchment,
    secondaryColor: PALETTE.goldDim,
    glowColor: "rgba(26,22,18,0.6)",
    cssVarBase: "--parchment",
    phases: phases(220, 350, 260, 380),
    flight: { style: "puppet-strings", curvature: 0.2, size: 2, spin: 0, trailLength: 0, trailColor: PALETTE.parchment },
    hit: {
      pattern: "absorb",
      particleCount: 12,
      particleColor: PALETTE.parchment,
      ringPulse: true,
      targetShake: true,
      shakeIntensity: 3,
    },
    particles: {
      shape: "thread",
      color: PALETTE.parchment,
      secondaryColor: PALETTE.goldDim,
      count: 12,
      size: [1, 2],
      velocity: [60, 120],
      lifetime: 800,
      gravity: 0,
      drag: 0.1,
      blendMode: "normal",
      glow: false,
      emission: "converge",
    },
    screen: {
      shake: null,
      flash: null,
      vignette: { color: PALETTE.parchmentDeep, opacity: 0.3, duration: 600 },
      zoom: { scale: 0.98, duration: 300 },
    },
    sound: { sfx: "skill", volume: 0.75, pitch: -5, secondarySfx: "deal" },
    intensity: "intense",
    textPopup: "none",
    perfDegrade: defaultDegrade(12),
    visualDesc: "墨色丝线从目标向施法者收缩牵扯，被窃之物化为暗影被吞噬",
  },

  // ── 续笔：金色卡牌飞行 + 金色火花 ──
  xubi: {
    key: "xubi",
    name: "续笔",
    kind: "strategy",
    archetype: "augment",
    element: "light",
    primaryColor: PALETTE.goldGlow,
    secondaryColor: PALETTE.goldBright,
    glowColor: "rgba(240,200,98,0.6)",
    cssVarBase: "--gold-glow",
    phases: phases(150, 300, 200, 350),
    flight: { style: "card-fly", curvature: 0.1, size: 48, spin: 360, trailLength: 80, trailColor: `linear-gradient(90deg, transparent, ${PALETTE.goldGlow}, transparent)` },
    hit: {
      pattern: "spark",
      particleCount: 6,
      particleColor: PALETTE.goldGlow,
      ringPulse: true,
      targetShake: false,
      shakeIntensity: 0,
    },
    particles: {
      shape: "spark",
      color: PALETTE.goldGlow,
      secondaryColor: PALETTE.goldBright,
      count: 6,
      size: [2, 5],
      velocity: [30, 70],
      lifetime: 500,
      gravity: -40,
      drag: 0.2,
      blendMode: "screen",
      glow: true,
      emission: "stream",
    },
    screen: {
      shake: null,
      flash: { color: PALETTE.goldGlow, opacity: 0.1, duration: 200 },
      vignette: { color: PALETTE.gold, opacity: 0.12, duration: 500 },
      zoom: null,
    },
    sound: { sfx: "deal", volume: 0.8, pitch: 3, secondarySfx: "select" },
    intensity: "normal",
    textPopup: "none",
    perfDegrade: defaultDegrade(6),
    visualDesc: "金色卡牌自牌堆旋转飞向施法者，拖金尾，落地溅起金色火花",
  },

  // ── 封笔：封印符文环绕 + 锁链光环 ──
  fengbi: {
    key: "fengbi",
    name: "封笔",
    kind: "strategy",
    archetype: "seal",
    element: "void",
    primaryColor: PALETTE.gold,
    secondaryColor: PALETTE.goldDim,
    glowColor: "rgba(160,128,48,0.6)",
    cssVarBase: "--gold",
    phases: phases(250, 400, 300, 450),
    flight: { style: "orbit", curvature: 1, size: 8, spin: 720, trailLength: 0, trailColor: PALETTE.gold },
    hit: {
      pattern: "seal-stamp",
      particleCount: 8,
      particleColor: PALETTE.gold,
      ringPulse: true,
      targetShake: true,
      shakeIntensity: 4,
    },
    particles: {
      shape: "rune",
      color: PALETTE.gold,
      secondaryColor: PALETTE.goldDim,
      count: 8,
      size: [6, 10],
      velocity: [10, 30],
      lifetime: 900,
      gravity: 0,
      drag: 0.5,
      blendMode: "screen",
      glow: true,
      emission: "orbit",
    },
    screen: {
      shake: null,
      flash: { color: PALETTE.gold, opacity: 0.08, duration: 250 },
      vignette: { color: PALETTE.parchmentDeep, opacity: 0.35, duration: 700 },
      zoom: { scale: 0.97, duration: 350 },
    },
    sound: { sfx: "skill", volume: 0.8, pitch: -2, secondarySfx: "open" },
    intensity: "intense",
    textPopup: "none",
    perfDegrade: defaultDegrade(8),
    visualDesc: "金色封印符文环绕目标旋转收紧，最终盖戳封禁，暗角加深",
  },

  // ── 论辨：双方光束碰撞 + 火花飞溅 ──
  lunbian: {
    key: "lunbian",
    name: "论辨",
    kind: "strategy",
    archetype: "duel",
    element: "light",
    primaryColor: PALETTE.bloodBright,
    secondaryColor: PALETTE.azure,
    glowColor: "rgba(240,200,98,0.8)",
    cssVarBase: "--blood",
    phases: phases(180, 300, 280, 350),
    flight: { style: "bidirectional", curvature: 0, size: 6, spin: 0, trailLength: 0, trailColor: `linear-gradient(90deg, ${PALETTE.bloodBright}, ${PALETTE.azure})` },
    hit: {
      pattern: "spark",
      particleCount: 12,
      particleColor: PALETTE.goldGlow,
      ringPulse: true,
      targetShake: true,
      shakeIntensity: 6,
    },
    particles: {
      shape: "spark",
      color: PALETTE.goldGlow,
      secondaryColor: "#ffffff",
      count: 12,
      size: [3, 6],
      velocity: [30, 70],
      lifetime: 500,
      gravity: 60,
      drag: 0.2,
      blendMode: "screen",
      glow: true,
      emission: "burst",
    },
    screen: {
      shake: { intensity: 5, duration: 250 },
      flash: { color: "#ffffff", opacity: 0.18, duration: 120 },
      vignette: { color: PALETTE.blood, opacity: 0.2, duration: 400 },
      zoom: { scale: 1.03, duration: 200 },
    },
    sound: { sfx: "skill", volume: 0.95, pitch: 1, secondarySfx: "damage" },
    intensity: "extreme",
    textPopup: "none",
    perfDegrade: defaultDegrade(12),
    visualDesc: "红蓝双光束从双方射向中点碰撞，白金爆闪，火花向四周飞溅",
  },

  // ── 墨潮：暗色波纹扩散 + 黑暗侵蚀飘絮 ──
  mochao: {
    key: "mochao",
    name: "墨潮",
    kind: "strategy",
    archetype: "tide",
    element: "shadow",
    primaryColor: "#4a1010",
    secondaryColor: PALETTE.blood,
    glowColor: "rgba(138,32,32,0.4)",
    cssVarBase: "--blood",
    phases: phases(200, 500, 350, 600),
    flight: { style: "radial-burst", curvature: 0, size: 0, spin: 0, trailLength: 0, trailColor: "transparent" },
    hit: {
      pattern: "ripple",
      particleCount: 16,
      particleColor: PALETTE.blood,
      ringPulse: true,
      targetShake: true,
      shakeIntensity: 5,
    },
    particles: {
      shape: "wisp",
      color: PALETTE.blood,
      secondaryColor: "#4a1010",
      count: 16,
      size: [8, 16],
      velocity: [20, 50],
      lifetime: 1200,
      gravity: -20,
      drag: 0.4,
      blendMode: "multiply",
      glow: false,
      emission: "burst",
    },
    screen: {
      shake: { intensity: 3, duration: 400 },
      flash: { color: "#4a1010", opacity: 0.15, duration: 300 },
      vignette: { color: "#2a0808", opacity: 0.5, duration: 1000 },
      zoom: { scale: 0.96, duration: 500 },
    },
    sound: { sfx: "damage", volume: 0.9, pitch: -6, secondarySfx: "skill" },
    intensity: "extreme",
    textPopup: "none",
    perfDegrade: defaultDegrade(16),
    visualDesc: "暗红墨色波纹自施法者层层扩散席卷全场，黑暗侵蚀飘絮弥漫，全屏暗角加深",
  },

  // ── 流言风暴：风暴旋涡 + 灰色碎片 ──
  liuyan: {
    key: "liuyan",
    name: "流言风暴",
    kind: "strategy",
    archetype: "storm",
    element: "wind",
    primaryColor: PALETTE.stormGray,
    secondaryColor: "#3a3a42",
    glowColor: "rgba(122,122,130,0.5)",
    cssVarBase: "--cream",
    phases: phases(220, 480, 320, 550),
    flight: { style: "spiral", curvature: 1, size: 4, spin: 1080, trailLength: 40, trailColor: `linear-gradient(90deg, transparent, ${PALETTE.stormGray}, transparent)` },
    hit: {
      pattern: "vortex",
      particleCount: 18,
      particleColor: PALETTE.stormGray,
      ringPulse: true,
      targetShake: true,
      shakeIntensity: 4,
    },
    particles: {
      shape: "shard",
      color: PALETTE.stormGray,
      secondaryColor: "#3a3a42",
      count: 18,
      size: [3, 7],
      velocity: [40, 90],
      lifetime: 1100,
      gravity: 10,
      drag: 0.15,
      blendMode: "screen",
      glow: false,
      emission: "orbit",
    },
    screen: {
      shake: { intensity: 3, duration: 500 },
      flash: { color: PALETTE.stormGray, opacity: 0.1, duration: 250 },
      vignette: { color: "#2a2a30", opacity: 0.4, duration: 900 },
      zoom: null,
    },
    sound: { sfx: "skill", volume: 0.85, pitch: -4, secondarySfx: "card" },
    intensity: "extreme",
    textPopup: "none",
    perfDegrade: defaultDegrade(18),
    visualDesc: "灰色风暴旋涡自中心螺旋扩张，灰色碎片环绕飞旋，全场灰雾暗角",
  },

  // ── 共叙：双向绿色光流 + 和谐涟漪 ──
  gongxu: {
    key: "gongxu",
    name: "共叙",
    kind: "strategy",
    archetype: "harmony",
    element: "light",
    primaryColor: PALETTE.emerald,
    secondaryColor: PALETTE.emeraldDeep,
    glowColor: "rgba(74,160,112,0.5)",
    cssVarBase: "--gold",
    phases: phases(200, 400, 300, 450),
    flight: { style: "bidirectional", curvature: 0.15, size: 4, spin: 0, trailLength: 60, trailColor: `linear-gradient(90deg, ${PALETTE.emerald}, ${PALETTE.emeraldDeep}, ${PALETTE.emerald})` },
    hit: {
      pattern: "ripple",
      particleCount: 14,
      particleColor: PALETTE.emerald,
      ringPulse: true,
      targetShake: false,
      shakeIntensity: 0,
    },
    particles: {
      shape: "wisp",
      color: PALETTE.emerald,
      secondaryColor: PALETTE.emeraldDeep,
      count: 14,
      size: [5, 10],
      velocity: [30, 60],
      lifetime: 900,
      gravity: 0,
      drag: 0.3,
      blendMode: "screen",
      glow: true,
      emission: "stream",
    },
    screen: {
      shake: null,
      flash: { color: PALETTE.emerald, opacity: 0.08, duration: 300 },
      vignette: { color: PALETTE.emeraldDeep, opacity: 0.18, duration: 700 },
      zoom: null,
    },
    sound: { sfx: "heal", volume: 0.85, pitch: 3, secondarySfx: "select" },
    intensity: "normal",
    textPopup: "none",
    perfDegrade: defaultDegrade(14),
    visualDesc: "双向绿色光流在双方之间循环流动，两端各生和谐涟漪，宁静治愈",
  },

  // ── 借墨：丝线牵扯 + 傀儡感（紫黑） ──
  jiemo: {
    key: "jiemo",
    name: "借墨",
    kind: "strategy",
    archetype: "puppet",
    element: "shadow",
    primaryColor: PALETTE.violet,
    secondaryColor: PALETTE.parchmentDeep,
    glowColor: "rgba(138,74,160,0.5)",
    cssVarBase: "--gold",
    phases: phases(240, 380, 300, 420),
    flight: { style: "puppet-strings", curvature: 0.3, size: 2, spin: 0, trailLength: 0, trailColor: PALETTE.violet },
    hit: {
      pattern: "spark",
      particleCount: 10,
      particleColor: PALETTE.violetBright,
      ringPulse: true,
      targetShake: true,
      shakeIntensity: 5,
    },
    particles: {
      shape: "thread",
      color: PALETTE.violet,
      secondaryColor: PALETTE.parchmentDeep,
      count: 10,
      size: [1, 2],
      velocity: [50, 100],
      lifetime: 800,
      gravity: 0,
      drag: 0.15,
      blendMode: "normal",
      glow: true,
      emission: "stream",
    },
    screen: {
      shake: { intensity: 2, duration: 300 },
      flash: { color: PALETTE.violet, opacity: 0.1, duration: 200 },
      vignette: { color: PALETTE.parchmentDeep, opacity: 0.4, duration: 700 },
      zoom: { scale: 0.98, duration: 350 },
    },
    sound: { sfx: "skill", volume: 0.8, pitch: -3, secondarySfx: "card" },
    intensity: "intense",
    textPopup: "none",
    perfDegrade: defaultDegrade(10),
    visualDesc: "紫色傀儡丝线从施法者牵向被驱使者，被驱使者机械地挥笔攻击，傀儡感拉满",
  },

  // ── 重叙：时间扭曲 + 黑紫裂纹 ──
  chongxu: {
    key: "chongxu",
    name: "重叙",
    kind: "strategy",
    archetype: "timewarp",
    element: "time",
    primaryColor: PALETTE.violet,
    secondaryColor: PALETTE.parchmentDarker,
    glowColor: "rgba(138,74,160,0.6)",
    cssVarBase: "--parchment-deep",
    phases: phases(300, 500, 400, 600),
    flight: { style: "spiral", curvature: 0.8, size: 3, spin: -720, trailLength: 30, trailColor: `linear-gradient(90deg, ${PALETTE.violet}, ${PALETTE.parchmentDarker})` },
    hit: {
      pattern: "crack",
      particleCount: 14,
      particleColor: PALETTE.violetBright,
      ringPulse: true,
      targetShake: true,
      shakeIntensity: 7,
    },
    particles: {
      shape: "crack",
      color: PALETTE.violetBright,
      secondaryColor: PALETTE.parchmentDarker,
      count: 14,
      size: [4, 12],
      velocity: [20, 60],
      lifetime: 1000,
      gravity: 0,
      drag: 0.5,
      blendMode: "screen",
      glow: true,
      emission: "burst",
    },
    screen: {
      shake: { intensity: 6, duration: 500 },
      flash: { color: PALETTE.violet, opacity: 0.15, duration: 200 },
      vignette: { color: PALETTE.parchmentDarker, opacity: 0.55, duration: 1100 },
      zoom: { scale: 0.95, duration: 600 },
    },
    sound: { sfx: "damage", volume: 1.0, pitch: -8, secondarySfx: "skill" },
    intensity: "extreme",
    textPopup: "none",
    perfDegrade: defaultDegrade(14),
    visualDesc: "时间反向螺旋扭曲，黑紫裂纹从判定区迸裂扩散，重叙日的毁灭性重现",
  },

  /* ════════════════════════════════════════════════════════════════════
   * 装备牌（畸变物）—— 金属光泽飞入 + 槽位光晕，每件独立
   * ════════════════════════════════════════════════════════════════════ */

  // ── 溯时沙漏：金属沙漏 + 时间金尘 ──
  suoshi: {
    key: "suoshi",
    name: "溯时沙漏",
    kind: "equip",
    archetype: "equip",
    element: "metal",
    primaryColor: PALETTE.goldBright,
    secondaryColor: PALETTE.goldGlow,
    glowColor: "rgba(200,160,67,0.6)",
    cssVarBase: "--gold-bright",
    phases: phases(150, 350, 220, 400),
    flight: { style: "card-fly", curvature: 0, size: 28, spin: 180, trailLength: 60, trailColor: `linear-gradient(90deg, transparent, ${PALETTE.goldBright}, transparent)` },
    hit: {
      pattern: "ripple",
      particleCount: 12,
      particleColor: PALETTE.goldGlow,
      ringPulse: true,
      targetShake: false,
      shakeIntensity: 0,
    },
    particles: {
      shape: "dust",
      color: PALETTE.goldGlow,
      secondaryColor: PALETTE.goldBright,
      count: 12,
      size: [2, 4],
      velocity: [10, 30],
      lifetime: 1000,
      gravity: 80, // 沙粒下落
      drag: 0.2,
      blendMode: "screen",
      glow: true,
      emission: "stream",
    },
    screen: {
      shake: null,
      flash: { color: PALETTE.goldGlow, opacity: 0.08, duration: 250 },
      vignette: { color: PALETTE.goldDim, opacity: 0.15, duration: 500 },
      zoom: null,
    },
    sound: { sfx: "card", volume: 0.75, pitch: 2, secondarySfx: "select" },
    intensity: "normal",
    textPopup: "none",
    perfDegrade: defaultDegrade(12),
    visualDesc: "金属沙漏飞入武器槽，金尘如倒流沙粒缓缓下落，槽位金色光晕",
  },

  // ── 捕影画框：金属画框 + 捕捉银闪 ──
  buying: {
    key: "buying",
    name: "捕影画框",
    kind: "equip",
    archetype: "equip",
    element: "metal",
    primaryColor: PALETTE.silver,
    secondaryColor: PALETTE.creamLight,
    glowColor: "rgba(216,220,224,0.6)",
    cssVarBase: "--cream-light",
    phases: phases(140, 300, 200, 380),
    flight: { style: "card-fly", curvature: 0, size: 30, spin: 90, trailLength: 50, trailColor: `linear-gradient(90deg, transparent, ${PALETTE.silver}, transparent)` },
    hit: {
      pattern: "spark",
      particleCount: 8,
      particleColor: PALETTE.silver,
      ringPulse: true,
      targetShake: false,
      shakeIntensity: 0,
    },
    particles: {
      shape: "spark",
      color: PALETTE.silver,
      secondaryColor: "#ffffff",
      count: 8,
      size: [2, 4],
      velocity: [40, 80],
      lifetime: 400,
      gravity: 0,
      drag: 0.3,
      blendMode: "screen",
      glow: true,
      emission: "burst",
    },
    screen: {
      shake: null,
      flash: { color: PALETTE.silver, opacity: 0.12, duration: 120 },
      vignette: null,
      zoom: null,
    },
    sound: { sfx: "select", volume: 0.7, pitch: 5, secondarySfx: "click" },
    intensity: "normal",
    textPopup: "none",
    perfDegrade: defaultDegrade(8),
    visualDesc: "银色金属画框飞入武器槽，落地瞬间银白闪光如快门捕捉，槽位银光晕",
  },

  // ── 裁纸利刃：金属刀刃 + 切割钢火花 ──
  caizhi: {
    key: "caizhi",
    name: "裁纸利刃",
    kind: "equip",
    archetype: "equip",
    element: "metal",
    primaryColor: PALETTE.steel,
    secondaryColor: PALETTE.creamLight,
    glowColor: "rgba(184,192,200,0.6)",
    cssVarBase: "--cream-light",
    phases: phases(120, 280, 180, 360),
    flight: { style: "card-fly", curvature: 0.2, size: 26, spin: 540, trailLength: 70, trailColor: `linear-gradient(90deg, transparent, ${PALETTE.steel}, ${PALETTE.creamLight}, transparent)` },
    hit: {
      pattern: "spark",
      particleCount: 10,
      particleColor: PALETTE.steel,
      ringPulse: true,
      targetShake: true,
      shakeIntensity: 3,
    },
    particles: {
      shape: "spark",
      color: PALETTE.steel,
      secondaryColor: "#ffffff",
      count: 10,
      size: [2, 5],
      velocity: [50, 100],
      lifetime: 450,
      gravity: 40,
      drag: 0.2,
      blendMode: "screen",
      glow: true,
      emission: "burst",
    },
    screen: {
      shake: { intensity: 2, duration: 150 },
      flash: { color: "#ffffff", opacity: 0.1, duration: 80 },
      vignette: null,
      zoom: null,
    },
    sound: { sfx: "card", volume: 0.8, pitch: 4, secondarySfx: "click" },
    intensity: "intense",
    textPopup: "none",
    perfDegrade: defaultDegrade(10),
    visualDesc: "钢色利刃旋转飞入武器槽，落地迸射切割钢火花，锋利切割感",
  },

  // ── 染血墨笔：染血金属笔 + 血墨滴 ──
  ranxue: {
    key: "ranxue",
    name: "染血墨笔",
    kind: "equip",
    archetype: "equip",
    element: "ink",
    primaryColor: PALETTE.bloodBright,
    secondaryColor: PALETTE.goldDim,
    glowColor: "rgba(198,64,64,0.6)",
    cssVarBase: "--blood",
    phases: phases(160, 320, 220, 400),
    flight: { style: "card-fly", curvature: 0.15, size: 28, spin: 360, trailLength: 60, trailColor: `linear-gradient(90deg, transparent, ${PALETTE.bloodBright}, ${PALETTE.goldDim}, transparent)` },
    hit: {
      pattern: "spark",
      particleCount: 12,
      particleColor: PALETTE.bloodBright,
      ringPulse: true,
      targetShake: true,
      shakeIntensity: 4,
    },
    particles: {
      shape: "ember",
      color: PALETTE.bloodBright,
      secondaryColor: PALETTE.goldDim,
      count: 12,
      size: [3, 7],
      velocity: [20, 50],
      lifetime: 800,
      gravity: -50, // 血色余烬上升，区别于笔伐的下落墨滴
      drag: 0.3,
      blendMode: "screen",
      glow: true,
      emission: "stream",
    },
    screen: {
      shake: { intensity: 2, duration: 200 },
      flash: { color: PALETTE.bloodBright, opacity: 0.1, duration: 120 },
      vignette: { color: PALETTE.blood, opacity: 0.2, duration: 450 },
      zoom: null,
    },
    sound: { sfx: "card", volume: 0.85, pitch: -1, secondarySfx: "damage" },
    intensity: "intense",
    textPopup: "none",
    perfDegrade: defaultDegrade(12),
    visualDesc: "染血金属笔飞入武器槽，升起血色余烬（screen 叠加上升），区别于笔伐的下落墨滴，血色暗角弥漫",
  },

  // ── 锈迹刻刀：锈蚀金属 + 铁锈屑 ──
  xiuji: {
    key: "xiuji",
    name: "锈迹刻刀",
    kind: "equip",
    archetype: "equip",
    element: "metal",
    primaryColor: PALETTE.rust,
    secondaryColor: PALETTE.parchment,
    glowColor: "rgba(138,90,40,0.5)",
    cssVarBase: "--gold-dim",
    phases: phases(140, 300, 200, 380),
    flight: { style: "card-fly", curvature: 0.1, size: 26, spin: 720, trailLength: 55, trailColor: `linear-gradient(90deg, transparent, ${PALETTE.rust}, transparent)` },
    hit: {
      pattern: "shatter",
      particleCount: 10,
      particleColor: PALETTE.rust,
      ringPulse: true,
      targetShake: true,
      shakeIntensity: 3,
    },
    particles: {
      shape: "dust",
      color: PALETTE.rust,
      secondaryColor: PALETTE.parchment,
      count: 10,
      size: [2, 5],
      velocity: [20, 50],
      lifetime: 700,
      gravity: 120,
      drag: 0.3,
      blendMode: "normal",
      glow: false,
      emission: "burst",
    },
    screen: {
      shake: { intensity: 2, duration: 180 },
      flash: null,
      vignette: { color: PALETTE.rust, opacity: 0.15, duration: 400 },
      zoom: null,
    },
    sound: { sfx: "card", volume: 0.75, pitch: -4, secondarySfx: "click" },
    intensity: "normal",
    textPopup: "none",
    perfDegrade: defaultDegrade(10),
    visualDesc: "锈蚀刻刀高速旋转飞入武器槽，落地崩落铁锈屑，斑驳沧桑",
  },

  // ── 叙事壁垒：金属壁垒板块 + 护盾 ──
  bilei: {
    key: "bilei",
    name: "叙事壁垒",
    kind: "equip",
    archetype: "equip",
    element: "metal",
    primaryColor: PALETTE.bronze,
    secondaryColor: PALETTE.goldDim,
    glowColor: "rgba(160,120,64,0.5)",
    cssVarBase: "--gold",
    phases: phases(180, 350, 250, 420),
    flight: { style: "orbit", curvature: 0.5, size: 20, spin: 90, trailLength: 0, trailColor: PALETTE.bronze },
    hit: {
      pattern: "ripple",
      particleCount: 8,
      particleColor: PALETTE.bronze,
      ringPulse: true,
      targetShake: false,
      shakeIntensity: 0,
    },
    particles: {
      shape: "shard",
      color: PALETTE.bronze,
      secondaryColor: PALETTE.goldDim,
      count: 8,
      size: [6, 12],
      velocity: [10, 30],
      lifetime: 800,
      gravity: 0,
      drag: 0.4,
      blendMode: "normal",
      glow: true,
      emission: "orbit",
    },
    screen: {
      shake: null,
      flash: { color: PALETTE.bronze, opacity: 0.08, duration: 250 },
      vignette: { color: PALETTE.goldDim, opacity: 0.2, duration: 550 },
      zoom: { scale: 0.99, duration: 250 },
    },
    sound: { sfx: "card", volume: 0.8, pitch: -2, secondarySfx: "select" },
    intensity: "normal",
    textPopup: "none",
    perfDegrade: defaultDegrade(8),
    visualDesc: "青铜壁垒板块环绕护甲槽位组装合拢，板块碎片环绕成护盾光环",
  },

  // ── 留白屏障：白色屏障 + 留白飘絮 ──
  liubaiping: {
    key: "liubaiping",
    name: "留白屏障",
    kind: "equip",
    archetype: "equip",
    element: "light",
    primaryColor: PALETTE.ink,
    secondaryColor: PALETTE.creamLight,
    glowColor: "rgba(232,223,200,0.5)",
    cssVarBase: "--ink",
    phases: phases(160, 320, 240, 400),
    flight: { style: "card-fly", curvature: 0, size: 28, spin: 0, trailLength: 50, trailColor: `linear-gradient(90deg, transparent, ${PALETTE.ink}, transparent)` },
    hit: {
      pattern: "ripple",
      particleCount: 10,
      particleColor: PALETTE.ink,
      ringPulse: true,
      targetShake: false,
      shakeIntensity: 0,
    },
    particles: {
      shape: "wisp",
      color: PALETTE.ink,
      secondaryColor: PALETTE.creamLight,
      count: 10,
      size: [4, 8],
      velocity: [10, 30],
      lifetime: 900,
      gravity: -10,
      drag: 0.4,
      blendMode: "screen",
      glow: true,
      emission: "orbit",
    },
    screen: {
      shake: null,
      flash: { color: PALETTE.ink, opacity: 0.08, duration: 250 },
      vignette: { color: PALETTE.ink, opacity: 0.15, duration: 500 },
      zoom: null,
    },
    sound: { sfx: "select", volume: 0.7, pitch: 3 },
    intensity: "subtle",
    textPopup: "none",
    perfDegrade: defaultDegrade(10),
    visualDesc: "白色屏障飞入护甲槽，留白飘絮环绕成空无护盾，纯净防御",
  },

  // ── 正身符印：金色符印 + 正气光环 ──
  zhengshen: {
    key: "zhengshen",
    name: "正身符印",
    kind: "equip",
    archetype: "seal",
    element: "light",
    primaryColor: PALETTE.goldGlow,
    secondaryColor: "#fff5d0",
    glowColor: "rgba(240,200,98,0.7)",
    cssVarBase: "--gold-glow",
    phases: phases(200, 380, 260, 450),
    flight: { style: "orbit", curvature: 0.6, size: 18, spin: 360, trailLength: 0, trailColor: PALETTE.goldGlow },
    hit: {
      pattern: "seal-stamp",
      particleCount: 10,
      particleColor: PALETTE.goldGlow,
      ringPulse: true,
      targetShake: false,
      shakeIntensity: 0,
    },
    particles: {
      shape: "rune",
      color: PALETTE.goldGlow,
      secondaryColor: "#fff5d0",
      count: 10,
      size: [5, 9],
      velocity: [10, 30],
      lifetime: 1000,
      gravity: 0,
      drag: 0.4,
      blendMode: "screen",
      glow: true,
      emission: "orbit",
    },
    screen: {
      shake: null,
      flash: { color: "#fff5d0", opacity: 0.1, duration: 300 },
      vignette: { color: PALETTE.gold, opacity: 0.18, duration: 600 },
      zoom: null,
    },
    sound: { sfx: "skill", volume: 0.8, pitch: 5, secondarySfx: "select" },
    intensity: "normal",
    textPopup: "none",
    perfDegrade: defaultDegrade(10),
    visualDesc: "金色正身符印环绕护甲槽位悬浮，正气符文光环流转，万法不侵",
  },

  // ── 咫尺之靴：金属靴 + 距离压缩尘埃 ──
  zhichi: {
    key: "zhichi",
    name: "咫尺之靴",
    kind: "equip",
    archetype: "equip",
    element: "metal",
    primaryColor: PALETTE.bronze,
    secondaryColor: PALETTE.goldDim,
    glowColor: "rgba(160,120,64,0.5)",
    cssVarBase: "--gold",
    phases: phases(130, 280, 180, 360),
    flight: { style: "card-fly", curvature: 0.3, size: 26, spin: 270, trailLength: 60, trailColor: `linear-gradient(90deg, transparent, ${PALETTE.bronze}, transparent)` },
    hit: {
      pattern: "ripple",
      particleCount: 10,
      particleColor: PALETTE.bronze,
      ringPulse: true,
      targetShake: false,
      shakeIntensity: 0,
    },
    particles: {
      shape: "dust",
      color: PALETTE.bronze,
      secondaryColor: PALETTE.goldDim,
      count: 10,
      size: [2, 5],
      velocity: [30, 70],
      lifetime: 500,
      gravity: 60,
      drag: 0.3,
      blendMode: "normal",
      glow: false,
      emission: "burst",
    },
    screen: {
      shake: { intensity: 1, duration: 150 },
      flash: null,
      vignette: { color: PALETTE.goldDim, opacity: 0.12, duration: 400 },
      zoom: { scale: 1.01, duration: 200 },
    },
    sound: { sfx: "card", volume: 0.7, pitch: 1, secondarySfx: "click" },
    intensity: "normal",
    textPopup: "none",
    perfDegrade: defaultDegrade(10),
    visualDesc: "青铜之靴飞入坐骑槽，落地扬起距离压缩尘埃，空间被缩短为咫尺",
  },

  // ── 折纸之翼：折纸翅膀 + 空间折叠碎片 ──
  zhezhi: {
    key: "zhezhi",
    name: "折纸之翼",
    kind: "equip",
    archetype: "equip",
    element: "wind",
    primaryColor: PALETTE.ink,
    secondaryColor: PALETTE.creamLight,
    glowColor: "rgba(232,223,200,0.4)",
    cssVarBase: "--ink",
    phases: phases(160, 340, 220, 400),
    flight: { style: "fold", curvature: 0.4, size: 30, spin: 180, trailLength: 40, trailColor: `linear-gradient(90deg, transparent, ${PALETTE.ink}, ${PALETTE.creamLight}, transparent)` },
    hit: {
      pattern: "shatter",
      particleCount: 12,
      particleColor: PALETTE.ink,
      ringPulse: true,
      targetShake: false,
      shakeIntensity: 0,
    },
    particles: {
      shape: "shard",
      color: PALETTE.ink,
      secondaryColor: PALETTE.creamLight,
      count: 12,
      size: [4, 9],
      velocity: [20, 50],
      lifetime: 700,
      gravity: -30, // 纸片飘升
      drag: 0.3,
      blendMode: "screen",
      glow: false,
      emission: "burst",
    },
    screen: {
      shake: null,
      flash: { color: PALETTE.ink, opacity: 0.08, duration: 220 },
      vignette: { color: PALETTE.creamLight, opacity: 0.12, duration: 500 },
      zoom: { scale: 1.02, duration: 250 },
    },
    sound: { sfx: "card", volume: 0.7, pitch: 3, secondarySfx: "select" },
    intensity: "normal",
    textPopup: "none",
    perfDegrade: defaultDegrade(12),
    visualDesc: "折纸之翼空间折叠飞入坐骑槽，纸片碎片飘散，三维折叠为二维",
  },

  // ── 渡鸦信使：渡鸦羽 + 信使飞掠 ──
  duya: {
    key: "duya",
    name: "渡鸦信使",
    kind: "equip",
    archetype: "equip",
    element: "shadow",
    primaryColor: PALETTE.ravenBlack,
    secondaryColor: PALETTE.steel,
    glowColor: "rgba(40,40,50,0.5)",
    cssVarBase: "--parchment",
    phases: phases(140, 300, 200, 380),
    flight: { style: "card-fly", curvature: 0.5, size: 24, spin: 0, trailLength: 50, trailColor: `linear-gradient(90deg, transparent, ${PALETTE.ravenBlack}, transparent)` },
    hit: {
      pattern: "spark",
      particleCount: 10,
      particleColor: PALETTE.ravenBlack,
      ringPulse: true,
      targetShake: false,
      shakeIntensity: 0,
    },
    particles: {
      shape: "leaf",
      color: PALETTE.ravenBlack,
      secondaryColor: PALETTE.steel,
      count: 10,
      size: [4, 9],
      velocity: [30, 60],
      lifetime: 800,
      gravity: 30,
      drag: 0.25,
      blendMode: "normal",
      glow: false,
      emission: "stream",
    },
    screen: {
      shake: null,
      flash: null,
      vignette: { color: PALETTE.ravenBlack, opacity: 0.2, duration: 450 },
      zoom: null,
    },
    sound: { sfx: "card", volume: 0.75, pitch: -2, secondarySfx: "select" },
    intensity: "normal",
    textPopup: "none",
    perfDegrade: defaultDegrade(10),
    visualDesc: "渡鸦信使弧线飞掠入饰品槽，黑色羽毛飘落，神秘信使降临",
  },

  // ── 迷途指南针：金属指南针 + 迷雾银尘 ──
  mitu: {
    key: "mitu",
    name: "迷途指南针",
    kind: "equip",
    archetype: "equip",
    element: "metal",
    primaryColor: PALETTE.silver,
    secondaryColor: PALETTE.creamLight,
    glowColor: "rgba(216,220,224,0.4)",
    cssVarBase: "--cream-light",
    phases: phases(170, 330, 230, 410),
    flight: { style: "orbit", curvature: 0.3, size: 22, spin: 1080, trailLength: 0, trailColor: PALETTE.silver },
    hit: {
      pattern: "ripple",
      particleCount: 12,
      particleColor: PALETTE.silver,
      ringPulse: true,
      targetShake: false,
      shakeIntensity: 0,
    },
    particles: {
      shape: "dust",
      color: PALETTE.silver,
      secondaryColor: PALETTE.creamLight,
      count: 12,
      size: [2, 4],
      velocity: [10, 30],
      lifetime: 1000,
      gravity: -20, // 迷雾悬浮
      drag: 0.5,
      blendMode: "screen",
      glow: true,
      emission: "orbit",
    },
    screen: {
      shake: null,
      flash: { color: PALETTE.silver, opacity: 0.08, duration: 250 },
      vignette: { color: PALETTE.creamLight, opacity: 0.2, duration: 600 },
      zoom: null,
    },
    sound: { sfx: "select", volume: 0.7, pitch: 4, secondarySfx: "card" },
    intensity: "subtle",
    textPopup: "none",
    perfDegrade: defaultDegrade(12),
    visualDesc: "银色指南针高速旋转飞入饰品槽，迷雾银尘环绕悬浮，永远指向迷途",
  },
};

/* ========================================================================== *
 * 5. 默认/兜底配置（未知卡牌回退，仍遵守"无文字"原则）
 * ========================================================================== */

const FALLBACK_CONFIG: EffectConfig = {
  key: "__fallback__",
  name: "未知",
  kind: "basic",
  archetype: "strike",
  element: "ink",
  primaryColor: PALETTE.gold,
  secondaryColor: PALETTE.goldDim,
  glowColor: "rgba(160,128,48,0.5)",
  cssVarBase: "--gold",
  phases: { ...DEFAULT_PHASES },
  flight: { style: "direct-linear", curvature: 0, size: 16, spin: 0, trailLength: 40, trailColor: `linear-gradient(90deg, transparent, ${PALETTE.gold}, transparent)` },
  hit: { pattern: "spark", particleCount: 6, particleColor: PALETTE.gold, ringPulse: true, targetShake: false, shakeIntensity: 0 },
  particles: { shape: "spark", color: PALETTE.gold, secondaryColor: PALETTE.goldDim, count: 6, size: [2, 4], velocity: [20, 50], lifetime: 400, gravity: 0, drag: 0.3, blendMode: "screen", glow: true, emission: "burst" },
  screen: { shake: null, flash: { color: PALETTE.gold, opacity: 0.06, duration: 150 }, vignette: null, zoom: null },
  sound: { sfx: "card", volume: 0.6, pitch: 0 },
  intensity: "subtle",
  textPopup: "none",
  perfDegrade: defaultDegrade(6),
  visualDesc: "兜底：金色火花直线飞行，最朴素演出",
};

/* ========================================================================== *
 * 6. 辅助函数
 * ========================================================================== */

/**
 * 根据 cardKey 获取完整特效配置。
 * 未知 key 返回兜底配置（仍遵守"无文字弹窗"原则）。
 */
export function getEffectConfig(cardKey: string): EffectConfig {
  return CARD_EFFECT_CONFIGS[cardKey] ?? FALLBACK_CONFIG;
}

/**
 * 获取四阶段时长对象（ms）。
 * 可传入性能档位以缩放时长。
 */
export function getPhaseTimings(cardKey: string, tier: PerfTier = "high"): PhaseTiming {
  const cfg = getEffectConfig(cardKey);
  const scale = resolvePhaseScale(cfg, tier);
  return {
    windup: Math.round(cfg.phases.windup * scale),
    burst: Math.round(cfg.phases.burst * scale),
    impact: Math.round(cfg.phases.impact * scale),
    settle: Math.round(cfg.phases.settle * scale),
  };
}

/**
 * 获取特效总时长（ms）= 起势 + 爆发 + 命中 + 收束。
 * 用于 setTimeout 移除等场景，替代硬编码的 3800ms。
 */
export function getDuration(cardKey: string, tier: PerfTier = "high"): number {
  const p = getPhaseTimings(cardKey, tier);
  return p.windup + p.burst + p.impact + p.settle;
}

/**
 * 获取命中阶段起始时间（ms）= 起势 + 爆发。
 * 用于在命中瞬间触发粒子/震屏。
 */
export function getImpactStart(cardKey: string, tier: PerfTier = "high"): number {
  const p = getPhaseTimings(cardKey, tier);
  return p.windup + p.burst;
}

/**
 * 获取爆发阶段起始时间（ms）= 起势。
 */
export function getBurstStart(cardKey: string, tier: PerfTier = "high"): number {
  return getPhaseTimings(cardKey, tier).windup;
}

/**
 * 解析指定性能档位下的粒子数量。
 * 高档=原值，中档/低档按 perfDegrade 缩放并取整。
 */
export function getParticleCount(cardKey: string, tier: PerfTier = "high"): number {
  const cfg = getEffectConfig(cardKey);
  if (tier === "high") return cfg.particles.count;
  const overrides = tier === "medium" ? cfg.perfDegrade.medium : cfg.perfDegrade.low;
  const scale = overrides.particleScale ?? 1;
  return Math.max(0, Math.round(cfg.particles.count * scale));
}

/**
 * 解析指定性能档位下的粒子发光开关。
 */
export function getParticleGlow(cardKey: string, tier: PerfTier = "high"): boolean {
  const cfg = getEffectConfig(cardKey);
  if (tier === "high") return cfg.particles.glow;
  const overrides = tier === "medium" ? cfg.perfDegrade.medium : cfg.perfDegrade.low;
  return overrides.glow ?? cfg.particles.glow;
}

/**
 * 解析指定性能档位下某项屏幕反馈是否启用。
 */
export function isScreenFeedbackEnabled(
  cardKey: string,
  feedback: "shake" | "flash" | "vignette" | "zoom",
  tier: PerfTier = "high",
): boolean {
  const cfg = getEffectConfig(cardKey);
  const base = cfg.screen[feedback];
  if (tier === "high") return base !== null;
  const overrides = tier === "medium" ? cfg.perfDegrade.medium : cfg.perfDegrade.low;
  const flag = {
    shake: overrides.screenShake,
    flash: overrides.screenFlash,
    vignette: overrides.screenVignette,
    zoom: overrides.screenZoom,
  }[feedback];
  return flag === true && base !== null;
}

/**
 * 综合解析性能档位，返回一份可直接使用的"已降级"配置快照。
 * BattleEffects / GameBoard 可一次性取用，无需逐字段判断。
 */
export function resolvePerfConfig(cardKey: string, tier: PerfTier = "high"): ResolvedEffectConfig {
  const cfg = getEffectConfig(cardKey);
  const phaseScale = resolvePhaseScale(cfg, tier);
  const overrides = tier === "high" ? null : tier === "medium" ? cfg.perfDegrade.medium : cfg.perfDegrade.low;
  const particleScale = overrides?.particleScale ?? 1;
  const glow = overrides?.glow ?? cfg.particles.glow;

  return {
    key: cfg.key,
    name: cfg.name,
    kind: cfg.kind,
    archetype: cfg.archetype,
    element: cfg.element,
    primaryColor: cfg.primaryColor,
    secondaryColor: cfg.secondaryColor,
    glowColor: cfg.glowColor,
    phases: {
      windup: Math.round(cfg.phases.windup * phaseScale),
      burst: Math.round(cfg.phases.burst * phaseScale),
      impact: Math.round(cfg.phases.impact * phaseScale),
      settle: Math.round(cfg.phases.settle * phaseScale),
    },
    flight: cfg.flight,
    hit: { ...cfg.hit, particleCount: Math.max(0, Math.round(cfg.hit.particleCount * particleScale)) },
    particles: {
      ...cfg.particles,
      count: Math.max(0, Math.round(cfg.particles.count * particleScale)),
      glow,
    },
    screen: {
      shake: isScreenFeedbackEnabled(cardKey, "shake", tier) ? cfg.screen.shake : null,
      flash: isScreenFeedbackEnabled(cardKey, "flash", tier) ? cfg.screen.flash : null,
      vignette: isScreenFeedbackEnabled(cardKey, "vignette", tier) ? cfg.screen.vignette : null,
      zoom: isScreenFeedbackEnabled(cardKey, "zoom", tier) ? cfg.screen.zoom : null,
    },
    sound: cfg.sound,
    intensity: cfg.intensity,
    textPopup: "none",
    visualDesc: cfg.visualDesc,
  };
}

/** 解析后的特效配置（已应用性能降级，字段非可空） */
export interface ResolvedEffectConfig {
  key: string;
  name: string;
  kind: CardKind;
  archetype: EffectArchetype;
  element: EffectElement;
  primaryColor: string;
  secondaryColor: string;
  glowColor: string;
  phases: PhaseTiming;
  flight: FlightConfig;
  hit: HitConfig;
  particles: ParticleConfig;
  screen: ScreenFeedback;
  sound: SoundConfig;
  intensity: IntensityLevel;
  textPopup: TextPopup;
  visualDesc: string;
}

/** 内部：解析阶段时长缩放倍率 */
function resolvePhaseScale(cfg: EffectConfig, tier: PerfTier): number {
  if (tier === "high") return 1;
  const overrides = tier === "medium" ? cfg.perfDegrade.medium : cfg.perfDegrade.low;
  return overrides?.phaseScale ?? 1;
}

/**
 * 获取该卡牌的音效配置（已含音量/音高/第二音）。
 */
export function getSoundConfig(cardKey: string): SoundConfig {
  return getEffectConfig(cardKey).sound;
}

/**
 * 获取该卡牌的强度等级。
 */
export function getIntensity(cardKey: string): IntensityLevel {
  return getEffectConfig(cardKey).intensity;
}

/**
 * 列出所有已配置的卡牌 key（便于校验完整性，26 张）。
 */
export function getAllConfiguredCardKeys(): string[] {
  return Object.keys(CARD_EFFECT_CONFIGS);
}

/**
 * 校验：确保所有配置均满足"无文字弹窗"硬约束。
 * 返回违规的卡牌 key 列表（应为空）。
 */
export function validateNoTextPopup(): string[] {
  return Object.values(CARD_EFFECT_CONFIGS)
    .filter((c) => c.textPopup !== "none")
    .map((c) => c.key);
}

/**
 * 校验：确保没有两张牌共用完全相同的（shape + color）粒子配方。
 * 返回发生冲突的粒子签名列表（应为空）。
 */
export function validateUniqueParticles(): string[] {
  const seen = new Map<string, string>(); // signature -> first cardKey
  const conflicts: string[] = [];
  for (const cfg of Object.values(CARD_EFFECT_CONFIGS)) {
    const sig = `${cfg.particles.shape}|${cfg.particles.color}|${cfg.particles.secondaryColor}`;
    if (seen.has(sig)) {
      conflicts.push(`${seen.get(sig)} & ${cfg.key} 共用粒子: ${sig}`);
    } else {
      seen.set(sig, cfg.key);
    }
  }
  return conflicts;
}

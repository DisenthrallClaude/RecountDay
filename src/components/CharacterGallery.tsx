import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  motion,
  AnimatePresence,
  useDragControls,
  useMotionValue,
  useSpring,
  useTransform,
  useReducedMotion,
} from "framer-motion";
import { CHARACTERS, type CharacterDef } from "../data/characters";
import { type FactionCategory } from "../data/factions";
import { IconExit } from "./Icons";
import { playSound } from "./MainMenu";
import ScrollViewer3D from "./ScrollViewer3D";
import { assetUrl } from "../utils/assetUrl";

/* ════════════════════════════════════════════════════════════════
   人物图谱 · 命运星图 (CONSTELLATION OF FATES)
   ────────────────────────────────────────────────────────────────
   设计目标
   1. 真实景深：阵法底图 / 星云 / 三层视差星野 / 星盘，指针驱动（零 re-render）
   2. 天体化节点：轨道环、缘光、微弱漂浮、可信的「选中」态
   3. 命运丝线：线宽=羁绊强度、流光、隐藏羁绊描线显形
   4. 电影级入场：星宫自绘 → 星辰依次点亮 → 丝线织成
   5. 聚焦即运镜：镜头推向该星辰，四周退入黑暗，右侧浮起「卷宗」

   ⚠️ 界面上不出现任何「阵营分类」字样
   ----------------------------------------------------------------
   早先版本把六大阵营（守序/暗影/…）做成筛选轨 + 水印 + 徽记，信息噪声太大。
   现在分类**只作为布局用的空间分簇**存在（`CHAR_FACTION` → 六个星宫的坐标），
   界面上一个分类名都不露；筛选轨换成了更实用的「检索 + 丝线类型」。

   工程要点
   - 坐标系随容器长宽比自适应（ResizeObserver 量测 → 单位坐标 → SVG viewBox
     与容器同比），从 380px 到超宽屏都不浪费空间、不畸变。
   - 节点位置由「六角星宫 + 确定性抖动 + 松弛排斥」求解，保证任何比例下
     星辰与名签都不重叠。
   - 所有常驻动效走 CSS / SVG / framer transform，指针视差走 MotionValue，
     不存在逐帧 setState。
   ════════════════════════════════════════════════════════════════ */

/* ──────────────────────────────────────────────
   1. 关系数据
   ────────────────────────────────────────────── */

type RelationType = "faction" | "rival" | "ally" | "blood" | "master" | "hidden";

/** 显式关系（同阵营关系由 CHAR_FACTION 自动派生） */
interface Relation {
  a: number;
  b: number;
  type: Exclude<RelationType, "faction">;
  strength: 1 | 2 | 3;
  note: string;
}

/**
 * 角色的**空间分簇**归属：把 24 人分成 6 组、每组 4 人，供布局求解器摆成
 * 六个星宫。这里沿用了 factions.ts 的类别枚举当 key，纯粹因为它现成、
 * 分组也合理——但**类别名不会出现在界面上任何地方**（见文件抬头说明）。
 *
 * ⚠️ 视图层临时映射（VIEW-LOCAL MAPPING）
 * ----------------------------------------------------------------
 * `CharacterDef`（src/data/characters.ts）目前没有分组字段，因此这份
 * 归属表只能先寄居在本视图组件里。
 *
 * TODO(data-layer): 把分组下沉到数据层，两种做法皆可：
 *   1) 在 `CharacterDef` 上加 `faction: FactionCategory` 字段；或
 *   2) 在 src/data/factions.ts 里导出 `CHARACTER_FACTION` 映射。
 * 迁移后本常量应整体删除，本文件其余逻辑无需改动——所有读取都经由
 * `CHAR_FACTION[id]` 这一个入口。
 */
const CHAR_FACTION: Record<number, FactionCategory> = {
  1: "TRANSCENDENT", // 萧难·空白  —— 超脱叙事
  2: "COURIER", // 秦骁·王寇  —— 掠夺与转移
  3: "COURIER", // 苏予·心锚  —— 锚定与传递
  4: "ORDER", // 方妍·正身  —— 法律与秩序
  5: "TRANSCENDENT", // 江戾·冥礼  —— 鬼神祭祀
  6: "SEEKER", // 殷泽·咫尺  —— 空间探索
  7: "ORDER", // 何笙·止戈  —— 和平守望
  8: "COURIER", // 周闻·流言  —— 信息传播
  9: "SHADOW", // 崔攸·藏锋  —— 暗藏杀机
  10: "ORDER", // 韩魏·怀古  —— 历史档案
  11: "SHADOW", // 齐仇·裁纸  —— 断联销毁
  12: "SANCTUARY", // 林休·天眷  —— 被遗忘者
  13: "SEEKER", // 齐凌云·天命 —— 窥探命运
  14: "SEEKER", // 苏言·盲签  —— 古老签文
  15: "SHADOW", // 叶寻·万影  —— 影子潜行
  16: "SANCTUARY", // 宋凉·嫁衣  —— 替身庇护
  17: "ORDER", // 陈鹤·画押  —— 契约为证
  18: "SEEKER", // 付流·回音  —— 复现求知
  19: "SHADOW", // 吕柒·千面  —— 伪装窃能
  20: "TRANSCENDENT", // 凌渊·祸水  —— 灾厄超然
  21: "SANCTUARY", // 李汐·红尘  —— 执念庇护
  22: "COURIER", // 周也·穿肠  —— 痛苦蔓延
  23: "TRANSCENDENT", // 楚菁·不朽  —— 拒绝死亡
  24: "SANCTUARY", // 赵裘·烬余  —— 濒死爆发
};

/** 显式关系列表（敌对/同盟/血缘/师徒/隐藏） */
const RELATIONS: Relation[] = [
  // 敌对
  { a: 2, b: 4, type: "rival", strength: 3, note: "王寇犯法掠夺，正身以法除恶，水火不容。" },
  {
    a: 11,
    b: 3,
    type: "rival",
    strength: 3,
    note: "裁纸断万物之联，心锚锁叙事之始，一断一锁相克。",
  },
  { a: 22, b: 23, type: "rival", strength: 3, note: "穿肠之刃欲破不朽之躯，痛苦与永恒的死斗。" },
  {
    a: 20,
    b: 7,
    type: "rival",
    strength: 2,
    note: "祸水兴灾引厄，止戈强令休战，灾厄与和平的对立。",
  },
  { a: 9, b: 7, type: "rival", strength: 2, note: "藏锋伺机暗发，止戈强压止战，锋芒与平和相冲。" },
  {
    a: 19,
    b: 10,
    type: "rival",
    strength: 2,
    note: "千面窃能改写身份，怀古守护真实历史，真假之争。",
  },
  // 同盟
  { a: 4, b: 7, type: "ally", strength: 2, note: "正身除恶、止戈息争，守序双子并肩。" },
  { a: 10, b: 17, type: "ally", strength: 2, note: "怀古存史、画押立约，以契约为证共守秩序。" },
  { a: 15, b: 9, type: "ally", strength: 2, note: "万影窥秘、藏锋蓄势，暗影之中同行。" },
  { a: 13, b: 14, type: "ally", strength: 3, note: "天命可窥、盲签定数，求知双卜互为印证。" },
  { a: 5, b: 23, type: "ally", strength: 2, note: "冥礼渡亡、不朽拒亡，共研生死之界。" },
  { a: 12, b: 16, type: "ally", strength: 2, note: "天眷护身、嫁衣替劫，庇护相扶共渡厄难。" },
  // 血缘
  { a: 11, b: 13, type: "blood", strength: 3, note: "齐氏血脉——一裁天命、一断万联，同根异途。" },
  { a: 3, b: 14, type: "blood", strength: 3, note: "苏氏血脉——心锚与盲签，同源而殊归。" },
  { a: 8, b: 22, type: "blood", strength: 3, note: "周氏血脉——流言与穿肠，言与刃同宗。" },
  // 师徒
  { a: 10, b: 18, type: "master", strength: 2, note: "韩魏通晓旧事，授付流以回音复现之法。" },
  { a: 5, b: 24, type: "master", strength: 2, note: "江戾主持冥礼，引赵裘以烬余燃尽之道。" },
  { a: 15, b: 19, type: "master", strength: 2, note: "叶寻投影记忆，授吕柒以千面窃能之术。" },
  // 隐藏（聚焦/悬停其两端方可显形）
  { a: 1, b: 23, type: "hidden", strength: 3, note: "空白与不朽——皆为叙事所不能触及之物。" },
  { a: 3, b: 2, type: "hidden", strength: 2, note: "心锚暗中牵系王寇，为其叙事之首锚。" },
  { a: 20, b: 21, type: "hidden", strength: 2, note: "祸水与红尘，灾厄藏于执念之下。" },
  { a: 9, b: 18, type: "hidden", strength: 1, note: "藏锋与回音，暗结存储与复现之约。" },
];

/**
 * 关系类型视觉元数据。
 * `color` 为静息色（压暗以维持哥特氛围），`lit` 为点亮色——
 * 相比旧版整体提亮一档，让丝线在近黑背景上真的「发光」。
 */
/* ──────────────────────────────────────────────
   0b. 单色化 —— 真正的黑 → 灰 → 白
   ----------------------------------------------
   静息状态下整张星图是黑白的。但「黑白」不等于「一片白」：
   旧版把明度压在 0.45~0.94 的窄带里，24 个人几乎一样亮，星图看上去
   像撒了一把同款白点，没有层次。

   现在做两件事：
   1) 灰阶映射区间放宽到 0.22 ~ 0.95，黑端不再被抬起来；
   2) 24 个角色的色调**按名次重新摊开**（`CHAR_TONE`）——把源色按感知亮度
      排序后均匀铺到 [深灰, 近白] 全区间。这样必然有人落在暗部、有人落在
      中灰、有人落在亮部，星图才有真实的调子差。

   色相上保留一丝暖偏移（R 略高、B 略低），读起来像旧银 / 陈年金属，
   而不是屏幕上的中性灰。
   ────────────────────────────────────────────── */

/** 十六进制 → 感知亮度 0~1 */
function lumaOf(hex: string): number {
  const h = hex.replace("#", "");
  const full =
    h.length === 3
      ? h
          .split("")
          .map((c) => c + c)
          .join("")
      : h;
  const r = parseInt(full.slice(0, 2), 16) / 255;
  const g = parseInt(full.slice(2, 4), 16) / 255;
  const b = parseInt(full.slice(4, 6), 16) / 255;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function hex2(n: number): string {
  return Math.max(0, Math.min(255, Math.round(n)))
    .toString(16)
    .padStart(2, "0");
}

/**
 * 明度 0~1 → 暖调灰（旧银而非屏幕灰）。
 * R 略高 / B 略低，暖偏移量对齐既有色板（#ece5d6 的 B/R ≈ 0.91）——
 * 再暖就发黄了。
 */
function greyHex(l: number): string {
  const v = Math.max(0, Math.min(1, l)) * 255;
  return `#${hex2(v * 1.03 + 2)}${hex2(v)}${hex2(v * 0.93)}`;
}

/**
 * 把一个偏暗的原色提亮到可用作前景色的程度（保留色相/彩度关系）。
 * 用于「选中即回色」：卷宗与被选星辰的强调色回到角色本来的颜色。
 */
function boost(hex: string, target = 0.82): string {
  const h = hex.replace("#", "");
  const full =
    h.length === 3
      ? h
          .split("")
          .map((c) => c + c)
          .join("")
      : h;
  const c = [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16) / 255);
  const m = Math.max(c[0], c[1], c[2]) || 0.001;
  const f = m < target ? target / m : 1;
  return `#${c.map((v) => hex2(v * f * 255)).join("")}`;
}

/** 星图的中性框架灰（分簇辉光、卷宗外框、分隔线） */
const FRAME_INK = "#8b857c";

/** 单个角色的三种取色 */
interface CharTone {
  /** 结构色：边框 / 辉光 / 阴影。跨越 深灰 → 近白 */
  hex: string;
  /** 结构色的明度 0~1，用来驱动立绘的曝光，让暗色角色真的更暗 */
  l: number;
  /** 前景色：文字 / 细线。由结构色抬到可读下限 */
  ink: string;
  /** 原色（提亮版）：仅在该角色被选中时启用 */
  live: string;
}

/** 色调区间：0.22（深灰，几乎融进夜色）→ 0.95（近白） */
const TONE_LO = 0.22;
const TONE_HI = 0.95;

/**
 * 24 人的色调表。按源色亮度排名摊开到全区间——
 * 保留了「原本亮的角色依旧偏亮」的相对关系，但强制拉开绝对差距。
 */
const CHAR_TONE: Record<number, CharTone> = (() => {
  const ranked = CHARACTERS.map((c) => ({ id: c.id, color: c.color, l: lumaOf(c.color) })).sort(
    (a, b) => a.l - b.l || a.id - b.id,
  );
  const n = Math.max(1, ranked.length - 1);
  const out: Record<number, CharTone> = {};
  ranked.forEach((e, i) => {
    // 指数 0.86：让中低调多占一点篇幅，避免大半个名单挤在亮部
    const l = TONE_LO + (TONE_HI - TONE_LO) * Math.pow(i / n, 0.86);
    out[e.id] = {
      hex: greyHex(l),
      l,
      ink: greyHex(Math.max(0.66, l)),
      live: boost(e.color),
    };
  });
  return out;
})();

/** 角色的结构色（边框 / 辉光 / 阴影）——横跨深灰到近白 */
function charTone(c: { id: number }): string {
  return CHAR_TONE[c.id].hex;
}
/** 角色的前景色（文字 / 细线）——抬到可读下限，暗色角色也看得清名字 */
function charInk(c: { id: number }): string {
  return CHAR_TONE[c.id].ink;
}
/** 角色的原色（提亮版）——只在「被选中」时使用，其余一律灰 */
function charLive(c: { id: number }): string {
  return CHAR_TONE[c.id].live;
}
/** 角色色调的明度，用来推导立绘曝光 */
function charLuma(c: { id: number }): number {
  return CHAR_TONE[c.id].l;
}

/**
 * 星辰立绘的滤镜。
 *  · 选中 → 完全回色（grayscale 0），原画的颜色回到画面上
 *  · 其余 → 灰阶，且**曝光跟随该角色的色调**，于是暗调角色真的更暗
 */
function portraitFilter(c: { id: number }, opts: { live?: boolean; hot?: boolean }): string {
  if (opts.live) return "grayscale(0) contrast(1.06) brightness(1.04) saturate(1.08)";
  const l = charLuma(c);
  // 曝光跟着色调走：暗调角色真的更暗。上限 1.18，免得亮部糊成一片白
  const b = Math.min(1.18, (opts.hot ? 0.58 : 0.42) + l * (opts.hot ? 0.62 : 0.72));
  return `grayscale(${opts.hot ? 0.62 : 1}) contrast(${(1.04 + l * 0.1).toFixed(2)}) brightness(${b.toFixed(2)})`;
}

const RELATION_META: Record<
  RelationType,
  {
    label: string;
    en: string;
    color: string;
    lit: string;
    width: number;
    dash: string;
    glyph: string;
  }
> = {
  /* 由空间分簇派生的「同宫」关系。刻意不叫阵营——界面上不谈分类。 */
  faction: {
    label: "同宫",
    en: "HOUSE",
    color: "#6b6459",
    lit: "#efe7d6",
    width: 0.2,
    dash: "",
    glyph: "宫",
  },
  rival: {
    label: "敌对",
    color: "#7a3128",
    lit: "#e8735c",
    en: "RIVAL",
    width: 0.3,
    dash: "1.6 1.5",
    glyph: "仇",
  },
  ally: {
    label: "同盟",
    color: "#39685c",
    lit: "#6fc2aa",
    en: "ALLY",
    width: 0.26,
    dash: "",
    glyph: "盟",
  },
  blood: {
    label: "血缘",
    color: "#8a3a44",
    lit: "#e5808f",
    en: "BLOOD",
    width: 0.4,
    dash: "",
    glyph: "血",
  },
  master: {
    label: "师徒",
    color: "#7a6127",
    lit: "#f4cf72",
    en: "MASTER",
    width: 0.26,
    dash: "0.6 1.7",
    glyph: "承",
  },
  hidden: {
    label: "隐藏",
    color: "#4d3a6b",
    lit: "#ab8ede",
    en: "HIDDEN",
    width: 0.24,
    dash: "0.5 2.0",
    glyph: "秘",
  },
};

/** 卷宗内的分组顺序（血缘最重，同阵营垫底） */
const TYPE_ORDER: RelationType[] = ["blood", "rival", "master", "ally", "hidden", "faction"];
/** 图例 / 筛选栏的固定顺序 */
const ALL_TYPES: RelationType[] = ["faction", "blood", "rival", "ally", "master", "hidden"];

type TypeToggle = Record<RelationType, boolean>;
const ALL_TYPES_ON: TypeToggle = {
  faction: true,
  rival: true,
  ally: true,
  blood: true,
  master: true,
  hidden: true,
};

/** 羁绊强度 → 线宽倍率 / 基础透明度 */
const STRENGTH_WIDTH: Record<1 | 2 | 3, number> = { 1: 0.72, 2: 1.08, 3: 1.62 };
const STRENGTH_OPACITY: Record<1 | 2 | 3, number> = { 1: 0.46, 2: 0.7, 3: 0.94 };
const STRENGTH_LABEL: Record<1 | 2 | 3, string> = { 1: "I", 2: "II", 3: "III" };

const FACTION_RING: FactionCategory[] = [
  "ORDER",
  "SHADOW",
  "SEEKER",
  "TRANSCENDENT",
  "SANCTUARY",
  "COURIER",
];

/** 各阵营成员（按 CHARACTERS 顺序，决定星宫多边形的连边顺序） */
const FACTION_MEMBERS: Record<FactionCategory, number[]> = (() => {
  const m = {} as Record<FactionCategory, number[]>;
  FACTION_RING.forEach((c) => {
    m[c] = [];
  });
  CHARACTERS.forEach((c) => {
    m[CHAR_FACTION[c.id]].push(c.id);
  });
  return m;
})();

/** 每类丝线的总条数（同阵营 = 六个星宫的闭合边数） */
const TYPE_COUNTS: Record<RelationType, number> = (() => {
  const c: Record<RelationType, number> = {
    faction: 0,
    rival: 0,
    ally: 0,
    blood: 0,
    master: 0,
    hidden: 0,
  };
  RELATIONS.forEach((r) => {
    c[r.type] += 1;
  });
  c.faction = FACTION_RING.reduce((n, cat) => n + FACTION_MEMBERS[cat].length, 0);
  return c;
})();

/** 不含隐藏丝线的可见总数（读数分母） */
const TOTAL_THREADS: number = ALL_TYPES.filter((t) => t !== "hidden").reduce(
  (n, t) => n + TYPE_COUNTS[t],
  0,
);

/* ──────────────────────────────────────────────
   2. 关系索引（模块级预计算，render 期零遍历）
   ────────────────────────────────────────────── */

interface RelEntry {
  other: number;
  type: RelationType;
  strength: 1 | 2 | 3;
  note: string;
}

/** id → 全部羁绊（含派生的同阵营羁绊） */
const ADJACENCY: Map<number, RelEntry[]> = (() => {
  const map = new Map<number, RelEntry[]>();
  CHARACTERS.forEach((c) => map.set(c.id, []));
  CHARACTERS.forEach((c) => {
    const cat = CHAR_FACTION[c.id];
    FACTION_MEMBERS[cat].forEach((other) => {
      if (other === c.id) return;
      map.get(c.id)!.push({
        other,
        type: "faction",
        strength: 2,
        note: "同处一座星宫，命途相邻，共守一域星火。",
      });
    });
  });
  RELATIONS.forEach((r) => {
    map.get(r.a)!.push({ other: r.b, type: r.type, strength: r.strength, note: r.note });
    map.get(r.b)!.push({ other: r.a, type: r.type, strength: r.strength, note: r.note });
  });
  return map;
})();

function relationsOf(id: number, typeOn?: TypeToggle): RelEntry[] {
  const all = ADJACENCY.get(id) ?? [];
  return typeOn ? all.filter((r) => typeOn[r.type]) : all;
}

/** 邻接集合缓存：key = id + 类型开关位掩码 */
const NEIGHBOR_CACHE = new Map<string, Set<number>>();
function neighborIds(id: number, typeOn: TypeToggle): Set<number> {
  const mask = ALL_TYPES.map((t) => (typeOn[t] ? "1" : "0")).join("");
  const key = `${id}:${mask}`;
  const hit = NEIGHBOR_CACHE.get(key);
  if (hit) return hit;
  const set = new Set<number>();
  relationsOf(id, typeOn).forEach((r) => set.add(r.other));
  NEIGHBOR_CACHE.set(key, set);
  return set;
}

const CHAR_BY_ID: Map<number, CharacterDef> = new Map(CHARACTERS.map((c) => [c.id, c]));
const getChar = (id: number): CharacterDef => CHAR_BY_ID.get(id)!;

/* ──────────────────────────────────────────────
   2b. 检索
   ----------------------------------------------
   取代了原先的「六阵营筛选轨」。检索命中的星辰保持点亮，其余沉入暗处——
   信息量比按分类过滤大得多，也不用在界面上摆出一套分类词汇。
   ────────────────────────────────────────────── */

/** null = 未检索（全部可见）；否则为命中的角色 id 集合 */
type MatchSet = Set<number> | null;

function matchCharacters(raw: string): MatchSet {
  const q = raw.trim().toLowerCase();
  if (!q) return null;
  const hit = new Set<number>();
  CHARACTERS.forEach((c) => {
    const hay = `${c.id} ${c.name} ${c.ability} ${c.quote} ${c.desc} ${c.skills
      .map((s) => `${s.name} ${s.desc}`)
      .join(" ")}`.toLowerCase();
    if (hay.includes(q)) hit.add(c.id);
  });
  return hit;
}

const inMatch = (m: MatchSet, id: number): boolean => m == null || m.has(id);

/** 当前筛选下的可见数量读数 */
interface GraphStats {
  chars: number;
  threads: number;
  hidden: number;
}

function computeStats(match: MatchSet, typeOn: TypeToggle): GraphStats {
  let threads = 0;
  let hidden = 0;
  RELATIONS.forEach((r) => {
    if (!typeOn[r.type]) return;
    if (!inMatch(match, r.a) && !inMatch(match, r.b)) return;
    if (r.type === "hidden") hidden += 1;
    else threads += 1;
  });
  if (typeOn.faction) {
    FACTION_RING.forEach((cat) => {
      const mem = FACTION_MEMBERS[cat];
      if (mem.some((id) => inMatch(match, id))) threads += mem.length;
    });
  }
  return { chars: match ? match.size : CHARACTERS.length, threads, hidden };
}

/* ──────────────────────────────────────────────
   3. 星图布局求解器
   ──────────────────────────────────────────────
   坐标一律用「单位坐标」u ∈ [0,1]²，渲染时：
     · HTML 节点  → left: ux*100%  top: uy*100%
     · SVG        → viewBox "0 0 VW 100"，VW = 100 * 容器长宽比
   于是 SVG 用户单位是「正方」的：线宽、虚线、圆弧都不会被拉扁，
   同时 HTML 与 SVG 严格共享同一坐标系。
   ────────────────────────────────────────────── */

function hash(n: number): number {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}
function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

interface NodeLayout {
  /** 单位坐标 0..1 */
  ux: number;
  uy: number;
  /** 图坐标（SVG 用户单位，y ∈ 0..100，x ∈ 0..VW） */
  gx: number;
  gy: number;
  /** 名签方向：名字在星辰下方还是上方 */
  labelAbove: boolean;
}

interface Layout {
  /** SVG viewBox 宽度（高度恒为 100） */
  vw: number;
  /** 星辰直径（px） */
  nodePx: number;
  /** 星辰直径（图单位） */
  d: number;
  /** 星宫半径（图单位） */
  cr: number;
  nodes: Record<number, NodeLayout>;
  centers: Record<FactionCategory, { gx: number; gy: number; ux: number; uy: number }>;
}

/**
 * 六角星宫布局 + 松弛排斥。
 * 输出保证：任意长宽比下星辰间距 ≥ 1.34 × 直径，且全部落在安全内边距内。
 */
function buildLayout(boxW: number, boxH: number): Layout {
  const aspect = boxW / boxH;
  const vw = 100 * aspect;

  // 星辰直径：跟随容器短边，但夹在可点击（26px）与不臃肿（52px）之间
  const nodePx = clamp(Math.min(boxW, boxH) * 0.076, 26, 52);
  const d = (nodePx * 100) / boxH; // 图单位

  const padX = d * 0.95;
  const padT = d * 0.8;
  const padB = d * 1.25; // 下方留给名签
  const ax = vw / 2 - padX;
  const ay = (100 - padT - padB) / 2;
  const cy = padT + ay;
  const cr = clamp(Math.min(ax, ay) * 0.34, d * 1.25, d * 2.7);
  const rx = Math.max(cr * 0.6, ax - cr);
  const ry = Math.max(cr * 0.6, ay - cr);

  const centers = {} as Layout["centers"];
  const pos: Record<number, { x: number; y: number }> = {};
  const home: Record<number, { x: number; y: number }> = {};

  FACTION_RING.forEach((cat, ci) => {
    const a = ((-90 + ci * 60) * Math.PI) / 180;
    const cxc = vw / 2 + rx * Math.cos(a);
    const cyc = cy + ry * Math.sin(a);
    centers[cat] = { gx: cxc, gy: cyc, ux: cxc / vw, uy: cyc / 100 };
    const mem = FACTION_MEMBERS[cat];
    mem.forEach((id, mi) => {
      // 起始角对齐星宫朝向，四人成菱，叠加确定性抖动
      const ang = a + Math.PI * 0.25 + (mi / mem.length) * Math.PI * 2 + (hash(id) - 0.5) * 0.35;
      const r = cr * (0.86 + hash(id * 3.7) * 0.3);
      pos[id] = { x: cxc + Math.cos(ang) * r, y: cyc + Math.sin(ang) * r };
      home[id] = { ...pos[id] };
    });
  });

  // 松弛：圆形排斥 + 竖直方向额外让位（名签占高）+ 回弹到原位 + 边界收束
  const ids = CHARACTERS.map((c) => c.id);
  const minSep = d * 1.48;
  const minSepY = d * 1.45;
  for (let it = 0; it < 64; it++) {
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const A = pos[ids[i]];
        const B = pos[ids[j]];
        const dx = B.x - A.x;
        const dy = B.y - A.y;
        const dist = Math.hypot(dx, dy) || 0.001;
        if (dist < minSep) {
          const push = ((minSep - dist) / 2) * 0.55;
          const ux = dx / dist;
          const uy = dy / dist;
          A.x -= ux * push;
          A.y -= uy * push;
          B.x += ux * push;
          B.y += uy * push;
        } else if (Math.abs(dx) < d * 0.95 && Math.abs(dy) < minSepY) {
          const push = ((minSepY - Math.abs(dy)) / 2) * 0.4 * (dy >= 0 ? 1 : -1);
          A.y -= push;
          B.y += push;
        }
      }
    }
    ids.forEach((id) => {
      const p = pos[id];
      const h = home[id];
      p.x += (h.x - p.x) * 0.06;
      p.y += (h.y - p.y) * 0.06;
      p.x = clamp(p.x, padX, vw - padX);
      p.y = clamp(p.y, padT, 100 - padB);
    });
  }

  // 名签方向：默认在下，若正下方被别的星辰占住则翻到上方
  const nodes: Record<number, NodeLayout> = {};
  ids.forEach((id) => {
    const p = pos[id];
    const blocked = (sign: 1 | -1) =>
      ids.some((o) => {
        if (o === id) return false;
        const q = pos[o];
        const dy = (q.y - p.y) * sign;
        return Math.abs(q.x - p.x) < d * 0.92 && dy > 0 && dy < d * 1.45;
      });
    // 默认在下（padB 已为名签预留高度）；仅当正下方被占且上方既空又够高才翻上
    let labelAbove = blocked(1);
    if (labelAbove && (blocked(-1) || p.y < padT + d * 0.75)) labelAbove = false;
    nodes[id] = { ux: p.x / vw, uy: p.y / 100, gx: p.x, gy: p.y, labelAbove };
  });

  return { vw, nodePx, d, cr, nodes, centers };
}

/** 二次贝塞尔：给丝线一点弧度（图单位是正方的，直接算法线即可） */
function curvedPath(ax: number, ay: number, bx: number, by: number, bow: number): string {
  const mx = (ax + bx) / 2;
  const my = (ay + by) / 2;
  const dx = bx - ax;
  const dy = by - ay;
  const len = Math.hypot(dx, dy) || 1;
  const cx = mx + (-dy / len) * bow;
  const cyy = my + (dx / len) * bow;
  return `M ${ax.toFixed(2)} ${ay.toFixed(2)} Q ${cx.toFixed(2)} ${cyy.toFixed(2)} ${bx.toFixed(2)} ${by.toFixed(2)}`;
}

/** 星宫多边形（闭合），四点用轻微外扩的圆角折线 */
function polyPath(pts: { gx: number; gy: number }[]): string {
  if (pts.length === 0) return "";
  return (
    pts.map((p, i) => `${i === 0 ? "M" : "L"} ${p.gx.toFixed(2)} ${p.gy.toFixed(2)}`).join(" ") +
    " Z"
  );
}

/* ──────────────────────────────────────────────
   4. 动效样式（组件自带，避免污染全局 index.css）
   ────────────────────────────────────────────── */

/** 虚线循环周期（奇数段数需要走两轮才能无缝衔接） */
function dashPeriod(dash: string): number {
  if (!dash) return 0;
  const parts = dash
    .split(/[\s,]+/)
    .map(Number)
    .filter((n) => !Number.isNaN(n));
  if (parts.length === 0) return 0;
  const sum = parts.reduce((a, b) => a + b, 0);
  return parts.length % 2 === 1 ? sum * 2 : sum;
}

/** 丝线流速（图单位/秒）：静息缓流，点亮时加速 */
function flowDuration(type: RelationType, lit: boolean): number {
  const travel = dashPeriod(RELATION_META[type].dash) * 4;
  return travel / (lit ? 11 : 3.2);
}

const FLOW_CSS: string = ALL_TYPES.filter((t) => RELATION_META[t].dash)
  .map((t) => {
    const travel = dashPeriod(RELATION_META[t].dash) * 4;
    // SVG 内 1 CSS px === 1 用户单位；带单位书写以免被判无效
    return `@keyframes cg-flow-${t}{from{stroke-dashoffset:0px}to{stroke-dashoffset:${(-travel).toFixed(2)}px}}`;
  })
  .join("");

const CG_CSS = `
${FLOW_CSS}
@keyframes cg-twinkle{0%,100%{opacity:var(--o0,.18)}50%{opacity:var(--o1,.9)}}
@keyframes cg-spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
@keyframes cg-spin-rev{from{transform:rotate(0deg)}to{transform:rotate(-360deg)}}
@keyframes cg-drift{0%,100%{transform:translate3d(0,0,0)}
  34%{transform:translate3d(var(--dx),var(--dy),0)}
  67%{transform:translate3d(calc(var(--dx) * -0.7),calc(var(--dy) * -0.55),0)}}
@keyframes cg-breathe{0%,100%{opacity:.4;transform:scale(1)}50%{opacity:.8;transform:scale(1.1)}}
@keyframes cg-nebula{0%,100%{transform:translate3d(0,0,0) scale(1)}50%{transform:translate3d(2.5%,-2%,0) scale(1.09)}}
@keyframes cg-halo{0%{transform:scale(.9);opacity:.5}100%{transform:scale(2.05);opacity:0}}
@keyframes cg-sheen{0%{transform:translateX(-160%) skewX(-16deg)}100%{transform:translateX(280%) skewX(-16deg)}}
@keyframes cg-scanline{from{transform:translateY(-100%)}to{transform:translateY(1200%)}}
.cg-node-btn{-webkit-tap-highlight-color:transparent;touch-action:manipulation}
.cg-rail::-webkit-scrollbar{height:0;width:0}
.cg-search::placeholder{color:#5f584d;letter-spacing:.06em}
.cg-search::-webkit-search-cancel-button{display:none}
@media (prefers-reduced-motion: reduce){
  .cg-drift,.cg-spin,.cg-spin-rev,.cg-twinkle,.cg-nebula,.cg-halo,.cg-sheen{animation:none !important}
}
`;

/* ──────────────────────────────────────────────
   5. 通用 hooks
   ────────────────────────────────────────────── */

function useMediaQuery(query: string): boolean {
  const [match, setMatch] = useState(
    () => typeof window !== "undefined" && window.matchMedia(query).matches,
  );
  useEffect(() => {
    const mq = window.matchMedia(query);
    const update = () => setMatch(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, [query]);
  return match;
}

/** 量测容器尺寸：rAF 合帧 + 阈值去抖，resize 才 re-render */
function useBoxSize(ref: React.RefObject<HTMLElement | null>): { w: number; h: number } {
  const [box, setBox] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let raf = 0;
    const ro = new ResizeObserver((entries) => {
      const r = entries[0].contentRect;
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        setBox((prev) =>
          Math.abs(prev.w - r.width) < 1 && Math.abs(prev.h - r.height) < 1
            ? prev
            : { w: r.width, h: r.height },
        );
      });
    });
    ro.observe(el);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [ref]);
  return box;
}

/* ──────────────────────────────────────────────
   6. 背景：星云 / 三层视差星野 / 星盘 / 暗角
   ────────────────────────────────────────────── */

interface StarSpec {
  x: number;
  y: number;
  s: number;
  o0: number;
  o1: number;
  dur: number;
  delay: number;
  gold: boolean;
}

/** 三层深度的星野，模块级生成一次 */
const STAR_LAYERS: StarSpec[][] = [0, 1, 2].map((layer) => {
  const count = [54, 34, 18][layer];
  return Array.from({ length: count }, (_, i) => {
    const k = layer * 977 + i * 13.37;
    const near = layer / 2; // 0 远 → 1 近
    return {
      x: hash(k + 1.1) * 100,
      y: hash(k + 7.7) * 100,
      s: 0.7 + near * 1.5 + hash(k + 3.3) * (0.7 + near),
      o0: 0.06 + near * 0.1,
      o1: 0.35 + near * 0.5,
      dur: 2.4 + hash(k + 5.5) * 4.5,
      delay: hash(k + 9.9) * 5,
      gold: hash(k + 2.2) > 0.82,
    };
  });
});

const NEBULAE = [
  { x: 22, y: 26, r: 46, c: "rgba(120,84,24,0.20)", d: 34 },
  { x: 78, y: 32, r: 40, c: "rgba(70,42,96,0.16)", d: 44 },
  { x: 64, y: 78, r: 52, c: "rgba(96,30,30,0.13)", d: 52 },
  { x: 30, y: 74, r: 38, c: "rgba(32,72,86,0.13)", d: 38 },
];

const Backdrop = memo(function Backdrop({ reduce }: { reduce: boolean }) {
  // 指针视差：MotionValue 直驱 transform，全程零 re-render
  const mx = useMotionValue(0);
  const my = useMotionValue(0);
  const ax = useMotionValue(-9999);
  const ay = useMotionValue(-9999);
  const sx = useSpring(mx, { stiffness: 42, damping: 18, mass: 0.7 });
  const sy = useSpring(my, { stiffness: 42, damping: 18, mass: 0.7 });
  const sax = useSpring(ax, { stiffness: 90, damping: 22, mass: 0.5 });
  const say = useSpring(ay, { stiffness: 90, damping: 22, mass: 0.5 });

  useEffect(() => {
    if (reduce) return;
    const onMove = (e: PointerEvent) => {
      mx.set(e.clientX / window.innerWidth - 0.5);
      my.set(e.clientY / window.innerHeight - 0.5);
      ax.set(e.clientX);
      ay.set(e.clientY);
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => window.removeEventListener("pointermove", onMove);
  }, [mx, my, ax, ay, reduce]);

  const farX = useTransform(sx, (v) => v * -10);
  const farY = useTransform(sy, (v) => v * -8);
  const midX = useTransform(sx, (v) => v * -26);
  const midY = useTransform(sy, (v) => v * -20);
  const nearX = useTransform(sx, (v) => v * -52);
  const nearY = useTransform(sy, (v) => v * -40);
  const dialX = useTransform(sx, (v) => v * 22);
  const dialY = useTransform(sy, (v) => v * 18);
  const layerT = [
    { x: farX, y: farY },
    { x: midX, y: midY },
    { x: nearX, y: nearY },
  ];

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden">
      {/* 底：深空渐变。
          必须是**半透明**的——旧版这里是一层不透明渐变，直接把下面的阵法底图
          整个盖死，于是「阵法看不见」。改成 rgba 之后阵法才透得上来。 */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 120% 90% at 50% 42%, rgba(27,22,17,0.72) 0%, rgba(14,11,8,0.8) 44%, rgba(6,4,2,0.9) 78%, rgba(3,2,1,0.94) 100%)",
        }}
      />
      {/* 阵法底图。
          之前它按 opacity 0.55 + brightness 1.7 压在这里，结果是喧宾夺主：
          那张图本身就是一幅**满是细线的曼陀罗**，明度和线宽都跟星辰与丝线
          处在同一档，于是 24 颗星、42 条丝线全部沉进它的线阵里 ——
          这正是这一屏"看起来什么都有、其实什么都看不清"的根源。
          底图退到 0.16，只负责给出圆形构图与纹理；主角让给星辰。 */}
      <div
        className="absolute inset-0"
        style={{
          backgroundImage: `url(${assetUrl("images/formation_bg.jpg")})`,
          backgroundSize: "cover",
          backgroundPosition: "center",
          filter: "grayscale(1) brightness(1.25) contrast(1.15)",
          opacity: 0.16,
        }}
      />
      {/* 中心压暗：星辰与丝线集中在中央，那里必须是全屏最干净的一块 */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 62% 58% at 50% 47%, rgba(3,2,1,0.72) 0%, rgba(3,2,1,0.34) 52%, transparent 78%)",
        }}
      />
      {/* 星云团 */}
      {NEBULAE.map((n, i) => (
        <div
          key={i}
          className={reduce ? "absolute" : "absolute cg-nebula"}
          style={{
            left: `${n.x}%`,
            top: `${n.y}%`,
            width: `${n.r}vmax`,
            height: `${n.r}vmax`,
            marginLeft: `${-n.r / 2}vmax`,
            marginTop: `${-n.r / 2}vmax`,
            background: `radial-gradient(circle, ${n.c} 0%, transparent 68%)`,
            filter: "blur(28px)",
            animation: reduce ? undefined : `cg-nebula ${n.d}s ease-in-out ${i * 3}s infinite`,
          }}
        />
      ))}
      {/* 三层视差星野 */}
      {STAR_LAYERS.map((layer, li) => (
        <motion.div
          key={li}
          className="absolute -inset-8"
          style={{ x: layerT[li].x, y: layerT[li].y }}
        >
          {layer.map((s, i) => (
            <span
              key={i}
              className={reduce ? "absolute rounded-full" : "absolute rounded-full cg-twinkle"}
              style={{
                left: `${s.x}%`,
                top: `${s.y}%`,
                width: s.s,
                height: s.s,
                background: s.gold ? "#ece5d6" : "#dcd3bd",
                boxShadow: `0 0 ${s.s * 3.5}px ${s.gold ? "rgba(240,200,98,0.7)" : "rgba(201,184,150,0.5)"}`,
                opacity: reduce ? s.o1 * 0.7 : undefined,
                animation: reduce
                  ? undefined
                  : `cg-twinkle ${s.dur}s ease-in-out ${s.delay}s infinite`,
                ["--o0" as string]: s.o0,
                ["--o1" as string]: s.o1,
              }}
            />
          ))}
        </motion.div>
      ))}
      {/* 星盘：双环反向自转 */}
      <motion.div
        className="absolute top-1/2 left-1/2"
        style={{
          x: dialX,
          y: dialY,
          width: "min(760px, 96vw, 96vh)",
          height: "min(760px, 96vw, 96vh)",
          marginLeft: "calc(min(760px, 96vw, 96vh) / -2)",
          marginTop: "calc(min(760px, 96vw, 96vh) / -2)",
        }}
      >
        <motion.svg
          viewBox="0 0 200 200"
          className="absolute inset-0 w-full h-full"
          /* 阵法底图已经提供了圆形构图，星盘退到极淡，只做缓慢的转动感 */
          initial={{ opacity: 0, scale: 0.86, rotate: -14 }}
          animate={{ opacity: 0.1, scale: 1, rotate: 0 }}
          transition={{ duration: 2.4, ease: [0.16, 1, 0.3, 1] }}
        >
          <g
            className={reduce ? undefined : "cg-spin"}
            style={{
              transformOrigin: "100px 100px",
              animation: reduce ? undefined : "cg-spin 220s linear infinite",
            }}
          >
            <circle cx="100" cy="100" r="96" fill="none" stroke="#918a80" strokeWidth="0.35" />
            <circle
              cx="100"
              cy="100"
              r="90"
              fill="none"
              stroke="#918a80"
              strokeWidth="0.15"
              strokeDasharray="0.6 2.4"
            />
            {Array.from({ length: 36 }).map((_, i) => (
              <line
                key={i}
                x1="100"
                y1="4"
                x2="100"
                y2={i % 3 === 0 ? 14 : 9}
                transform={`rotate(${i * 10} 100 100)`}
                stroke="#918a80"
                strokeWidth="0.3"
              />
            ))}
          </g>
          <g
            style={{
              transformOrigin: "100px 100px",
              animation: reduce ? undefined : "cg-spin-rev 320s linear infinite",
            }}
          >
            <circle cx="100" cy="100" r="72" fill="none" stroke="#8b857c" strokeWidth="0.25" />
            <circle
              cx="100"
              cy="100"
              r="50"
              fill="none"
              stroke="#8b857c"
              strokeWidth="0.2"
              strokeDasharray="3 3"
            />
            {Array.from({ length: 6 }).map((_, i) => (
              <line
                key={i}
                x1={100 + 72 * Math.cos(((i * 60 - 90) * Math.PI) / 180)}
                y1={100 + 72 * Math.sin(((i * 60 - 90) * Math.PI) / 180)}
                x2={100 + 72 * Math.cos(((i * 60 + 90) * Math.PI) / 180)}
                y2={100 + 72 * Math.sin(((i * 60 + 90) * Math.PI) / 180)}
                stroke="#8b857c"
                strokeWidth="0.18"
              />
            ))}
          </g>
        </motion.svg>
      </motion.div>
      {/* 指针光晕：定尺寸图层 + transform 位移，避免每帧重绘全屏渐变 */}
      {!reduce && (
        <motion.div
          className="absolute top-0 left-0"
          style={{
            x: sax,
            y: say,
            width: "58vmax",
            height: "58vmax",
            marginLeft: "-29vmax",
            marginTop: "-29vmax",
            background:
              "radial-gradient(circle, rgba(200,160,67,0.075) 0%, rgba(200,160,67,0.028) 34%, transparent 64%)",
          }}
        />
      )}
      {/* 羊皮纹理 + 暗角 */}
      <div
        className="absolute inset-0 opacity-[0.05]"
        style={{
          backgroundImage: `url(${assetUrl("textures/parchment.jpg")})`,
          backgroundSize: "cover",
          mixBlendMode: "overlay",
        }}
      />
      {/* 暗角：只收边，不再压住画面中央的阵法 */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 92% 88% at 50% 48%, transparent 52%, rgba(3,2,1,0.32) 82%, rgba(0,0,0,0.72) 100%)",
        }}
      />
    </div>
  );
});

/* ──────────────────────────────────────────────
   7. 主组件
   ────────────────────────────────────────────── */

/** 入场时间轴（秒） */
const T_POLY = 0.5;
const T_NODE = 0.72;
const T_EDGE = 1.3;
const T_UI = 0.2;
const ENTER_MS = 3000;

/** 卷宗与视口之间的留白：面板是「浮起来的一块牌」，不焊死在屏幕边缘 */
const DOSSIER_GAP = 16;
const SHEET_GAP = 8;

export default function CharacterGallery({ onBack }: { onBack: () => void }) {
  const [focusedId, setFocusedId] = useState<number | null>(null);
  const [hoveredId, setHoveredId] = useState<number | null>(null);
  const [query, setQuery] = useState("");
  const [typeOn, setTypeOn] = useState<TypeToggle>(ALL_TYPES_ON);
  const [diveId, setDiveId] = useState<number | null>(null);

  const reduce = !!useReducedMotion();
  const [entered, setEntered] = useState(reduce);
  useEffect(() => {
    if (reduce) return;
    const t = window.setTimeout(() => setEntered(true), ENTER_MS);
    return () => window.clearTimeout(t);
  }, [reduce]);

  const sheetMode = useMediaQuery("(max-width: 899px)");
  const compact = useMediaQuery("(max-width: 719px)");

  const mapRef = useRef<HTMLDivElement>(null);
  const box = useBoxSize(mapRef);

  // 量测量化到 8px，避免拖拽窗口时反复求解布局
  const qw = Math.round(box.w / 8) * 8;
  const qh = Math.round(box.h / 8) * 8;
  const layout = useMemo(() => (qw > 40 && qh > 40 ? buildLayout(qw, qh) : null), [qw, qh]);

  // 激活节点：聚焦优先，否则悬停
  const activeId = focusedId ?? hoveredId;
  const neighbors = useMemo(
    () => (activeId != null ? neighborIds(activeId, typeOn) : new Set<number>()),
    [activeId, typeOn],
  );

  const match = useMemo(() => matchCharacters(query), [query]);
  const stats = useMemo(() => computeStats(match, typeOn), [match, typeOn]);
  const allTypesOn = ALL_TYPES.every((t) => typeOn[t]);
  const filtered = match != null || !allTypesOn;

  const resetFilters = useCallback(() => {
    setQuery("");
    setTypeOn(ALL_TYPES_ON);
  }, []);

  // Esc：先解除聚焦，其次复位筛选
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (diveId != null) return; // 3D 卷轴自行处理
      if (focusedId != null) {
        playSound("click");
        setFocusedId(null);
      } else if (filtered) {
        playSound("click");
        resetFilters();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [focusedId, filtered, diveId, resetFilters]);

  const focusChar = focusedId != null ? getChar(focusedId) : null;
  const diveChar = diveId != null ? getChar(diveId) : null;

  const selectNode = useCallback((id: number) => {
    playSound("select");
    setFocusedId(id);
    setHoveredId(null);
  }, []);

  const hoverNode = useCallback((id: number, on: boolean) => {
    if (on) {
      playSound("hover");
      setHoveredId(id);
    } else {
      setHoveredId((prev) => (prev === id ? null : prev));
    }
  }, []);

  const toggleType = useCallback((t: RelationType) => {
    playSound("click");
    setTypeOn((prev) => ({ ...prev, [t]: !prev[t] }));
  }, []);

  /* ── 运镜：聚焦即推近该星辰，并把它让到卷宗之外的空档里 ── */
  // 立绘放大后需要更宽的版面
  const dossierW = Math.round(clamp(box.w * 0.36, 320, 500));
  const sheetH = Math.round(clamp(box.h * 0.66, 240, 520));
  const cam = useMemo(() => {
    if (!layout || box.w < 40) return { x: 0, y: 0, s: 1 };
    const focusOn = (ux: number, uy: number, s: number, panelW: number, panelH: number) => {
      // 卷宗浮在右侧 / 移动端浮在下方，可用区域的中心相应往左、往上偏
      const freeX = (box.w - panelW) / 2;
      const freeY = (box.h - panelH) / 2;
      const limX = (box.w * (s - 1)) / 2;
      const limY = (box.h * (s - 1)) / 2;
      return {
        x: clamp(freeX - box.w / 2 - (ux * box.w - box.w / 2) * s, -limX - panelW, limX),
        y: clamp(freeY - box.h / 2 - (uy * box.h - box.h / 2) * s, -limY - panelH, limY),
        s,
      };
    };
    if (focusedId != null && layout.nodes[focusedId]) {
      const n = layout.nodes[focusedId];
      // 面板本身留了外边距，让位宽度要把留白一起算进去
      return focusOn(
        n.ux,
        n.uy,
        1.26,
        sheetMode ? 0 : dossierW + DOSSIER_GAP * 2,
        sheetMode ? sheetH + SHEET_GAP * 2 : 0,
      );
    }
    return { x: 0, y: 0, s: 1 };
  }, [layout, focusedId, box.w, box.h, sheetMode, dossierW, sheetH]);

  return (
    <div
      className="fixed inset-0 overflow-hidden flex flex-col select-none"
      style={{ background: "#050301" }}
    >
      <style>{CG_CSS}</style>

      {/* 阵法底图在 Backdrop 内部——它必须叠在深空渐变之上，
          否则会被那层渐变整个盖掉（这正是旧版「看不见阵法」的原因）。 */}
      <Backdrop reduce={reduce} />

      {/* ══ 标题栏 ══ */}
      <motion.header
        initial={{ opacity: 0, y: -16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, delay: reduce ? 0 : T_UI, ease: [0.16, 1, 0.3, 1] }}
        className="relative z-30 shrink-0 flex items-center gap-2 sm:gap-4 px-3 sm:px-5 md:px-7 pt-2 sm:pt-3"
      >
        <button
          onClick={() => {
            playSound("click");
            onBack();
          }}
          className="group shrink-0 flex items-center gap-1.5 px-2 py-1.5 rounded transition-colors hover:bg-[#918a80]/10"
          aria-label="返回主菜单"
        >
          <IconExit size={13} color="#c9b896" />
          <span className="hidden sm:inline font-cinzel text-[10px] tracking-[0.28em] text-[#c9b896] group-hover:text-[#ece5d6] transition-colors">
            BACK
          </span>
        </button>

        <div className="flex-1 min-w-0 text-center">
          <motion.h2
            initial={{ opacity: 0, scale: 0.92, filter: "blur(6px)" }}
            animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
            transition={{ duration: 1.1, delay: reduce ? 0 : 0.15, ease: [0.16, 1, 0.3, 1] }}
            className="font-caoshu leading-none"
            style={{
              fontSize: "clamp(26px, 4.4vw, 52px)",
              background: "linear-gradient(180deg,#f5ecd6 0%,#e8dfc8 38%,#918a80 100%)",
              WebkitBackgroundClip: "text",
              backgroundClip: "text",
              color: "transparent",
              textShadow: "0 0 34px rgba(200,160,67,0.22)",
            }}
          >
            人物图谱
          </motion.h2>
          <div className="flex items-center justify-center gap-2 md:gap-3 mt-1">
            <motion.span
              initial={{ scaleX: 0 }}
              animate={{ scaleX: 1 }}
              transition={{ duration: 0.9, delay: reduce ? 0 : 0.45 }}
              className="block w-5 sm:w-10 md:w-20 h-px origin-right"
              style={{ background: "linear-gradient(90deg, transparent, #918a80)" }}
            />
            <span className="font-cinzel text-[7px] sm:text-[9px] text-[#918a80] tracking-[0.3em] sm:tracking-[0.44em] whitespace-nowrap">
              CONSTELLATION OF FATES
            </span>
            <motion.span
              initial={{ scaleX: 0 }}
              animate={{ scaleX: 1 }}
              transition={{ duration: 0.9, delay: reduce ? 0 : 0.45 }}
              className="block w-5 sm:w-10 md:w-20 h-px origin-left"
              style={{ background: "linear-gradient(270deg, transparent, #918a80)" }}
            />
          </div>
        </div>

        <div className="shrink-0 flex items-center gap-2 sm:gap-3 md:gap-4">
          <StatReadout
            value={stats.chars}
            total={CHARACTERS.length}
            label="星辰"
            en="STARS"
            color="#e8dfc8"
          />
          <StatReadout
            value={stats.threads}
            total={TOTAL_THREADS}
            label="丝线"
            en="THREADS"
            color="#bdb6a8"
          />
          {!compact && (
            <StatReadout
              value={stats.hidden}
              label="秘线"
              en="VEILED"
              color="#c9c4bc"
              muted
              title="隐藏羁绊：聚焦或悬停其两端方可显现"
            />
          )}
        </div>
      </motion.header>

      {/* ══ 控制轨：检索 + 丝线 ══
          （旧版这里是六阵营筛选轨——分类不再出现在界面上，换成更实用的检索） */}
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: reduce ? 0 : T_UI + 0.15 }}
        className="relative z-30 shrink-0 mt-1.5 sm:mt-2 px-2 sm:px-4 flex flex-wrap items-center justify-center gap-x-3 gap-y-1.5"
      >
        <SearchField
          value={query}
          hits={match ? match.size : null}
          onChange={setQuery}
          onClear={() => {
            playSound("click");
            setQuery("");
          }}
        />
        <ThreadRail
          typeOn={typeOn}
          onToggle={toggleType}
          onReset={() => {
            playSound("click");
            setTypeOn(ALL_TYPES_ON);
          }}
          allOn={allTypesOn}
          compact={compact}
        />
        <AnimatePresence>
          {filtered && (
            <motion.button
              key="reset"
              initial={{ opacity: 0, width: 0 }}
              animate={{ opacity: 1, width: "auto" }}
              exit={{ opacity: 0, width: 0 }}
              onClick={() => {
                playSound("click");
                resetFilters();
              }}
              className="overflow-hidden whitespace-nowrap shrink-0 px-2.5 py-1 rounded-full font-cinzel text-[9px] tracking-[0.2em] transition-colors"
              style={{
                border: "1px solid rgba(138,32,32,0.5)",
                color: "#c9b896",
                background: "rgba(138,32,32,0.1)",
              }}
            >
              RESET ✕
            </motion.button>
          )}
        </AnimatePresence>
      </motion.div>

      {/* ══ 星图 ══ */}
      <div
        ref={mapRef}
        className="relative z-10 flex-1 min-h-0 overflow-hidden mt-1 sm:mt-2 mx-1 sm:mx-3 md:mx-5"
        onPointerDown={(e) => {
          if (e.target === e.currentTarget || (e.target as HTMLElement).dataset.cgVoid === "1") {
            if (focusedId != null) {
              playSound("click");
              setFocusedId(null);
            }
          }
        }}
      >
        {layout && (
          <>
            <motion.div
              className="absolute inset-0"
              data-cg-void="1"
              animate={{ x: cam.x, y: cam.y, scale: cam.s }}
              transition={{ type: "spring", stiffness: 96, damping: 20, mass: 0.9 }}
              style={{ transformOrigin: "center center", willChange: "transform" }}
            >
              {/* 星宫辉光：无字、无徽记，纯粹给六个分簇一点空间上的体积感 */}
              {FACTION_RING.map((cat, ci) => (
                <ClusterAura
                  key={cat}
                  cat={cat}
                  layout={layout}
                  dim={match != null && !FACTION_MEMBERS[cat].some((id) => match.has(id))}
                  lit={activeId != null && CHAR_FACTION[activeId] === cat}
                  faded={activeId != null && CHAR_FACTION[activeId] !== cat}
                  delay={reduce ? 0 : T_POLY + ci * 0.09}
                  reduce={reduce}
                />
              ))}

              {/* 命运丝线 */}
              <ThreadCanvas
                layout={layout}
                activeId={activeId}
                match={match}
                typeOn={typeOn}
                entered={entered}
                reduce={reduce}
              />

              {/* 聚焦暗场：焦点之外沉入黑暗 */}
              <AnimatePresence>
                {focusedId != null && layout.nodes[focusedId] && (
                  <motion.div
                    key="focus-veil"
                    className="absolute inset-0 pointer-events-none"
                    style={{
                      zIndex: 1,
                      background: `radial-gradient(circle at ${(layout.nodes[focusedId].ux * 100).toFixed(1)}% ${(layout.nodes[focusedId].uy * 100).toFixed(1)}%, transparent 0%, transparent 18%, rgba(3,2,1,0.55) 48%, rgba(0,0,0,0.86) 86%)`,
                    }}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.55 }}
                  />
                )}
              </AnimatePresence>

              {/* 星辰 */}
              {FACTION_RING.map((cat, ci) =>
                FACTION_MEMBERS[cat].map((id, mi) => {
                  const ch = getChar(id);
                  const n = layout.nodes[id];
                  const isActive = activeId === id;
                  const isNeighbor = activeId != null && !isActive && neighbors.has(id);
                  const searchOut = !inMatch(match, id);
                  let state: NodeState = "idle";
                  if (isActive) state = "active";
                  else if (searchOut) state = "dim";
                  else if (isNeighbor) state = "neighbor";
                  else if (activeId != null) state = "recede";
                  const relType = isNeighbor ? strongestRelation(activeId!, id, typeOn) : null;
                  return (
                    <StarNode
                      key={id}
                      ch={ch}
                      n={n}
                      nodePx={layout.nodePx}
                      state={state}
                      relType={relType}
                      focused={focusedId === id}
                      delay={reduce ? 0 : T_NODE + ci * 0.1 + mi * 0.055}
                      entered={entered}
                      reduce={reduce}
                      onSelect={selectNode}
                      onHover={hoverNode}
                    />
                  );
                }),
              )}
            </motion.div>

            {/* 悬停浮签：在运镜层之外，避免被缩放/裁切 */}
            <HoverCard
              id={hoveredId != null && focusedId == null ? hoveredId : null}
              layout={layout}
              box={box}
              cam={cam}
              typeOn={typeOn}
            />
          </>
        )}
      </div>

      {/* ══ 底部提示 ══ */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.8, delay: reduce ? 0 : 2.2 }}
        className="relative z-20 shrink-0 flex items-center justify-center gap-2 py-1 sm:py-1.5 px-3"
      >
        <span
          className="block w-6 sm:w-16 h-px"
          style={{ background: "linear-gradient(90deg,transparent,rgba(160,128,48,0.4))" }}
        />
        <span className="text-[7.5px] sm:text-[9px] tracking-[0.2em] sm:tracking-[0.28em] text-[#8b857c] text-center">
          {compact
            ? "点击星辰启卷 · 选中即回色"
            : "点击星辰启卷 · 选中即回色 · 悬停窥探羁绊 · 线宽即羁绊之重 · ESC 退回星海"}
        </span>
        <span
          className="block w-6 sm:w-16 h-px"
          style={{ background: "linear-gradient(270deg,transparent,rgba(160,128,48,0.4))" }}
        />
      </motion.div>

      {/* ══ 卷宗 ══ */}
      <AnimatePresence>
        {focusChar && (
          <Dossier
            key="dossier"
            ch={focusChar}
            rels={relationsOf(focusChar.id)}
            sheet={sheetMode}
            widthPx={dossierW}
            heightPx={sheetH}
            onClose={() => {
              playSound("click");
              setFocusedId(null);
            }}
            onDive={() => {
              playSound("open");
              setDiveId(focusChar.id);
            }}
            onPick={selectNode}
          />
        )}
      </AnimatePresence>

      {/* ══ 3D 叙事卷轴 ══ */}
      <AnimatePresence>
        {diveChar && (
          <ScrollViewer3D
            character={diveChar}
            onClose={() => {
              playSound("click");
              setDiveId(null);
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

/** 两点之间最显著的关系类型（决定邻接星辰的缘光颜色） */
const REL_PRIORITY: Record<RelationType, number> = {
  blood: 6,
  rival: 5,
  master: 4,
  ally: 3,
  hidden: 2,
  faction: 1,
};
function strongestRelation(from: number, to: number, typeOn: TypeToggle): RelationType | null {
  let best: RelationType | null = null;
  relationsOf(from, typeOn).forEach((r) => {
    if (r.other !== to) return;
    if (!best || REL_PRIORITY[r.type] > REL_PRIORITY[best]) best = r.type;
  });
  return best;
}

type NodeState = "idle" | "dim" | "active" | "neighbor" | "recede";

/* ──────────────────────────────────────────────
   8. 读数 / 控制轨
   ────────────────────────────────────────────── */

const StatReadout = memo(function StatReadout({
  value,
  total,
  label,
  en,
  color,
  muted,
  title,
}: {
  value: number;
  total?: number;
  label: string;
  en: string;
  color: string;
  muted?: boolean;
  title?: string;
}) {
  const partial = total != null && value < total;
  return (
    <div className="text-center leading-none shrink-0" title={title}>
      {/* 数字必须走拉丁字体：font-gothic(UnifrakturCook) 的数字近乎不可读 */}
      <div
        className="font-cinzel tabular-nums"
        style={{
          color,
          fontSize: "clamp(13px,1.5vw,20px)",
          opacity: muted && value === 0 ? 0.3 : 1,
          textShadow: `0 0 12px ${color}44`,
        }}
      >
        <motion.span
          key={value}
          initial={{ opacity: 0.2, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.28 }}
          className="inline-block"
        >
          {value}
        </motion.span>
        {partial && <span className="text-[9px] md:text-[10px] text-[#666057]">/{total}</span>}
      </div>
      <div className="mt-1 text-[8px] md:text-[9px] tracking-[0.24em] text-[#8b857c] whitespace-nowrap">
        {label}
      </div>
      <div className="hidden md:block font-cinzel text-[6.5px] tracking-[0.3em] text-[#4f4b45] mt-0.5">
        {en}
      </div>
    </div>
  );
});

/**
 * 检索框。取代了旧的六阵营筛选轨——按姓名 / 能力 / 引语 / 叙事 / 技能全文匹配，
 * 命中的星辰保持点亮，其余沉入暗处。
 */
const SearchField = memo(function SearchField({
  value,
  hits,
  onChange,
  onClear,
}: {
  value: string;
  /** null = 未检索 */
  hits: number | null;
  onChange: (v: string) => void;
  onClear: () => void;
}) {
  const active = hits != null;
  const none = hits === 0;
  const edge = none
    ? "rgba(138,32,32,0.55)"
    : active
      ? "rgba(240,200,98,0.5)"
      : "rgba(160,128,48,0.2)";
  return (
    <div
      className="shrink-0 flex items-center gap-1.5 pl-2.5 pr-1.5 py-1 rounded-full transition-colors"
      style={{
        border: `1px solid ${edge}`,
        background: active ? "rgba(200,160,67,0.08)" : "rgba(10,8,6,0.45)",
        boxShadow: active ? "0 0 14px rgba(200,160,67,0.12)" : "none",
        maxWidth: "min(100%, 300px)",
      }}
    >
      <svg width="11" height="11" viewBox="0 0 12 12" className="shrink-0" aria-hidden>
        <circle
          cx="5"
          cy="5"
          r="3.6"
          fill="none"
          stroke={active ? "#e8dfc8" : "#8b857c"}
          strokeWidth="1.1"
        />
        <line
          x1="7.8"
          y1="7.8"
          x2="11"
          y2="11"
          stroke={active ? "#e8dfc8" : "#8b857c"}
          strokeWidth="1.1"
          strokeLinecap="round"
        />
      </svg>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        type="search"
        inputMode="search"
        enterKeyHint="search"
        autoComplete="off"
        spellCheck={false}
        aria-label="检索人物"
        placeholder="寻人 · 姓名或能力"
        className="cg-search min-w-0 flex-1 bg-transparent border-0 outline-none text-[12px] tracking-[0.06em]"
        style={{ color: "#ece5d6", width: 128 }}
      />
      {active ? (
        <>
          <span
            className="font-cinzel text-[8px] tabular-nums shrink-0"
            style={{ color: none ? "#a85a5a" : "#bdb6a8" }}
          >
            {hits}
          </span>
          <button
            onClick={onClear}
            className="shrink-0 w-4 h-4 flex items-center justify-center rounded-full transition-colors hover:bg-[#918a80]/20"
            aria-label="清除检索"
          >
            <span className="text-[10px] leading-none text-[#8b857c]">✕</span>
          </button>
        </>
      ) : (
        <span className="font-cinzel text-[8px] tabular-nums text-[#666057] shrink-0 pr-1">
          {CHARACTERS.length}
        </span>
      )}
    </div>
  );
});

const ThreadRail = memo(function ThreadRail({
  typeOn,
  onToggle,
  onReset,
  allOn,
  compact,
}: {
  typeOn: TypeToggle;
  onToggle: (t: RelationType) => void;
  onReset: () => void;
  allOn: boolean;
  compact: boolean;
}) {
  const [open, setOpen] = useState(false);
  const offCount = ALL_TYPES.filter((t) => !typeOn[t]).length;

  const chips = (
    <>
      {ALL_TYPES.map((t) => {
        const m = RELATION_META[t];
        const on = typeOn[t];
        return (
          <button
            key={t}
            onClick={() => onToggle(t)}
            className="shrink-0 flex items-center gap-1 px-1.5 py-1 rounded transition-colors hover:bg-[#918a80]/10"
            title={`${m.label} · ${TYPE_COUNTS[t]} 条${on ? "（点击隐藏）" : "（点击显示）"}`}
          >
            <svg width="18" height="6" viewBox="0 0 18 6" className="shrink-0" aria-hidden>
              <line
                x1="1"
                y1="3"
                x2="17"
                y2="3"
                stroke={on ? m.lit : "#3a352c"}
                strokeWidth={t === "blood" ? 2.6 : 1.7}
                strokeDasharray={m.dash ? "3 2" : undefined}
                strokeLinecap="round"
                opacity={on ? 0.95 : 0.55}
              />
            </svg>
            <span
              className="text-[10.5px] tracking-[0.06em] whitespace-nowrap"
              style={{
                color: on ? "#c9b896" : "#5a5144",
                textDecoration: on ? "none" : "line-through",
              }}
            >
              {m.label}
            </span>
            <span
              className="font-cinzel text-[8px] tabular-nums"
              style={{ color: on ? "#8b857c" : "#463f34" }}
            >
              {TYPE_COUNTS[t]}
            </span>
          </button>
        );
      })}
      <button
        onClick={onReset}
        disabled={allOn}
        className="shrink-0 font-cinzel text-[8px] tracking-[0.2em] px-1.5 py-1 transition-colors disabled:opacity-25"
        style={{ color: allOn ? "#666057" : "#ece5d6" }}
      >
        ALL
      </button>
    </>
  );

  if (!compact) {
    return (
      <div
        className="flex items-center gap-0.5 shrink-0 pl-2 md:pl-3"
        style={{ borderLeft: "1px solid rgba(160,128,48,0.18)" }}
      >
        {chips}
      </div>
    );
  }

  return (
    <div className="relative shrink-0">
      <button
        onClick={() => {
          playSound("click");
          setOpen((v) => !v);
        }}
        className="flex items-center gap-1.5 px-2.5 py-1 rounded-full transition-colors"
        style={{
          border: `1px solid ${offCount > 0 ? "rgba(240,200,98,0.55)" : "rgba(160,128,48,0.2)"}`,
          background: open ? "rgba(200,160,67,0.12)" : "transparent",
        }}
      >
        <svg width="14" height="8" viewBox="0 0 14 8" aria-hidden>
          <line
            x1="1"
            y1="2"
            x2="13"
            y2="2"
            stroke="#bdb6a8"
            strokeWidth="1.2"
            strokeLinecap="round"
          />
          <line
            x1="1"
            y1="6"
            x2="13"
            y2="6"
            stroke="#8b857c"
            strokeWidth="1.2"
            strokeDasharray="2 2"
            strokeLinecap="round"
          />
        </svg>
        <span className="text-[11px] text-[#c9b896]">丝线</span>
        <span className="font-cinzel text-[8px] tabular-nums text-[#8b857c]">
          {ALL_TYPES.length - offCount}/{ALL_TYPES.length}
        </span>
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.97 }}
            transition={{ duration: 0.2 }}
            className="absolute right-0 top-full mt-1.5 z-50 grid grid-cols-2 gap-x-1 p-2 rounded-md"
            style={{
              background: "rgba(8,6,4,0.94)",
              border: "1px solid rgba(160,128,48,0.28)",
              backdropFilter: "blur(6px)",
              WebkitBackdropFilter: "blur(6px)",
              boxShadow: "0 18px 40px rgba(0,0,0,0.6)",
            }}
          >
            {chips}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
});

/* ──────────────────────────────────────────────
   9. 星宫辉光
   ----------------------------------------------
   只剩一团无名的星云——旧版这里印着阵营的草书大字与拉丁副名，
   现在分簇仅作空间提示，不带任何标签。
   ────────────────────────────────────────────── */

const ClusterAura = memo(function ClusterAura({
  cat,
  layout,
  dim,
  lit,
  faded,
  delay,
  reduce,
}: {
  cat: FactionCategory;
  layout: Layout;
  dim: boolean;
  lit: boolean;
  faded: boolean;
  delay: number;
  reduce: boolean;
}) {
  const c = layout.centers[cat];
  const col = FRAME_INK;
  const blob = layout.cr * 3.4; // 辉光直径（图单位）
  const opacity = dim ? 0.14 : faded ? 0.28 : lit ? 0.9 : 0.6;

  return (
    /* 外层只做定位：framer 合成的 transform 会覆盖 style.transform，
       静态 translate(-50%,-50%) 必须待在非 motion 元素上 */
    <div
      className="absolute pointer-events-none"
      style={{
        left: `${c.ux * 100}%`,
        top: `${c.uy * 100}%`,
        width: `${(blob / layout.vw) * 100}%`,
        height: `${blob}%`,
        transform: "translate(-50%,-50%)",
        zIndex: 0,
      }}
    >
      <motion.div
        className="absolute inset-0"
        initial={{ opacity: 0, scale: 0.7 }}
        animate={{ opacity, scale: lit ? 1.06 : 1 }}
        transition={{ duration: 1.1, delay, ease: [0.16, 1, 0.3, 1] }}
      >
        {/* 星云辉光——无字，纯体积 */}
        <div
          className={reduce ? "absolute inset-0" : "absolute inset-0 cg-nebula"}
          style={{
            background: `radial-gradient(circle, ${col}${lit ? "24" : "12"} 0%, ${col}08 42%, transparent 68%)`,
            filter: "blur(10px)",
            animation: reduce ? undefined : `cg-nebula ${26 + layout.cr}s ease-in-out infinite`,
          }}
        />
      </motion.div>
    </div>
  );
});

/* ──────────────────────────────────────────────
   10. 命运丝线层
   ────────────────────────────────────────────── */

interface EdgeVisual {
  key: string;
  type: RelationType;
  d: string;
  color: string;
  width: number;
  opacity: number;
  dash: string;
  flowDur: number;
  glow: boolean;
  lit: boolean;
  reveal: boolean;
  delay: number;
}

const ThreadCanvas = memo(function ThreadCanvas({
  layout,
  activeId,
  match,
  typeOn,
  entered,
  reduce,
}: {
  layout: Layout;
  activeId: number | null;
  match: MatchSet;
  typeOn: TypeToggle;
  entered: boolean;
  reduce: boolean;
}) {
  // ── 星宫多边形（同宫） ──
  const polys = useMemo(() => {
    if (!typeOn.faction) return [];
    return FACTION_RING.map((cat, ci) => {
      const mem = FACTION_MEMBERS[cat];
      const pts = mem.map((id) => layout.nodes[id]);
      const activeHere = activeId != null && CHAR_FACTION[activeId] === cat;
      const searchOut = match != null && !mem.some((id) => match.has(id));
      let opacity: number;
      if (activeId == null) opacity = searchOut ? 0.06 : 0.3;
      else if (activeHere) opacity = 1;
      else opacity = 0.05;
      return {
        cat,
        ci,
        d: polyPath(pts),
        opacity,
        width: activeHere ? layout.d * 0.055 : layout.d * 0.028,
        color: activeHere ? RELATION_META.faction.lit : FRAME_INK,
        glow: activeHere,
      };
    });
  }, [layout, activeId, match, typeOn.faction]);

  // ── 显式丝线 ──
  const lines = useMemo(() => {
    const out: EdgeVisual[] = [];
    RELATIONS.forEach((r, i) => {
      if (!typeOn[r.type]) return;
      const A = layout.nodes[r.a];
      const B = layout.nodes[r.b];
      if (!A || !B) return;
      const meta = RELATION_META[r.type];
      const involved = activeId != null && (r.a === activeId || r.b === activeId);
      // 隐藏羁绊：仅当其一端被激活时以「描线显形」揭示
      if (r.type === "hidden" && !involved) return;
      const searchOut = !inMatch(match, r.a) && !inMatch(match, r.b);
      const baseOpacity = STRENGTH_OPACITY[r.strength];
      let opacity: number;
      if (involved) opacity = Math.min(1, baseOpacity + 0.3);
      else if (activeId != null) opacity = 0.045;
      else if (searchOut) opacity = baseOpacity * 0.14;
      else opacity = baseOpacity;
      const len = Math.hypot(B.gx - A.gx, B.gy - A.gy);
      const bow = clamp(len * 0.1, layout.d * 0.3, layout.d * 1.1);
      out.push({
        key: `${r.a}-${r.b}-${r.type}`,
        type: r.type,
        d: curvedPath(A.gx, A.gy, B.gx, B.gy, bow),
        color: involved ? meta.lit : meta.color,
        width: meta.width * STRENGTH_WIDTH[r.strength] * (involved ? 1.45 : 1) * (layout.d / 7),
        opacity,
        dash: meta.dash,
        flowDur: flowDuration(r.type, involved),
        glow: (involved || r.strength === 3) && opacity > 0.22,
        lit: involved,
        reveal: r.type === "hidden",
        delay: entered ? 0 : T_EDGE + i * 0.032,
      });
    });
    return out;
  }, [layout, activeId, match, typeOn, entered]);

  return (
    <svg
      viewBox={`0 0 ${layout.vw.toFixed(2)} 100`}
      preserveAspectRatio="none"
      className="absolute inset-0 w-full h-full pointer-events-none"
      style={{ zIndex: 2, overflow: "visible" }}
      aria-hidden
    >
      <defs>
        <filter id="cgGlowSoft" x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur stdDeviation="0.5" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <filter id="cgGlowStrong" x="-70%" y="-70%" width="240%" height="240%">
          <feGaussianBlur stdDeviation="1.25" result="b1" />
          <feGaussianBlur stdDeviation="0.42" result="b2" />
          <feMerge>
            <feMergeNode in="b1" />
            <feMergeNode in="b2" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* 星宫 */}
      {polys.map((p) => (
        <g key={`poly-${p.cat}`}>
          <motion.path
            d={p.d}
            fill={p.glow ? `${p.color}0e` : "transparent"}
            stroke={p.color}
            strokeLinejoin="round"
            strokeLinecap="round"
            filter={p.glow ? "url(#cgGlowSoft)" : undefined}
            initial={reduce ? false : { pathLength: 0, strokeOpacity: 0 }}
            animate={{ pathLength: 1, strokeOpacity: p.opacity, strokeWidth: p.width }}
            transition={{
              pathLength: {
                duration: 1.5,
                delay: entered ? 0 : T_POLY + p.ci * 0.09,
                ease: [0.16, 1, 0.3, 1],
              },
              strokeOpacity: { duration: 0.55, delay: entered ? 0 : T_POLY + p.ci * 0.09 },
              strokeWidth: { duration: 0.4 },
            }}
          />
        </g>
      ))}

      {/* 命运丝线 */}
      <AnimatePresence>
        {lines.map((l) => (
          <FateEdge key={l.key} e={l} reduce={reduce} />
        ))}
      </AnimatePresence>
    </svg>
  );
});

/**
 * 单条命运丝线。
 *  · reveal 层：隐藏羁绊显形时的描线（pathLength 0→1 + 亮度回落）
 *  · 主体：本体丝线，虚线类型走 CSS 流动（速度随点亮状态变化）
 *  · 流光：点亮时沿线奔走的光点
 */
const FateEdge = memo(function FateEdge({ e, reduce }: { e: EdgeVisual; reduce: boolean }) {
  const draw = !e.dash && !reduce;
  return (
    <motion.g
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: e.reveal ? 0.26 : 0.4 }}
    >
      {e.reveal && !reduce && (
        <motion.path
          d={e.d}
          fill="none"
          stroke={e.color}
          strokeWidth={e.width * 1.15}
          strokeLinecap="round"
          filter="url(#cgGlowStrong)"
          initial={{ pathLength: 0, strokeOpacity: 0 }}
          animate={{ pathLength: 1, strokeOpacity: [0, 0.95, 0.25] }}
          exit={{ strokeOpacity: 0 }}
          transition={{
            pathLength: { duration: 0.85, ease: [0.22, 0.9, 0.28, 1] },
            strokeOpacity: { duration: 1.25, times: [0, 0.4, 1], ease: "easeOut" },
          }}
        />
      )}

      {/* 实线走 pathLength 描绘；虚线不能用 pathLength——framer 会占用
          stroke-dasharray/-dashoffset，与虚线图案和 CSS 流动动画互相踩踏，
          因此虚线只做透明度淡入，流动交给 CSS keyframes。 */}
      <motion.path
        d={e.d}
        fill="none"
        stroke={e.color}
        strokeLinecap="round"
        strokeDasharray={e.dash || undefined}
        filter={e.glow ? "url(#cgGlowSoft)" : undefined}
        initial={
          reduce
            ? false
            : draw
              ? { pathLength: 0, strokeOpacity: 0, strokeWidth: e.width }
              : { strokeOpacity: 0, strokeWidth: e.width }
        }
        animate={
          draw
            ? { pathLength: 1, strokeOpacity: e.opacity, strokeWidth: e.width }
            : { strokeOpacity: e.opacity, strokeWidth: e.width }
        }
        exit={{ strokeOpacity: 0 }}
        transition={{
          pathLength: { duration: 0.95, delay: e.delay, ease: [0.16, 1, 0.3, 1] },
          strokeOpacity: {
            duration: e.reveal ? 0.5 : 0.5,
            delay: e.reveal ? 0.3 : e.delay,
            ease: "easeOut",
          },
          strokeWidth: { duration: 0.35 },
        }}
        style={
          e.dash && !reduce
            ? { animation: `cg-flow-${e.type} ${e.flowDur.toFixed(2)}s linear infinite` }
            : undefined
        }
      />

      {e.lit && !reduce && (
        <motion.path
          d={e.d}
          fill="none"
          stroke={e.color}
          strokeWidth={e.width * 1.3}
          strokeLinecap="round"
          pathLength={1}
          strokeDasharray="0.08 0.92"
          filter="url(#cgGlowStrong)"
          initial={{ strokeOpacity: 0, strokeDashoffset: 1 }}
          animate={{ strokeOpacity: 0.95, strokeDashoffset: [1, 0] }}
          exit={{ strokeOpacity: 0 }}
          transition={{
            strokeDashoffset: { duration: 1.7, repeat: Infinity, ease: "linear" },
            strokeOpacity: { duration: e.reveal ? 0.45 : 0.3, delay: e.reveal ? 0.45 : 0 },
          }}
        />
      )}
    </motion.g>
  );
});

/* ──────────────────────────────────────────────
   11. 星辰节点
   ────────────────────────────────────────────── */

const NODE_STATE: Record<NodeState, { scale: number; opacity: number; z: number; label: number }> =
  {
    idle: { scale: 1.0, opacity: 1.0, z: 6, label: 0.9 },
    dim: { scale: 0.9, opacity: 0.28, z: 4, label: 0 },
    neighbor: { scale: 1.12, opacity: 1.0, z: 26, label: 1 },
    active: { scale: 1.44, opacity: 1.0, z: 40, label: 1 },
    recede: { scale: 0.86, opacity: 0.13, z: 3, label: 0 },
  };

interface StarNodeProps {
  ch: CharacterDef;
  n: NodeLayout;
  nodePx: number;
  state: NodeState;
  relType: RelationType | null;
  focused: boolean;
  delay: number;
  entered: boolean;
  reduce: boolean;
  onSelect: (id: number) => void;
  onHover: (id: number, on: boolean) => void;
}

const StarNode = memo(function StarNode({
  ch,
  n,
  nodePx,
  state,
  relType,
  focused,
  delay,
  entered,
  reduce,
  onSelect,
  onHover,
}: StarNodeProps) {
  const s = NODE_STATE[state];
  const hot = state === "active" || state === "neighbor";
  const relColor = relType ? RELATION_META[relType].lit : null;
  // 结构色横跨深灰→近白，星图因此有真实的明暗层次
  const tone = charTone(ch);
  const ink = charInk(ch);
  // 「选中即回色」：唯独被选中的这颗星辰回到原画的颜色
  const live = focused ? charLive(ch) : null;
  const rim = live ?? tone;
  const ringCol = state === "active" ? (live ?? "#ece5d6") : tone;

  const driftDur = 9 + hash(ch.id * 5.1) * 8;
  const dx = (hash(ch.id * 2.7) - 0.5) * nodePx * 0.16;
  const dy = (hash(ch.id * 8.3) - 0.5) * nodePx * 0.13;

  return (
    <div
      className="absolute"
      style={{
        left: `${(n.ux * 100).toFixed(3)}%`,
        top: `${(n.uy * 100).toFixed(3)}%`,
        width: nodePx,
        height: nodePx,
        marginLeft: -nodePx / 2,
        marginTop: -nodePx / 2,
        zIndex: s.z,
      }}
    >
      <div
        className={reduce ? "relative w-full h-full" : "relative w-full h-full cg-drift"}
        style={{
          ["--dx" as string]: `${dx.toFixed(2)}px`,
          ["--dy" as string]: `${dy.toFixed(2)}px`,
          animation: reduce
            ? undefined
            : `cg-drift ${driftDur.toFixed(1)}s ease-in-out ${(hash(ch.id) * 6).toFixed(1)}s infinite`,
        }}
      >
        <motion.button
          type="button"
          className="cg-node-btn absolute inset-0 rounded-full cursor-pointer"
          initial={reduce ? false : { opacity: 0, scale: 0.1 }}
          animate={{ opacity: s.opacity, scale: s.scale }}
          transition={
            entered
              ? { type: "spring", stiffness: 260, damping: 24 }
              : { type: "spring", stiffness: 200, damping: 18, delay }
          }
          whileTap={{ scale: s.scale * 0.92 }}
          onClick={(e) => {
            e.stopPropagation();
            onSelect(ch.id);
          }}
          onPointerEnter={(e) => {
            if (e.pointerType === "mouse") onHover(ch.id, true);
          }}
          onPointerLeave={(e) => {
            if (e.pointerType === "mouse") onHover(ch.id, false);
          }}
          aria-label={`${ch.name} · ${ch.ability}`}
        >
          {/* 外辉光。静息态的浓度跟着色调走——暗调星辰的光晕也更薄 */}
          <span
            className="absolute rounded-full pointer-events-none"
            style={{
              inset: "-38%",
              background: `radial-gradient(circle, ${rim}${state === "active" ? "44" : hot ? "2c" : "14"} 0%, transparent 68%)`,
              transform: `scale(${state === "active" ? 1.35 : hot ? 1.15 : 1})`,
              transition: "transform .45s cubic-bezier(.16,1,.3,1), background .45s ease",
            }}
          />
          {/* 轨道环：静息缓转，激活时加速并显金 */}
          <svg
            className="absolute pointer-events-none"
            style={{
              inset: "-24%",
              animation: reduce
                ? undefined
                : `cg-spin ${state === "active" ? 14 : 46}s linear infinite`,
              opacity: state === "active" ? 0.95 : hot ? 0.6 : 0.34,
              transition: "opacity .4s ease",
            }}
            viewBox="0 0 100 100"
            aria-hidden
          >
            <circle
              cx="50"
              cy="50"
              r="47"
              fill="none"
              stroke={ringCol}
              strokeWidth={state === "active" ? 1.6 : 1}
              strokeDasharray={state === "active" ? "3 4" : "1.5 6"}
              strokeLinecap="round"
            />
            {state === "active" &&
              [0, 90, 180, 270].map((a) => (
                <line
                  key={a}
                  x1="50"
                  y1="1"
                  x2="50"
                  y2="7"
                  transform={`rotate(${a} 50 50)`}
                  stroke={ringCol}
                  strokeWidth="1.6"
                  strokeLinecap="round"
                />
              ))}
          </svg>
          {/* 聚焦脉冲 */}
          {focused && !reduce && (
            <>
              <span
                className="absolute rounded-full pointer-events-none cg-halo"
                style={{
                  inset: "-6%",
                  border: `1px solid ${rim}80`,
                  animation: "cg-halo 2.4s cubic-bezier(.2,.6,.4,1) infinite",
                }}
              />
              <span
                className="absolute rounded-full pointer-events-none cg-halo"
                style={{
                  inset: "-6%",
                  border: `1px solid ${rim}55`,
                  animation: "cg-halo 2.4s cubic-bezier(.2,.6,.4,1) 1.2s infinite",
                }}
              />
            </>
          )}
          {/* 天体本体 */}
          <span
            className="absolute inset-0 rounded-full overflow-hidden block"
            style={{
              border: `${state === "active" ? 1.2 : 0.6}px solid ${hot ? rim + "cc" : tone + "3d"}`,
              boxShadow:
                state === "active"
                  ? `0 0 ${nodePx * 0.5}px ${rim}99, 0 0 ${nodePx * 1.1}px ${rim}44, 0 0 0 1px ${rim}66`
                  : hot
                    ? `0 0 ${nodePx * 0.34}px ${rim}88, 0 0 0 1px ${rim}55`
                    : `0 0 ${nodePx * 0.16}px ${tone}3d`,
              background: "#0a0806",
              transition: "box-shadow .45s ease, border-color .45s ease",
            }}
          >
            {/* 立绘：静息灰阶且曝光随色调变化（明暗层次的主要来源），
                被选中时 grayscale → 0，原画的颜色平滑地回来 */}
            <img
              src={ch.portrait}
              alt=""
              className="w-full h-full object-cover"
              draggable={false}
              loading="lazy"
              decoding="async"
              style={{
                filter: portraitFilter(ch, { live: focused, hot }),
                transition: "filter .6s cubic-bezier(.16,1,.3,1)",
              }}
            />
            {/* 缘光：从下缘打上来。选中时让位给原画颜色，只留很薄一层 */}
            <span
              className="absolute inset-0 rounded-full pointer-events-none"
              style={{
                background: focused
                  ? `radial-gradient(circle at 50% 126%, ${rim}3a 0%, transparent 54%)`
                  : `radial-gradient(circle at 50% 122%, ${tone}77 0%, transparent 52%), radial-gradient(circle at 50% 26%, transparent 42%, ${tone}4d 100%)`,
                transition: "background .6s ease",
              }}
            />
            <span
              className="absolute inset-0 rounded-full pointer-events-none"
              style={{
                boxShadow: `inset 0 0 ${nodePx * 0.22}px ${rim}${focused ? "3a" : "66"}, inset 0 1px 1px rgba(255,240,200,0.18)`,
              }}
            />
          </span>
          {/* 点燃闪光（仅入场一次） */}
          {!reduce && (
            <motion.span
              className="absolute rounded-full pointer-events-none"
              style={{
                inset: 0,
                background: `radial-gradient(circle, ${ink}ee 0%, ${ink}55 38%, transparent 70%)`,
              }}
              initial={{ opacity: 0, scale: 0.2 }}
              animate={{ opacity: [0, 0.9, 0], scale: [0.2, 1.9, 2.9] }}
              transition={{ duration: 1.15, delay, ease: "easeOut" }}
            />
          )}
          {/* 羁绊类型徽标（邻接星辰） */}
          {relColor && (
            <motion.span
              className="absolute rounded-full pointer-events-none"
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0, opacity: 0 }}
              transition={{ type: "spring", stiffness: 400, damping: 20 }}
              style={{
                width: Math.max(6, nodePx * 0.2),
                height: Math.max(6, nodePx * 0.2),
                right: "-4%",
                top: "-4%",
                background: relColor,
                boxShadow: `0 0 8px ${relColor}, 0 0 2px #000`,
                border: "1px solid rgba(0,0,0,0.65)",
              }}
            />
          )}
        </motion.button>

        {/* 名签：置于 button 之外，不随聚焦缩放而变形 */}
        <span
          className="absolute left-1/2 whitespace-nowrap pointer-events-none text-center"
          style={{
            [n.labelAbove ? "bottom" : "top"]: "100%",
            [n.labelAbove ? "marginBottom" : "marginTop"]: `${Math.max(4, nodePx * 0.16)}px`,
            transform: "translateX(-50%)",
            fontSize: `${clamp(nodePx * 0.27, 9, 13).toFixed(1)}px`,
            letterSpacing: "0.1em",
            lineHeight: 1.1,
            color: hot ? "#f5ecd6" : "#c9b896",
            textShadow:
              "0 1px 3px rgba(0,0,0,0.98), 0 0 7px rgba(0,0,0,0.95), 0 0 14px rgba(6,4,2,0.9)",
            opacity: s.label,
            transition: "opacity .35s ease, color .35s ease",
          }}
        >
          {ch.name}
          {state === "active" && (
            <span
              className="block"
              style={{
                fontSize: `${clamp(nodePx * 0.2, 8, 10.5).toFixed(1)}px`,
                letterSpacing: "0.14em",
                color: live ?? ink,
                marginTop: 2,
                transition: "color .6s ease",
              }}
            >
              {ch.ability}
            </span>
          )}
        </span>
      </div>
    </div>
  );
});

/* ──────────────────────────────────────────────
   12. 悬停浮签（在运镜层外，避免被缩放与裁切）
   ────────────────────────────────────────────── */

const HoverCard = memo(function HoverCard({
  id,
  layout,
  box,
  cam,
  typeOn,
}: {
  id: number | null;
  layout: Layout;
  box: { w: number; h: number };
  cam: { x: number; y: number; s: number };
  typeOn: TypeToggle;
}) {
  const data = useMemo(() => {
    if (id == null) return null;
    const ch = getChar(id);
    const n = layout.nodes[id];
    if (!n) return null;
    const rels = relationsOf(id, typeOn);
    const byType = new Map<RelationType, number>();
    rels.forEach((r) => byType.set(r.type, (byType.get(r.type) ?? 0) + 1));
    // 浮签在运镜层之外，必须自己把镜头变换换算成屏幕坐标，
    // 否则阵营筛选推近时浮签会与星辰脱节
    const px = box.w / 2 + (n.ux * box.w - box.w / 2) * cam.s + cam.x;
    const py = box.h / 2 + (n.uy * box.h - box.h / 2) * cam.s + cam.y;
    const gap = layout.nodePx * cam.s * 0.86;
    const below = py < box.h * 0.58;
    // 星图容器 overflow-hidden，浮签必须整体夹在盒内，否则贴边星辰的浮签会被裁掉
    const cardW = Math.min(280, Math.max(180, box.w * 0.7));
    const left = clamp(px - cardW / 2, 4, Math.max(4, box.w - cardW - 4));
    return { ch, n, rels, byType, below, px, py, gap, cardW, left };
  }, [id, layout, typeOn, box.w, box.h, cam]);

  return (
    <AnimatePresence>
      {data && (
        <motion.div
          key={data.ch.id}
          initial={{ opacity: 0, y: data.below ? -6 : 6, scale: 0.94 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: data.below ? -4 : 4, scale: 0.96 }}
          transition={{ duration: 0.16, ease: "easeOut" }}
          className="absolute pointer-events-none rounded-md overflow-hidden"
          style={{
            zIndex: 45,
            left: data.left,
            [data.below ? "top" : "bottom"]: data.below
              ? data.py + data.gap
              : box.h - data.py + data.gap,
            maxWidth: data.cardW,
            background: "linear-gradient(160deg, rgba(20,16,12,0.96), rgba(8,6,4,0.97))",
            border: `1px solid ${charInk(data.ch)}44`,
            boxShadow: `0 16px 44px rgba(0,0,0,0.72), 0 0 24px ${charTone(data.ch)}18`,
            backdropFilter: "blur(6px)",
            WebkitBackdropFilter: "blur(6px)",
          }}
        >
          <div
            className="h-px w-full"
            style={{
              background: `linear-gradient(90deg,transparent,${charInk(data.ch)}bb,transparent)`,
            }}
          />
          <div className="flex items-center gap-2.5 px-3 py-2">
            <span
              className="shrink-0 rounded-full overflow-hidden block"
              style={{
                width: 34,
                height: 34,
                border: `1px solid ${charInk(data.ch)}66`,
                boxShadow: `0 0 10px ${charTone(data.ch)}44`,
              }}
            >
              {/* 悬停只是「窥探」，还没选中——立绘保持灰阶 */}
              <img
                src={data.ch.portrait}
                alt=""
                className="w-full h-full object-cover"
                draggable={false}
                style={{ filter: portraitFilter(data.ch, { hot: true }) }}
              />
            </span>
            <span className="min-w-0">
              <span className="flex items-baseline gap-1.5">
                <span className="text-[14px] leading-none text-[#f5ecd6] tracking-[0.06em]">
                  {data.ch.name}
                </span>
                <span
                  className="font-brush text-[12px] leading-none"
                  style={{ color: charInk(data.ch) }}
                >
                  {data.ch.ability}
                </span>
              </span>
              <span className="flex items-center gap-1.5 mt-1.5">
                <span className="font-cinzel text-[7.5px] tracking-[0.28em] tabular-nums text-[#666057]">
                  NO.{String(data.ch.id).padStart(2, "0")}
                </span>
                <span className="text-[9px] text-[#4f4b45]">·</span>
                <span className="font-cinzel text-[8px] tabular-nums text-[#8b857c] tracking-[0.1em]">
                  {data.rels.length} BONDS
                </span>
              </span>
            </span>
          </div>
          {/* 羁绊构成条 */}
          <div className="flex items-center gap-px px-3 pb-2">
            {TYPE_ORDER.filter((t) => (data.byType.get(t) ?? 0) > 0).map((t) => (
              <span
                key={t}
                className="h-[3px] rounded-full"
                style={{
                  width: `${((data.byType.get(t) ?? 0) / Math.max(1, data.rels.length)) * 100}%`,
                  background: RELATION_META[t].lit,
                  opacity: 0.85,
                }}
              />
            ))}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
});

/* ──────────────────────────────────────────────
   13. 卷宗（聚焦详情）
   ----------------------------------------------
   一块「浮起来的裱框铜牌」，不是从屏幕边缘拉出来的抽屉：
     · 停在右侧，四边都留出可见的外边距
     · 双层描边（外框 + 内细线）+ 四角包角，做出装裱的材质感
     · 顶部有一条窄横栏承载标题与关闭键，包角因此不会被按钮压住
   ────────────────────────────────────────────── */

/** 四角包角：装裱的金属护角 */
function FrameCorner({
  v,
  h,
  col,
  size = 18,
}: {
  v: "top" | "bottom";
  h: "left" | "right";
  col: string;
  size?: number;
}) {
  return (
    <span
      className="absolute z-20 pointer-events-none"
      style={{
        [v]: 4,
        [h]: 4,
        width: size,
        height: size,
        [v === "top" ? "borderTop" : "borderBottom"]: `1.5px solid ${col}`,
        [h === "left" ? "borderLeft" : "borderRight"]: `1.5px solid ${col}`,
        [`border${v === "top" ? "Top" : "Bottom"}${h === "left" ? "Left" : "Right"}Radius`]: 3,
      }}
    />
  );
}

interface DossierProps {
  ch: CharacterDef;
  rels: RelEntry[];
  sheet: boolean;
  widthPx: number;
  heightPx: number;
  onClose: () => void;
  onDive: () => void;
  onPick: (id: number) => void;
}

function Dossier({ ch, rels, sheet, widthPx, heightPx, onClose, onDive, onPick }: DossierProps) {
  // 框架一律走中性的陈年金属灰；角色的「颜色」只出现在立绘与个人强调色上
  const col = FRAME_INK;
  /** 选中即回色：卷宗里的强调色用角色原色（提亮版） */
  const live = charLive(ch);
  const dragCtl = useDragControls();
  const bodyRef = useRef<HTMLDivElement>(null);
  // 切换角色时把正文滚回顶部，否则新卷宗会停在上一个人的滚动位置
  useEffect(() => {
    bodyRef.current?.scrollTo({ top: 0 });
  }, [ch.id]);

  const grouped = useMemo(() => {
    const map = new Map<RelationType, RelEntry[]>();
    TYPE_ORDER.forEach((t) => map.set(t, []));
    rels.forEach((r) => {
      const arr = map.get(r.type);
      if (arr) arr.push(r);
    });
    return TYPE_ORDER.map((t) => ({
      type: t,
      items: map
        .get(t)!
        .slice()
        .sort((a, b) => b.strength - a.strength),
    })).filter((g) => g.items.length > 0);
  }, [rels]);

  return (
    <motion.aside
      className="fixed z-[60] flex flex-col overflow-hidden"
      /* 浮在右侧：进出方向随之从 +x 滑入滑出 */
      initial={sheet ? { y: "108%", opacity: 0.6 } : { x: "108%", opacity: 0.6 }}
      animate={sheet ? { y: 0, opacity: 1 } : { x: 0, opacity: 1 }}
      exit={sheet ? { y: "108%", opacity: 0.4 } : { x: "108%", opacity: 0.4 }}
      transition={{ type: "spring", stiffness: 220, damping: 30, mass: 0.85 }}
      /* 仅抓取条能发起拖拽，否则会吞掉正文的滚动手势 */
      drag={sheet ? "y" : false}
      dragControls={dragCtl}
      dragListener={false}
      dragConstraints={{ top: 0, bottom: 0 }}
      dragElastic={{ top: 0, bottom: 0.4 }}
      onDragEnd={(_, info) => {
        if (info.offset.y > 90 || info.velocity.y > 620) onClose();
      }}
      style={
        sheet
          ? {
              // 移动端：底部浮起的一块牌，左右下三边同样留白
              left: SHEET_GAP,
              right: SHEET_GAP,
              bottom: SHEET_GAP,
              height: heightPx,
              border: `1px solid ${col}59`,
              borderRadius: 14,
              background: "linear-gradient(180deg, rgba(18,15,11,0.97) 0%, rgba(7,5,3,0.985) 100%)",
              boxShadow: `0 -18px 60px rgba(0,0,0,0.8), 0 0 0 1px rgba(0,0,0,0.85), 0 0 50px ${col}12`,
              backdropFilter: "blur(14px)",
              WebkitBackdropFilter: "blur(14px)",
            }
          : {
              // 桌面端：右侧浮起的裱框铜牌，四边都不贴边
              top: DOSSIER_GAP,
              right: DOSSIER_GAP,
              bottom: DOSSIER_GAP,
              width: widthPx,
              maxWidth: `calc(100vw - ${DOSSIER_GAP * 2}px)`,
              border: `1px solid ${col}59`,
              borderRadius: 10,
              background: "linear-gradient(160deg, rgba(20,16,12,0.965) 0%, rgba(7,5,3,0.985) 62%)",
              boxShadow: `0 28px 80px rgba(0,0,0,0.78), 0 0 0 1px rgba(0,0,0,0.85), 0 0 60px ${col}14`,
              backdropFilter: "blur(14px)",
              WebkitBackdropFilter: "blur(14px)",
            }
      }
    >
      {/* ── 装裱：内细线 + 四角护角 ── */}
      <span
        className="absolute z-20 pointer-events-none"
        style={{
          inset: 4,
          border: `1px solid ${col}24`,
          borderRadius: sheet ? 10 : 7,
        }}
      />
      <FrameCorner v="top" h="left" col={`${col}aa`} />
      <FrameCorner v="top" h="right" col={`${col}aa`} />
      <FrameCorner v="bottom" h="left" col={`${col}aa`} />
      <FrameCorner v="bottom" h="right" col={`${col}aa`} />

      {/* ── 顶栏：标题 + 关闭键。移动端兼作拖拽抓取条 ── */}
      <div
        className={`relative z-30 shrink-0 flex items-center gap-2 pl-4 pr-1.5 ${
          sheet ? "cursor-grab active:cursor-grabbing" : ""
        }`}
        style={{
          height: 34,
          marginTop: 5,
          marginLeft: 5,
          marginRight: 5,
          borderBottom: `1px solid ${col}2b`,
          background: `linear-gradient(180deg, ${col}16, transparent)`,
          touchAction: sheet ? "none" : undefined,
        }}
        onPointerDown={sheet ? (e) => dragCtl.start(e) : undefined}
      >
        <span className="font-brush text-[13px] leading-none text-[#e8dfc8] tracking-[0.14em]">
          卷宗
        </span>
        <span
          className="font-cinzel text-[7px] tracking-[0.34em] mt-px"
          style={{ color: `${col}cc` }}
        >
          DOSSIER
        </span>
        <span
          className="flex-1 h-px min-w-2"
          style={{ background: `linear-gradient(90deg,${col}44,transparent)` }}
        />
        {sheet && (
          <span className="block w-8 h-1 rounded-full mr-1" style={{ background: `${col}55` }} />
        )}
        <button
          onClick={onClose}
          className="shrink-0 w-7 h-7 flex items-center justify-center rounded transition-colors hover:bg-[#918a80]/18"
          style={{ border: `1px solid ${col}3d`, background: "rgba(6,4,2,0.55)" }}
          aria-label="关闭卷宗"
        >
          <IconExit size={11} color="#c9b896" />
        </button>
      </div>

      {/* ── 抬头 ── */}
      <div className="relative shrink-0" style={{ margin: "0 5px" }}>
        {!sheet && (
          <div className="relative overflow-hidden" style={{ height: "min(52vh, 540px)" }}>
            {/* 选中即回色：卷宗立绘完全脱掉灰阶滤镜，原画的颜色回到画面上。
                grayscale 走 framer 动画，颜色是「渐渐回来」的，不是硬切。 */}
            <motion.img
              key={ch.id}
              src={ch.portrait}
              alt={ch.name}
              className="w-full h-full object-cover object-top"
              draggable={false}
              initial={{ scale: 1.14, filter: "grayscale(1) contrast(1.06) brightness(0.86)" }}
              animate={{ scale: 1, filter: "grayscale(0) contrast(1.04) brightness(1)" }}
              transition={{
                scale: { duration: 2.2, ease: [0.16, 1, 0.3, 1] },
                filter: { duration: 1.1, ease: [0.16, 1, 0.3, 1] },
              }}
            />
            {/* 压角只压边缘，别把刚回来的颜色又蒙掉 */}
            <span
              className="absolute inset-0 pointer-events-none"
              style={{
                background: `linear-gradient(180deg, rgba(7,5,3,0.5) 0%, transparent 20%, transparent 54%, rgba(7,5,3,0.96) 100%)`,
              }}
            />
            <span
              className="absolute inset-0 pointer-events-none"
              style={{ boxShadow: `inset 0 0 60px rgba(6,4,2,0.55)` }}
            />
          </div>
        )}

        {/* 名牌 */}
        <div
          className={`relative px-4 sm:px-5 ${sheet ? "pt-2 pb-2 flex items-center gap-3" : "-mt-16 pb-3"}`}
        >
          {sheet && (
            <span
              className="shrink-0 rounded-full overflow-hidden block"
              style={{
                width: 60,
                height: 60,
                border: `1px solid ${live}88`,
                boxShadow: `0 0 18px ${charTone(ch)}44`,
              }}
            >
              {/* 移动端同样回色 */}
              <motion.img
                key={ch.id}
                src={ch.portrait}
                alt=""
                className="w-full h-full object-cover object-top"
                draggable={false}
                initial={{ filter: "grayscale(1) brightness(0.9)" }}
                animate={{ filter: "grayscale(0) brightness(1)" }}
                transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
              />
            </span>
          )}
          <div className="min-w-0 flex-1">
            {/* 身份行：不再有阵营徽记与分类名，只留编号与羁绊读数 */}
            <div className="flex items-center gap-1.5">
              <span
                className="block w-1.5 h-1.5 rounded-full shrink-0"
                style={{ background: live, boxShadow: `0 0 8px ${live}aa` }}
              />
              <span className="font-cinzel text-[7.5px] tracking-[0.28em] text-[#8b857c] tabular-nums">
                NO.{String(ch.id).padStart(2, "0")}
              </span>
              <span
                className="flex-1 h-px"
                style={{ background: `linear-gradient(90deg,${col}55,transparent)` }}
              />
              <span className="font-cinzel text-[7.5px] tracking-[0.28em] text-[#666057] tabular-nums">
                {rels.length} BONDS
              </span>
            </div>
            <motion.div
              key={ch.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.12, duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
              className="font-caoshu leading-[0.95] mt-1"
              style={{
                fontSize: sheet ? "clamp(30px,8vw,42px)" : "clamp(38px,4.4vw,58px)",
                color: "#f5ecd6",
                textShadow: `0 0 26px ${live}66, 0 2px 10px rgba(0,0,0,0.9)`,
              }}
            >
              {ch.name}
            </motion.div>
            <div className="flex items-baseline gap-2 mt-1">
              <span
                className="font-brush leading-none"
                style={{
                  fontSize: sheet ? 17 : 20,
                  color: live,
                  textShadow: `0 0 14px ${live}55`,
                }}
              >
                {ch.ability}
              </span>
              <span
                className="flex-1 h-px"
                style={{ background: `linear-gradient(90deg,${live}44,transparent)` }}
              />
              <span
                className="font-cinzel text-[7.5px] tracking-[0.3em] tabular-nums"
                style={{ color: "#8b857c" }}
              >
                {ch.maxFragments} FRAGMENTS
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ── 正文 ── */}
      <div
        ref={bodyRef}
        className="relative flex-1 min-h-0 overflow-y-auto custom-scroll-parchment px-4 sm:px-5 pb-4"
        style={{ margin: "0 5px" }}
      >
        {/* 引语：戏剧性主角 */}
        <motion.blockquote
          key={ch.id}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
          className="relative mt-1 mb-4 px-4 py-3"
          style={{
            borderLeft: `2px solid ${live}`,
            background: `linear-gradient(90deg, ${live}12, transparent 78%)`,
          }}
        >
          <span
            className="font-brush absolute -top-3 left-1 select-none pointer-events-none"
            style={{ fontSize: 46, color: live, opacity: 0.22, lineHeight: 1 }}
          >
            「
          </span>
          <p
            className="font-brush relative"
            style={{
              fontSize: "clamp(16px,1.5vw,20px)",
              lineHeight: 1.85,
              color: "#efe6cf",
              textShadow: "0 1px 6px rgba(0,0,0,0.8)",
            }}
          >
            {ch.quote}
          </p>
          <span
            className="font-brush absolute -bottom-6 right-1 select-none pointer-events-none"
            style={{ fontSize: 46, color: live, opacity: 0.22, lineHeight: 1 }}
          >
            」
          </span>
        </motion.blockquote>

        {/* 叙事 */}
        <SectionTitle cn="叙事" en="NARRATIVE" col={col} />
        <p
          className="mt-1.5 mb-4 text-[13.5px] leading-[1.85]"
          style={{ color: "rgba(201,184,150,0.9)" }}
        >
          {ch.desc}
        </p>

        {/* 技 */}
        {ch.skills.length > 0 && (
          <>
            <SectionTitle cn="技" en="ARTS" col={col} count={ch.skills.length} />
            <div className="mt-1.5 mb-4 space-y-1.5">
              {ch.skills.map((sk) => (
                <div
                  key={sk.key}
                  className="rounded px-2.5 py-1.5"
                  style={{
                    background: "rgba(160,128,48,0.05)",
                    border: "1px solid rgba(160,128,48,0.16)",
                  }}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-[12.5px] text-[#e8dfc8] tracking-[0.06em]">
                      {sk.name}
                    </span>
                    <span
                      className="text-[8px] tracking-[0.14em] px-1 py-px rounded"
                      style={{ color: col, border: `0.5px solid ${col}55` }}
                    >
                      {sk.type}
                    </span>
                    <span className="flex-1" />
                    <span className="font-cinzel text-[7.5px] tracking-[0.18em] text-[#666057] tabular-nums">
                      R{sk.rankReq} · {sk.cost}
                    </span>
                  </div>
                  <p
                    className="text-[11.5px] leading-relaxed mt-0.5"
                    style={{ color: "rgba(201,184,150,0.62)" }}
                  >
                    {sk.desc}
                  </p>
                </div>
              ))}
            </div>
          </>
        )}

        {/* 命运丝线 */}
        <SectionTitle cn="命运丝线" en="THREADS OF FATE" col={col} count={rels.length} />
        <div className="mt-2 space-y-3">
          {grouped.map((g) => {
            const m = RELATION_META[g.type];
            return (
              <div key={g.type}>
                <div className="flex items-center gap-2 mb-1">
                  <span
                    className="block w-5 h-[2px] rounded-full shrink-0"
                    style={{ background: m.lit, boxShadow: `0 0 8px ${m.lit}88` }}
                  />
                  <span className="text-[11px] tracking-[0.14em] shrink-0" style={{ color: m.lit }}>
                    {m.label}
                  </span>
                  <span
                    className="font-cinzel text-[7px] tracking-[0.3em] mt-px shrink-0"
                    style={{ color: `${m.lit}88` }}
                  >
                    {m.en}
                  </span>
                  <span
                    className="flex-1 h-px"
                    style={{ background: `linear-gradient(90deg,${m.lit}33,transparent)` }}
                  />
                  <span className="font-cinzel text-[8px] tabular-nums text-[#666057]">
                    {g.items.length}
                  </span>
                </div>
                <div className="space-y-0.5">
                  {g.items.map((r, idx) => {
                    const other = getChar(r.other);
                    return (
                      <button
                        key={`${r.other}-${idx}`}
                        onClick={() => {
                          playSound("click");
                          onPick(r.other);
                        }}
                        className="group w-full text-left flex items-start gap-2 px-2 py-1.5 rounded transition-colors hover:bg-[#918a80]/12"
                      >
                        <span
                          className="shrink-0 rounded-full overflow-hidden block mt-px"
                          style={{ width: 26, height: 26, border: `1px solid ${charInk(other)}55` }}
                        >
                          {/* 名单里的人还没被选中——保持灰阶 */}
                          <img
                            src={other.portrait}
                            alt=""
                            className="w-full h-full object-cover"
                            draggable={false}
                            loading="lazy"
                            style={{ filter: portraitFilter(other, {}) }}
                          />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-1.5">
                            <span className="text-[12.5px] text-[#e8dfc8] group-hover:text-[#f5ecd6] tracking-[0.05em]">
                              {other.name}
                            </span>
                            <span
                              className="font-brush text-[10.5px]"
                              style={{ color: `${charInk(other)}cc` }}
                            >
                              {other.ability}
                            </span>
                            <span
                              className="font-cinzel text-[7px] tracking-[0.16em] tabular-nums px-1 rounded"
                              style={{ color: m.lit, border: `0.5px solid ${m.lit}44` }}
                            >
                              {STRENGTH_LABEL[r.strength]}
                            </span>
                          </span>
                          <span
                            className="block text-[11px] leading-snug mt-0.5"
                            style={{ color: "rgba(201,184,150,0.6)" }}
                          >
                            {r.note}
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── 底部 CTA ── */}
      <div
        className="relative shrink-0 px-4 sm:px-5 py-2.5"
        style={{
          margin: "0 5px 5px",
          borderTop: `1px solid ${col}33`,
          background: `linear-gradient(180deg, transparent, ${col}0d)`,
        }}
      >
        <button
          onClick={onDive}
          className="relative w-full overflow-hidden rounded py-2.5 transition-all group"
          style={{
            background: `linear-gradient(135deg, ${live}26, ${col}14)`,
            border: `1px solid ${live}66`,
            boxShadow: `0 0 18px ${live}1f`,
          }}
        >
          <span className="relative z-10 flex items-center justify-center gap-2">
            <span className="font-brush text-[15px] tracking-[0.16em] text-[#f5ecd6]">
              展开叙事卷轴
            </span>
            <span className="font-cinzel text-[8px] tracking-[0.34em] text-[#bdb6a8] mt-px">
              UNFURL
            </span>
          </span>
          <span
            className="absolute inset-y-0 w-1/3 pointer-events-none cg-sheen"
            style={{
              background: "linear-gradient(90deg, transparent, rgba(240,200,98,0.16), transparent)",
              animation: "cg-sheen 3.4s ease-in-out infinite",
            }}
          />
        </button>
      </div>
    </motion.aside>
  );
}

function SectionTitle({
  cn,
  en,
  col,
  count,
}: {
  cn: string;
  en: string;
  col: string;
  count?: number;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="font-brush text-[15px] leading-none" style={{ color: "#e8dfc8" }}>
        {cn}
      </span>
      <span
        className="font-cinzel text-[7px] tracking-[0.34em] mt-px"
        style={{ color: `${col}bb` }}
      >
        {en}
      </span>
      <span
        className="flex-1 h-px"
        style={{ background: `linear-gradient(90deg,${col}44,transparent)` }}
      />
      {count != null && (
        <span className="font-cinzel text-[8px] tabular-nums text-[#666057]">{count}</span>
      )}
    </div>
  );
}

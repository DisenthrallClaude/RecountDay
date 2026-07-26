/**
 * SvgCardEffects.tsx —— 卡牌专属 SVG 精美特效层
 * ============================================================================
 * 设计标准：
 *  每张卡牌拥有独特的视觉标识，基于三层墨痕基础但加入差异化元素：
 *    基础层：外发光 + 主墨痕 + 白芯 + 飞溅点
 *    独特层：每张牌独有的附加 SVG 元素（护盾/叶片/裂纹/涟漪/符文等）
 *  禁止粒子系统，所有视觉效果由 SVG 矢量绘制。
 *  视觉风格：暗黑哥特 / 羊皮纸美学，配色锚定 PALETTE。
 * ============================================================================
 */

import { motion } from "framer-motion";
import type { CSSProperties } from "react";
import { PALETTE, type ResolvedEffectConfig } from "./CardEffectConfig";

/* ========================================================================== *
 * 0. 常量与辅助
 * ========================================================================== */

const SVG_SIZE = 280;
const VB_HALF = SVG_SIZE / 2;
const VIEW_BOX = `${-VB_HALF} ${-VB_HALF} ${SVG_SIZE} ${SVG_SIZE}`;

function absPos(x: number, y: number, w: number, h: number): CSSProperties {
  return {
    position: "absolute",
    left: `${x}%`,
    top: `${y}%`,
    marginLeft: `${-w / 2}px`,
    marginTop: `${-h / 2}px`,
  };
}

/** 生成对数螺旋路径 */
function genSpiral(a: number, b: number, turns: number, step: number): string {
  const pts: string[] = [];
  for (let t = 0; t <= turns * Math.PI * 2; t += step) {
    const r = a * Math.exp(b * t);
    pts.push(`${(r * Math.cos(t)).toFixed(1)},${(r * Math.sin(t)).toFixed(1)}`);
  }
  return "M " + pts.join(" L ");
}

/** 生成圆路径 */
function circlePath(r: number): string {
  return `M 0,${-r} C ${r * 0.55},${-r} ${r},${-r * 0.55} ${r},0 C ${r},${r * 0.55} ${r * 0.55},${r} 0,${r} C ${-r * 0.55},${r} ${-r},${r * 0.55} ${-r},0 C ${-r},${-r * 0.55} ${-r * 0.55},${-r} 0,${-r} Z`;
}

/** 生成波浪线路径 */
function genWave(amplitude: number, frequency: number): string {
  const pts: string[] = [];
  const steps = 60;
  for (let i = 0; i <= steps; i++) {
    const x = -110 + (i / steps) * 220;
    const y = amplitude * Math.sin((i / steps) * Math.PI * 2 * frequency);
    pts.push(`${x.toFixed(1)},${y.toFixed(1)}`);
  }
  return "M " + pts.join(" L ");
}

const ROT_CENTER: CSSProperties = {
  transformOrigin: "center",
  transformBox: "view-box",
};

const SVG_STYLE: CSSProperties = { overflow: "visible", display: "block" };

/* ========================================================================== *
 * 1. 预计算路径数据
 * ========================================================================== */

// ── 笔伐：墨剑斩击轨迹（标准） ──
const BIFA_SLASH = "M -100 -78 C -55 -52 -20 -26 5 4 C 30 34 60 58 100 82";
const BIFA_SPLATTERS = [
  { x: -60, y: -44, dx: -38, dy: -30, r: 5 },
  { x: -28, y: -14, dx: -24, dy: 18, r: 4 },
  { x: 4, y: 12, dx: 20, dy: 38, r: 6 },
  { x: 34, y: 40, dx: 40, dy: 24, r: 4 },
  { x: 64, y: 60, dx: 34, dy: -20, r: 5 },
  { x: -46, y: -60, dx: -44, dy: 12, r: 3 },
  { x: 20, y: 30, dx: 30, dy: 44, r: 3 },
  { x: 80, y: 68, dx: 24, dy: 34, r: 4 },
  { x: -80, y: -64, dx: -30, dy: -24, r: 3 },
  { x: 50, y: 50, dx: 44, dy: 14, r: 3 },
  { x: -15, y: -2, dx: -15, dy: -35, r: 3 },
  { x: 45, y: 20, dx: 50, dy: -10, r: 3 },
];

// ── 留白：竖直防御墨痕 ──
const LIUBAI_STROKE = "M 0,-100 C -6,-60 6,-30 0,0 C -6,30 6,60 0,100";

// ── 残墨：S形生命之藤 ──
const CANMO_STROKE = "M -100,30 C -60,-30 -30,45 0,-10 C 30,-50 60,25 100,-30";

// ── 破题：锯齿裂纹 ──
const POTI_STROKE = "M 0,100 L 7,55 L -5,15 L 9,-25 L -4,-60 L 5,-100";

// ── 墨潮：水平波浪 ──
const MOCHAO_STROKE = genWave(22, 2.5);

// ── 流言风暴：螺旋 ──
const LIUYAN_SPIRAL = genSpiral(3, 0.17, 2.8, 0.12);

// ── 论辨：双剑交叉 ──
const LUNBIAN_SLASH_1 = "M -85,-75 C -45,-35 -15,-5 75,85";
const LUNBIAN_SLASH_2 = "M 85,-75 C 45,-35 15,-5 -75,85";

// ── 续笔：延伸笔触 ──
const XUBI_STROKE = "M -115,28 C -72,-38 -30,48 10,-18 C 50,-58 82,28 115,-28";

// ── 止戈：圆形符文 ──
const ZHICHI_CIRCLE = circlePath(85);

/* ── 通用对称飞溅点生成器 ── */
function radialSplats(count: number, radius: number, rBase: number): { x: number; y: number; dx: number; dy: number; r: number }[] {
  return Array.from({ length: count }).map((_, i) => {
    const a = (i / count) * Math.PI * 2;
    const r = radius + (i % 2) * 18;
    return {
      x: r * Math.cos(a),
      y: r * Math.sin(a),
      dx: (r + 30) * Math.cos(a) - r * Math.cos(a),
      dy: (r + 30) * Math.sin(a) - r * Math.sin(a),
      r: rBase + (i % 2),
    };
  });
}

/* ========================================================================== *
 * 2. 可复用组件：三层墨痕 + 飞溅点
 * ========================================================================== */

interface TimingProps {
  d: number;
  dur: number;
}

/** 三层墨痕特效：发光层 + 主墨痕 + 白芯 */
function InkStroke({
  path, c1, c2, glow, d, dur,
  mainWidth = 8, glowWidth = 20, coreWidth = 2.5,
  rotate = 0,
}: {
  path: string; c1: string; c2: string; glow: string;
  d: number; dur: number;
  mainWidth?: number; glowWidth?: number; coreWidth?: number;
  rotate?: number;
}) {
  const rotateStyle = rotate ? { ...ROT_CENTER, rotate } : undefined;
  return (
    <>
      <motion.path d={path} stroke={c2} strokeWidth={glowWidth} strokeLinecap="round" fill="none"
        style={{ filter: `blur(7px)`, ...(rotateStyle as object) }}
        initial={{ pathLength: 0, opacity: 0 }}
        animate={{ pathLength: 1, opacity: [0, 0.4, 0] }}
        transition={{ duration: dur, delay: d, times: [0, 0.3, 1], ease: "easeOut" }} />
      <motion.path d={path} stroke={c1} strokeWidth={mainWidth} strokeLinecap="round" fill="none"
        style={{ filter: `drop-shadow(0 0 5px ${glow})`, ...(rotateStyle as object) }}
        initial={{ pathLength: 0, opacity: 0 }}
        animate={{ pathLength: 1, opacity: [0, 1, 0.6, 0] }}
        transition={{ duration: dur, delay: d, times: [0, 0.22, 0.7, 1], ease: "easeOut" }} />
      <motion.path d={path} stroke="#ffffff" strokeWidth={coreWidth} strokeLinecap="round" fill="none"
        style={rotateStyle}
        initial={{ pathLength: 0, opacity: 0 }}
        animate={{ pathLength: 1, opacity: [0, 0.9, 0] }}
        transition={{ duration: dur * 0.7, delay: d + dur * 0.12, times: [0, 0.5, 1], ease: "easeOut" }} />
    </>
  );
}

/** 对称飞溅墨点 */
function SplatterDots({
  dots, c1, c2, d, dur,
}: {
  dots: { x: number; y: number; dx: number; dy: number; r: number }[];
  c1: string; c2: string; d: number; dur: number;
}) {
  return (
    <>
      {dots.map((s, i) => (
        <motion.g key={i}
          initial={{ x: 0, y: 0, opacity: 0, scale: 0 }}
          animate={{ x: s.dx, y: s.dy, opacity: [0, 1, 0], scale: [0, 1, 0.2] }}
          transition={{ duration: dur, delay: d + 0.06 + i * 0.018, ease: "easeOut" }}>
          <circle cx={s.x} cy={s.y} r={s.r} fill={i % 2 === 0 ? c1 : c2} />
        </motion.g>
      ))}
    </>
  );
}

/** 中心爆光圆 */
function CenterBurst({ c1, d, dur, r = 20 }: { c1: string; d: number; dur: number; r?: number }) {
  return (
    <motion.circle cx={0} cy={0} r={r} fill={c1}
      style={{ filter: `blur(6px)`, ...ROT_CENTER }}
      initial={{ opacity: 0, scale: 0 }}
      animate={{ opacity: [0, 0.5, 0], scale: [0, 1.5, 0.5] }}
      transition={{ duration: dur * 0.5, delay: d, ease: "easeOut" }} />
  );
}

/* ========================================================================== *
 * 3. 主分发器
 * ========================================================================== */

export function SvgEffectLayer({
  cfg, pos, burstDelay, burstDuration,
}: {
  cfg: ResolvedEffectConfig;
  pos: { x: number; y: number };
  burstDelay: number;
  burstDuration: number;
}) {
  const d = burstDelay;
  const dur = burstDuration;
  const wrapStyle: CSSProperties = { ...absPos(pos.x, pos.y, SVG_SIZE, SVG_SIZE), pointerEvents: "none" };

  const renderSvg = (): React.ReactNode => {
    switch (cfg.key) {
      case "bifa": return <BifaInkSlash d={d} dur={dur} />;
      case "liubai": return <LiubaiInkShield d={d} dur={dur} />;
      case "canmo": return <CanmoInkVine d={d} dur={dur} />;
      case "poti": return <PotiInkCrack d={d} dur={dur} />;
      case "mochao": return <MochaoInkWave d={d} dur={dur} />;
      case "liuyan": return <LiuyanInkSpiral d={d} dur={dur} />;
      case "lunbian": return <LunbianInkCross d={d} dur={dur} />;
      case "cuanqu": return <CuanquInkChains d={d} dur={dur} />;
      case "xubi": return <XubiInkExtend d={d} dur={dur} />;
      case "zhichi": return <ZhichiInkRune d={d} dur={dur} />;
      case "pangzhu": return <PangzhuInkMargin d={d} dur={dur} />;
      case "fengbi": return <FengbiInkSeal d={d} dur={dur} />;
      case "gongxu": return <GongxuInkDual d={d} dur={dur} />;
      case "jiemo": return <JiemoInkStrings d={d} dur={dur} />;
      case "chongxu": return <ChongxuInkClock d={d} dur={dur} />;
      case "zhengshen": return <ZhengshenInkMirror d={d} dur={dur} />;
      case "suoshi": return <SuoshiInkHourglass d={d} dur={dur} />;
      case "buying": return <BuyingInkSteps d={d} dur={dur} />;
      case "caizhi": return <CaizhiInkCut d={d} dur={dur} />;
      case "ranxue": return <RanxueInkDrip d={d} dur={dur} />;
      case "xiuji": return <XiujiInkEnso d={d} dur={dur} />;
      case "bilei": return <BileiInkBolt d={d} dur={dur} />;
      case "liubaiping": return <LiubaipingInkVessel d={d} dur={dur} />;
      case "zhezhi": return <ZhezhiInkFold d={d} dur={dur} />;
      case "duya": return <DuyaInkCliff d={d} dur={dur} />;
      case "mitu": return <MituInkMaze d={d} dur={dur} />;
      default: return <ArchetypeSvg cfg={cfg} d={d} dur={dur} />;
    }
  };

  return <div style={wrapStyle}>{renderSvg()}</div>;
}

/* ========================================================================== *
 * 4. 关键卡牌专属 SVG（10 张）—— 每张牌拥有独特视觉标识
 * ========================================================================== */

/* ── 笔伐：墨剑斩击 + 剑刃残影 ── */
function BifaInkSlash({ d, dur }: TimingProps) {
  const c1 = PALETTE.bloodBright;
  const c2 = PALETTE.blood;
  return (
    <svg width={SVG_SIZE} height={SVG_SIZE} viewBox={VIEW_BOX} style={SVG_STYLE}>
      <InkStroke path={BIFA_SLASH} c1={c1} c2={c2} glow={c1} d={d} dur={dur} mainWidth={11} glowWidth={24} coreWidth={3} />
      {/* 独特：剑刃残影 —— 平行偏移的细线 */}
      <motion.path d={BIFA_SLASH} stroke={c1} strokeWidth={1} strokeLinecap="round" fill="none"
        style={{ filter: `blur(2px)`, ...ROT_CENTER, transform: "translate(-8px, 6px)" }}
        initial={{ pathLength: 0, opacity: 0 }}
        animate={{ pathLength: 1, opacity: [0, 0.3, 0] }}
        transition={{ duration: dur * 0.5, delay: d + 0.05, ease: "easeOut" }} />
      <SplatterDots dots={BIFA_SPLATTERS} c1={c1} c2={c2} d={d} dur={dur} />
    </svg>
  );
}

/* ── 留白：竖直防御 + 六边形护盾 ── */
function LiubaiInkShield({ d, dur }: TimingProps) {
  const c1 = PALETTE.ink;
  const c2 = PALETTE.creamLight;
  const splats = radialSplats(10, 50, 4);
  return (
    <svg width={SVG_SIZE} height={SVG_SIZE} viewBox={VIEW_BOX} style={SVG_STYLE}>
      <CenterBurst c1={c1} d={d} dur={dur} r={16} />
      <InkStroke path={LIUBAI_STROKE} c1={c1} c2={c2} glow={c1} d={d} dur={dur} mainWidth={9} glowWidth={22} coreWidth={2.5} />
      {/* 独特：六边形护盾屏障 */}
      <motion.path d="M 0,-75 L 65,-37 L 65,37 L 0,75 L -65,37 L -65,-37 Z"
        fill="none" stroke={c1} strokeWidth={1.5}
        style={{ filter: `drop-shadow(0 0 6px ${c1})` }}
        initial={{ opacity: 0, scale: 1.5 }}
        animate={{ opacity: [0, 0.5, 0.2, 0], scale: [1.5, 1, 0.95, 0.8] }}
        transition={{ duration: dur, delay: d + 0.1, times: [0, 0.3, 0.7, 1], ease: "easeOut" }} />
      <SplatterDots dots={splats} c1={c1} c2={c2} d={d} dur={dur} />
    </svg>
  );
}

/* ── 残墨：S形生命之藤 + 生长叶片 ── */
function CanmoInkVine({ d, dur }: TimingProps) {
  const c1 = PALETTE.emerald;
  const c2 = PALETTE.emeraldDeep;
  const splats = radialSplats(10, 48, 4);
  // 叶片位置沿 S 曲线分布
  const leaves = [
    { x: -60, y: -5, rot: -35 },
    { x: -20, y: 15, rot: 20 },
    { x: 15, y: -20, rot: -25 },
    { x: 55, y: 10, rot: 40 },
    { x: 85, y: -15, rot: -15 },
  ];
  return (
    <svg width={SVG_SIZE} height={SVG_SIZE} viewBox={VIEW_BOX} style={SVG_STYLE}>
      <CenterBurst c1={c1} d={d} dur={dur} r={16} />
      <InkStroke path={CANMO_STROKE} c1={c1} c2={c2} glow={c1} d={d} dur={dur} mainWidth={8} glowWidth={20} coreWidth={2.5} />
      {/* 独特：叶片 —— 沿藤蔓生长 */}
      {leaves.map((leaf, i) => (
        <motion.ellipse key={i}
          cx={leaf.x} cy={leaf.y} rx={5} ry={2.5}
          fill={c1} fillOpacity={0.6}
          style={{ filter: `drop-shadow(0 0 3px ${c1})`, ...ROT_CENTER, rotate: leaf.rot }}
          initial={{ opacity: 0, scale: 0 }}
          animate={{ opacity: [0, 0.7, 0.3, 0], scale: [0, 1, 0.8, 0.2] }}
          transition={{ duration: dur * 0.6, delay: d + 0.15 + i * 0.06, ease: "easeOut" }} />
      ))}
      <SplatterDots dots={splats} c1={c1} c2={c2} d={d} dur={dur} />
    </svg>
  );
}

/* ── 破题：锯齿裂纹 + 分支碎裂 ── */
function PotiInkCrack({ d, dur }: TimingProps) {
  const c1 = PALETTE.goldGlow;
  const c2 = PALETTE.goldBright;
  const splats = radialSplats(10, 52, 4);
  // 分支裂纹
  const branches = [
    "M 7,55 L 22,42 L 30,38",
    "M -5,15 L -20,8 L -28,3",
    "M 9,-25 L 24,-32 L 32,-38",
    "M -4,-60 L -18,-68 L -25,-75",
  ];
  return (
    <svg width={SVG_SIZE} height={SVG_SIZE} viewBox={VIEW_BOX} style={SVG_STYLE}>
      <CenterBurst c1={c1} d={d} dur={dur} r={18} />
      <InkStroke path={POTI_STROKE} c1={c1} c2={c2} glow={c1} d={d} dur={dur} mainWidth={7} glowWidth={18} coreWidth={2.5} />
      {/* 独特：分支碎裂纹 */}
      {branches.map((bp, i) => (
        <motion.path key={i} d={bp} stroke={c1} strokeWidth={1.5} strokeLinecap="round" fill="none"
          style={{ filter: `drop-shadow(0 0 3px ${c1})` }}
          initial={{ pathLength: 0, opacity: 0 }}
          animate={{ pathLength: 1, opacity: [0, 0.6, 0] }}
          transition={{ duration: dur * 0.6, delay: d + 0.1 + i * 0.05, ease: "easeOut" }} />
      ))}
      <SplatterDots dots={splats} c1={c1} c2={c2} d={d} dur={dur} />
    </svg>
  );
}

/* ── 墨潮：水平波浪 + 扩散涟漪环 ── */
function MochaoInkWave({ d, dur }: TimingProps) {
  const c1 = PALETTE.blood;
  const c2 = "#4a1010";
  const splats = radialSplats(10, 48, 4);
  return (
    <svg width={SVG_SIZE} height={SVG_SIZE} viewBox={VIEW_BOX} style={SVG_STYLE}>
      <CenterBurst c1={c1} d={d} dur={dur} r={16} />
      <InkStroke path={MOCHAO_STROKE} c1={c1} c2={c2} glow={c1} d={d} dur={dur} mainWidth={8} glowWidth={20} coreWidth={2.5} />
      {/* 独特：扩散涟漪环 */}
      {[35, 60, 85].map((r, i) => (
        <motion.ellipse key={r} cx={0} cy={0} rx={r} ry={r * 0.35}
          fill="none" stroke={c1} strokeWidth={1}
          style={{ filter: `blur(1px)` }}
          initial={{ opacity: 0, scale: 0 }}
          animate={{ opacity: [0, 0.4, 0], scale: [0, 1, 1.15] }}
          transition={{ duration: dur * 0.7, delay: d + 0.1 + i * 0.1, ease: "easeOut" }} />
      ))}
      <SplatterDots dots={splats} c1={c1} c2={c2} d={d} dur={dur} />
    </svg>
  );
}

/* ── 流言风暴：螺旋 + 旋转符文环 ── */
function LiuyanInkSpiral({ d, dur }: TimingProps) {
  const c1 = PALETTE.stormGray;
  const c2 = "#3a3a42";
  const splats = radialSplats(10, 50, 4);
  const glyphs = ["✦", "◇", "✧", "○", "✦", "◇", "✧", "○"];
  return (
    <svg width={SVG_SIZE} height={SVG_SIZE} viewBox={VIEW_BOX} style={SVG_STYLE}>
      <CenterBurst c1={c1} d={d} dur={dur} r={14} />
      <InkStroke path={LIUYAN_SPIRAL} c1={c1} c2={c2} glow={c1} d={d} dur={dur} mainWidth={6} glowWidth={16} coreWidth={2} />
      {/* 独特：旋转符文环 */}
      <motion.g style={ROT_CENTER}
        initial={{ rotate: 0, opacity: 0 }}
        animate={{ rotate: 360, opacity: [0, 0.5, 0] }}
        transition={{ duration: dur * 1.4, delay: d, ease: "easeOut" }}>
        {glyphs.map((g, i) => {
          const a = (i / glyphs.length) * Math.PI * 2;
          const r = 68;
          return (
            <text key={i} x={(r * Math.cos(a)).toFixed(1)} y={(r * Math.sin(a)).toFixed(1)}
              fill={c1} fontSize={7} textAnchor="middle" dominantBaseline="middle"
              style={{ filter: `drop-shadow(0 0 3px ${c1})` }}>{g}</text>
          );
        })}
      </motion.g>
      <SplatterDots dots={splats} c1={c1} c2={c2} d={d} dur={dur} />
    </svg>
  );
}

/* ── 论辨：双剑交叉 + 中心星芒 ── */
function LunbianInkCross({ d, dur }: TimingProps) {
  const c1 = PALETTE.bloodBright;
  const c2 = PALETTE.azure;
  const spark = PALETTE.goldGlow;
  const splats = radialSplats(10, 48, 4);
  return (
    <svg width={SVG_SIZE} height={SVG_SIZE} viewBox={VIEW_BOX} style={SVG_STYLE}>
      <CenterBurst c1={spark} d={d} dur={dur} r={18} />
      <InkStroke path={LUNBIAN_SLASH_1} c1={c1} c2={PALETTE.blood} glow={c1} d={d} dur={dur} mainWidth={8} glowWidth={20} coreWidth={2.5} />
      <InkStroke path={LUNBIAN_SLASH_2} c1={c2} c2={PALETTE.azureDeep} glow={c2} d={d} dur={dur} mainWidth={8} glowWidth={20} coreWidth={2.5} />
      {/* 独特：中心星芒 —— 八方向放射线 */}
      <motion.g style={ROT_CENTER}
        initial={{ opacity: 0, scale: 0 }}
        animate={{ opacity: [0, 0.8, 0], scale: [0, 1.5, 0.3] }}
        transition={{ duration: dur * 0.5, delay: d + dur * 0.3, ease: "easeOut" }}>
        {Array.from({ length: 8 }).map((_, i) => {
          const len = i % 2 === 0 ? 32 : 16;
          return (
            <line key={i} x1={0} y1={0} x2={0} y2={-len}
              stroke={spark} strokeWidth={i % 2 === 0 ? 2 : 1} strokeLinecap="round"
              transform={`rotate(${i * 45})`}
              style={{ filter: `drop-shadow(0 0 4px ${spark})` }} />
          );
        })}
      </motion.g>
      <SplatterDots dots={splats} c1={c1} c2={c2} d={d} dur={dur} />
    </svg>
  );
}

/* ── 篡取：五方汇聚 + 锁链节点 ── */
function CuanquInkChains({ d, dur }: TimingProps) {
  const c1 = PALETTE.violet;
  const c2 = PALETTE.violetBright;
  const dirs = [0, 72, 144, 216, 288];
  const splats = radialSplats(10, 50, 4);
  return (
    <svg width={SVG_SIZE} height={SVG_SIZE} viewBox={VIEW_BOX} style={SVG_STYLE}>
      <CenterBurst c1={c1} d={d} dur={dur} r={14} />
      {dirs.map((rot) => (
        <InkStroke key={rot} path="M 110,0 L 10,0" c1={c1} c2={c2} glow={c1} d={d} dur={dur}
          mainWidth={5} glowWidth={14} coreWidth={1.5} rotate={rot} />
      ))}
      {/* 独特：锁链节点 —— 沿汇聚线分布的小圆环 */}
      {dirs.map((rot, i) => {
        const rad = (rot * Math.PI) / 180;
        return [30, 55, 80].map((dist, j) => (
          <motion.circle key={`${i}-${j}`}
            cx={(dist * Math.cos(rad)).toFixed(1)} cy={(dist * Math.sin(rad)).toFixed(1)} r={3}
            fill="none" stroke={c1} strokeWidth={1}
            style={{ filter: `drop-shadow(0 0 2px ${c1})` }}
            initial={{ opacity: 0, scale: 0 }}
            animate={{ opacity: [0, 0.6, 0], scale: [0, 1, 0.3] }}
            transition={{ duration: dur * 0.6, delay: d + 0.1 + j * 0.08, ease: "easeOut" }} />
        ));
      })}
      <SplatterDots dots={splats} c1={c1} c2={c2} d={d} dur={dur} />
    </svg>
  );
}

/* ── 续笔：延伸笔触 + 墨滴尾迹 ── */
function XubiInkExtend({ d, dur }: TimingProps) {
  const c1 = PALETTE.violet;
  const c2 = PALETTE.violetBright;
  const drops = [
    { x: -95, y: 10 },
    { x: -60, y: -12 },
    { x: -25, y: 18 },
    { x: 10, y: -15 },
    { x: 45, y: 12 },
    { x: 80, y: -8 },
    { x: 110, y: 5 },
  ];
  const splats = radialSplats(8, 50, 3.5);
  return (
    <svg width={SVG_SIZE} height={SVG_SIZE} viewBox={VIEW_BOX} style={SVG_STYLE}>
      <InkStroke path={XUBI_STROKE} c1={c1} c2={c2} glow={c1} d={d} dur={dur} mainWidth={8} glowWidth={20} coreWidth={2.5} />
      {/* 独特：墨滴尾迹 —— 沿笔触分布的水滴形 */}
      {drops.map((drop, i) => (
        <motion.ellipse key={i}
          cx={drop.x} cy={drop.y} rx={2} ry={3.5}
          fill={c1} fillOpacity={0.7}
          style={{ filter: `drop-shadow(0 0 2px ${c1})` }}
          initial={{ opacity: 0, scale: 0 }}
          animate={{ opacity: [0, 0.6, 0], scale: [0, 1, 0.2] }}
          transition={{ duration: dur * 0.4, delay: d + i * 0.04, ease: "easeOut" }} />
      ))}
      <SplatterDots dots={splats} c1={c2} c2={c1} d={d} dur={dur} />
    </svg>
  );
}

/* ── 止戈：圆形符文 + 内五芒星 ── */
function ZhichiInkRune({ d, dur }: TimingProps) {
  const c1 = PALETTE.goldGlow;
  const c2 = PALETTE.goldBright;
  const splats = radialSplats(12, 55, 4);
  return (
    <svg width={SVG_SIZE} height={SVG_SIZE} viewBox={VIEW_BOX} style={SVG_STYLE}>
      <CenterBurst c1={c1} d={d} dur={dur} r={20} />
      <InkStroke path={ZHICHI_CIRCLE} c1={c1} c2={c2} glow={c1} d={d} dur={dur} mainWidth={7} glowWidth={18} coreWidth={2.5} />
      {/* 独特：内五芒星 */}
      <motion.path d="M 0,-40 L 38,20 L -38,20 Z M 0,40 L 38,-20 L -38,-20 Z"
        fill="none" stroke={c1} strokeWidth={1.5}
        style={{ filter: `drop-shadow(0 0 4px ${c1})`, ...ROT_CENTER }}
        initial={{ opacity: 0, rotate: -30, scale: 0 }}
        animate={{ opacity: [0, 0.5, 0], rotate: [-30, 30, 60], scale: [0, 1, 0.8] }}
        transition={{ duration: dur, delay: d + 0.15, ease: "easeOut" }} />
      <SplatterDots dots={splats} c1={c1} c2={c2} d={d} dur={dur} />
    </svg>
  );
}

/* ========================================================================== *
 * 4-B. 其余卡牌专属 SVG（16 张）—— 每张牌拥有独特视觉标识
 * ========================================================================== */

/* ── 旁注：水平批注线 + 两侧竖向标记 ── */
function PangzhuInkMargin({ d, dur }: TimingProps) {
  const c1 = PALETTE.goldDim;
  const c2 = PALETTE.parchment;
  const splats = radialSplats(8, 48, 3.5);
  return (
    <svg width={SVG_SIZE} height={SVG_SIZE} viewBox={VIEW_BOX} style={SVG_STYLE}>
      <CenterBurst c1={c1} d={d} dur={dur} r={14} />
      <InkStroke path="M -95,0 L 95,0" c1={c1} c2={c2} glow={c1} d={d} dur={dur} mainWidth={6} glowWidth={16} coreWidth={2} />
      {/* 独特：两侧竖向批注标记 */}
      {[-80, -50, 50, 80].map((x, i) => (
        <motion.line key={i} x1={x} y1={-18} x2={x} y2={18}
          stroke={c1} strokeWidth={1.5} strokeLinecap="round"
          style={{ filter: `drop-shadow(0 0 3px ${c1})` }}
          initial={{ pathLength: 0, opacity: 0 }}
          animate={{ pathLength: 1, opacity: [0, 0.6, 0] }}
          transition={{ duration: dur * 0.5, delay: d + 0.1 + i * 0.04, ease: "easeOut" }} />
      ))}
      <SplatterDots dots={splats} c1={c1} c2={c2} d={d} dur={dur} />
    </svg>
  );
}

/* ── 封笔：圆形封印 + 内方框蜡印 ── */
function FengbiInkSeal({ d, dur }: TimingProps) {
  const c1 = PALETTE.gold;
  const c2 = PALETTE.goldDim;
  const splats = radialSplats(10, 52, 4);
  return (
    <svg width={SVG_SIZE} height={SVG_SIZE} viewBox={VIEW_BOX} style={SVG_STYLE}>
      <CenterBurst c1={c1} d={d} dur={dur} r={18} />
      <InkStroke path={circlePath(82)} c1={c1} c2={c2} glow={c1} d={d} dur={dur} mainWidth={7} glowWidth={18} coreWidth={2.5} />
      {/* 独特：内方框蜡印 */}
      <motion.rect x={-40} y={-40} width={80} height={80} rx={3}
        fill="none" stroke={c1} strokeWidth={2}
        style={{ filter: `drop-shadow(0 0 5px ${c1})`, ...ROT_CENTER }}
        initial={{ opacity: 0, rotate: 45, scale: 0 }}
        animate={{ opacity: [0, 0.7, 0.3, 0], rotate: [45, 0, -10, -20], scale: [0, 1, 0.9, 0.7] }}
        transition={{ duration: dur, delay: d + 0.15, times: [0, 0.3, 0.7, 1], ease: "easeOut" }} />
      <SplatterDots dots={splats} c1={c1} c2={c2} d={d} dur={dur} />
    </svg>
  );
}

/* ── 共叙：双圆互锁（文氏图） ── */
function GongxuInkDual({ d, dur }: TimingProps) {
  const c1 = PALETTE.emerald;
  const c2 = PALETTE.emeraldDeep;
  const splats = radialSplats(8, 50, 3.5);
  return (
    <svg width={SVG_SIZE} height={SVG_SIZE} viewBox={VIEW_BOX} style={SVG_STYLE}>
      <CenterBurst c1={c1} d={d} dur={dur} r={14} />
      {/* 独特：双圆互锁 */}
      <motion.circle cx={-28} cy={0} r={48} fill="none" stroke={c1} strokeWidth={2.5}
        style={{ filter: `drop-shadow(0 0 5px ${c1})` }}
        initial={{ pathLength: 0, opacity: 0 }}
        animate={{ pathLength: 1, opacity: [0, 0.7, 0.3, 0] }}
        transition={{ duration: dur, delay: d, times: [0, 0.3, 0.7, 1], ease: "easeOut" }} />
      <motion.circle cx={28} cy={0} r={48} fill="none" stroke={c2} strokeWidth={2.5}
        style={{ filter: `drop-shadow(0 0 5px ${c2})` }}
        initial={{ pathLength: 0, opacity: 0 }}
        animate={{ pathLength: 1, opacity: [0, 0.7, 0.3, 0] }}
        transition={{ duration: dur, delay: d + 0.1, times: [0, 0.3, 0.7, 1], ease: "easeOut" }} />
      <SplatterDots dots={splats} c1={c1} c2={c2} d={d} dur={dur} />
    </svg>
  );
}

/* ── 借墨：提线横杆 + 下垂丝线 ── */
function JiemoInkStrings({ d, dur }: TimingProps) {
  const c1 = PALETTE.violet;
  const c2 = PALETTE.parchmentDeep;
  const splats = radialSplats(8, 48, 3.5);
  const strings = [-45, -15, 15, 45];
  return (
    <svg width={SVG_SIZE} height={SVG_SIZE} viewBox={VIEW_BOX} style={SVG_STYLE}>
      <CenterBurst c1={c1} d={d} dur={dur} r={12} />
      {/* 独特：提线横杆 */}
      <motion.line x1={-70} y1={-55} x2={70} y2={-55}
        stroke={c1} strokeWidth={3} strokeLinecap="round"
        style={{ filter: `drop-shadow(0 0 4px ${c1})` }}
        initial={{ pathLength: 0, opacity: 0 }}
        animate={{ pathLength: 1, opacity: [0, 0.7, 0] }}
        transition={{ duration: dur * 0.5, delay: d, ease: "easeOut" }} />
      {/* 下垂丝线 */}
      {strings.map((x, i) => (
        <motion.line key={i} x1={x} y1={-55} x2={x} y2={50}
          stroke={c1} strokeWidth={1} strokeLinecap="round"
          style={{ filter: `drop-shadow(0 0 2px ${c1})` }}
          initial={{ pathLength: 0, opacity: 0 }}
          animate={{ pathLength: 1, opacity: [0, 0.5, 0] }}
          transition={{ duration: dur * 0.6, delay: d + 0.1 + i * 0.05, ease: "easeOut" }} />
      ))}
      {/* 丝线末端节点 */}
      {strings.map((x, i) => (
        <motion.circle key={`n${i}`} cx={x} cy={50} r={3} fill={c1}
          style={{ filter: `drop-shadow(0 0 3px ${c1})` }}
          initial={{ opacity: 0, scale: 0 }}
          animate={{ opacity: [0, 0.7, 0], scale: [0, 1, 0.3] }}
          transition={{ duration: dur * 0.4, delay: d + 0.3 + i * 0.05, ease: "easeOut" }} />
      ))}
      <SplatterDots dots={splats} c1={c1} c2={c2} d={d} dur={dur} />
    </svg>
  );
}

/* ── 重叙：时钟面 + 旋转指针 ── */
function ChongxuInkClock({ d, dur }: TimingProps) {
  const c1 = PALETTE.violet;
  const c2 = PALETTE.parchmentDarker;
  const splats = radialSplats(10, 52, 4);
  return (
    <svg width={SVG_SIZE} height={SVG_SIZE} viewBox={VIEW_BOX} style={SVG_STYLE}>
      <CenterBurst c1={c1} d={d} dur={dur} r={16} />
      <InkStroke path={circlePath(78)} c1={c1} c2={c2} glow={c1} d={d} dur={dur} mainWidth={6} glowWidth={16} coreWidth={2} />
      {/* 独特：12点刻度 */}
      {Array.from({ length: 12 }).map((_, i) => {
        const a = (i * 30 - 90) * Math.PI / 180;
        const x1 = 70 * Math.cos(a), y1 = 70 * Math.sin(a);
        const x2 = 78 * Math.cos(a), y2 = 78 * Math.sin(a);
        return (
          <motion.line key={i} x1={x1.toFixed(1)} y1={y1.toFixed(1)} x2={x2.toFixed(1)} y2={y2.toFixed(1)}
            stroke={c1} strokeWidth={1}
            initial={{ opacity: 0 }}
            animate={{ opacity: [0, 0.5, 0] }}
            transition={{ duration: dur * 0.5, delay: d + 0.1 + i * 0.02, ease: "easeOut" }} />
        );
      })}
      {/* 旋转指针 */}
      <motion.g style={ROT_CENTER}
        initial={{ rotate: 0, opacity: 0 }}
        animate={{ rotate: 270, opacity: [0, 0.7, 0] }}
        transition={{ duration: dur, delay: d + 0.15, ease: "easeOut" }}>
        <line x1={0} y1={0} x2={0} y2={-55} stroke={c1} strokeWidth={2} strokeLinecap="round"
          style={{ filter: `drop-shadow(0 0 4px ${c1})` }} />
        <line x1={0} y1={0} x2={0} y2={35} stroke={c2} strokeWidth={1.5} strokeLinecap="round" />
        <circle cx={0} cy={0} r={3} fill={c1} />
      </motion.g>
      <SplatterDots dots={splats} c1={c1} c2={c2} d={d} dur={dur} />
    </svg>
  );
}

/* ── 正身：中轴镜面 + 对称羽翼 ── */
function ZhengshenInkMirror({ d, dur }: TimingProps) {
  const c1 = PALETTE.goldGlow;
  const c2 = "#fff5d0";
  const splats = radialSplats(10, 50, 4);
  return (
    <svg width={SVG_SIZE} height={SVG_SIZE} viewBox={VIEW_BOX} style={SVG_STYLE}>
      <CenterBurst c1={c1} d={d} dur={dur} r={18} />
      {/* 独特：中轴线 */}
      <motion.line x1={0} y1={-90} x2={0} y2={90}
        stroke={c1} strokeWidth={1} strokeDasharray="3 3"
        style={{ filter: `drop-shadow(0 0 3px ${c1})` }}
        initial={{ pathLength: 0, opacity: 0 }}
        animate={{ pathLength: 1, opacity: [0, 0.4, 0] }}
        transition={{ duration: dur * 0.6, delay: d, ease: "easeOut" }} />
      {/* 对称羽翼 */}
      {[-1, 1].map((dir) => (
        <motion.path key={dir}
          d={`M 0,-60 C ${dir * 30},-50 ${dir * 70},-20 ${dir * 85},10 C ${dir * 70},40 ${dir * 30},55 0,60`}
          fill="none" stroke={c1} strokeWidth={2.5} strokeLinecap="round"
          style={{ filter: `drop-shadow(0 0 5px ${c1})` }}
          initial={{ pathLength: 0, opacity: 0 }}
          animate={{ pathLength: 1, opacity: [0, 0.7, 0.3, 0] }}
          transition={{ duration: dur, delay: d + 0.1, times: [0, 0.3, 0.7, 1], ease: "easeOut" }} />
      ))}
      <SplatterDots dots={splats} c1={c1} c2={c2} d={d} dur={dur} />
    </svg>
  );
}

/* ── 溯时沙漏：双三角漏斗 ── */
function SuoshiInkHourglass({ d, dur }: TimingProps) {
  const c1 = PALETTE.goldBright;
  const c2 = PALETTE.goldGlow;
  const splats = radialSplats(8, 48, 3.5);
  const hourglass = "M -60,-80 L 60,-80 L 10,0 L 60,80 L -60,80 L -10,0 Z";
  return (
    <svg width={SVG_SIZE} height={SVG_SIZE} viewBox={VIEW_BOX} style={SVG_STYLE}>
      <CenterBurst c1={c1} d={d} dur={dur} r={14} />
      {/* 独特：沙漏轮廓 */}
      <motion.path d={hourglass} fill="none" stroke={c1} strokeWidth={2.5} strokeLinejoin="round"
        style={{ filter: `drop-shadow(0 0 5px ${c1})` }}
        initial={{ pathLength: 0, opacity: 0 }}
        animate={{ pathLength: 1, opacity: [0, 0.7, 0.3, 0] }}
        transition={{ duration: dur, delay: d, times: [0, 0.3, 0.7, 1], ease: "easeOut" }} />
      {/* 流沙颗粒 */}
      {[-30, -10, 10, 30].map((y, i) => (
        <motion.circle key={i} cx={0} cy={y} r={2} fill={c2}
          style={{ filter: `drop-shadow(0 0 2px ${c1})` }}
          initial={{ opacity: 0, scale: 0 }}
          animate={{ opacity: [0, 0.6, 0], scale: [0, 1, 0.3], y: [y, y + 15, y + 30] }}
          transition={{ duration: dur * 0.6, delay: d + 0.15 + i * 0.08, ease: "easeOut" }} />
      ))}
      <SplatterDots dots={splats} c1={c1} c2={c2} d={d} dur={dur} />
    </svg>
  );
}

/* ── 捕影画框：矩形画框 + 十字准星 ── */
function BuyingInkSteps({ d, dur }: TimingProps) {
  const c1 = PALETTE.silver;
  const c2 = PALETTE.creamLight;
  const splats = radialSplats(8, 48, 3.5);
  const frame = "M -75,-55 L 75,-55 L 75,55 L -75,55 Z";
  return (
    <svg width={SVG_SIZE} height={SVG_SIZE} viewBox={VIEW_BOX} style={SVG_STYLE}>
      <CenterBurst c1={c1} d={d} dur={dur} r={14} />
      {/* 独特：画框 */}
      <motion.path d={frame} fill="none" stroke={c1} strokeWidth={2.5} strokeLinejoin="round"
        style={{ filter: `drop-shadow(0 0 4px ${c1})` }}
        initial={{ pathLength: 0, opacity: 0 }}
        animate={{ pathLength: 1, opacity: [0, 0.6, 0.3, 0] }}
        transition={{ duration: dur, delay: d, times: [0, 0.3, 0.7, 1], ease: "easeOut" }} />
      {/* 十字准星 */}
      <motion.line x1={-20} y1={0} x2={20} y2={0} stroke={c1} strokeWidth={1.5} strokeLinecap="round"
        style={{ filter: `drop-shadow(0 0 3px ${c1})` }}
        initial={{ pathLength: 0, opacity: 0 }}
        animate={{ pathLength: 1, opacity: [0, 0.6, 0] }}
        transition={{ duration: dur * 0.5, delay: d + 0.2, ease: "easeOut" }} />
      <motion.line x1={0} y1={-20} x2={0} y2={20} stroke={c1} strokeWidth={1.5} strokeLinecap="round"
        style={{ filter: `drop-shadow(0 0 3px ${c1})` }}
        initial={{ pathLength: 0, opacity: 0 }}
        animate={{ pathLength: 1, opacity: [0, 0.6, 0] }}
        transition={{ duration: dur * 0.5, delay: d + 0.2, ease: "easeOut" }} />
      <SplatterDots dots={splats} c1={c1} c2={c2} d={d} dur={dur} />
    </svg>
  );
}

/* ── 裁纸利刃：V形剪切 ── */
function CaizhiInkCut({ d, dur }: TimingProps) {
  const c1 = PALETTE.steel;
  const c2 = PALETTE.creamLight;
  const splats = radialSplats(8, 48, 3.5);
  return (
    <svg width={SVG_SIZE} height={SVG_SIZE} viewBox={VIEW_BOX} style={SVG_STYLE}>
      <CenterBurst c1={c1} d={d} dur={dur} r={14} />
      {/* 独特：V形剪切 */}
      <motion.path d="M -80,60 L 0,-70 L 80,60"
        fill="none" stroke={c1} strokeWidth={3} strokeLinejoin="round" strokeLinecap="round"
        style={{ filter: `drop-shadow(0 0 5px ${c1})` }}
        initial={{ pathLength: 0, opacity: 0 }}
        animate={{ pathLength: 1, opacity: [0, 0.8, 0.3, 0] }}
        transition={{ duration: dur, delay: d, times: [0, 0.3, 0.7, 1], ease: "easeOut" }} />
      {/* 剪切裂纹 */}
      {[-40, 40].map((x, i) => (
        <motion.line key={i} x1={x} y1={20} x2={x * 1.5} y2={70}
          stroke={c1} strokeWidth={1} strokeLinecap="round"
          style={{ filter: `drop-shadow(0 0 2px ${c1})` }}
          initial={{ pathLength: 0, opacity: 0 }}
          animate={{ pathLength: 1, opacity: [0, 0.5, 0] }}
          transition={{ duration: dur * 0.5, delay: d + 0.15 + i * 0.05, ease: "easeOut" }} />
      ))}
      <SplatterDots dots={splats} c1={c1} c2={c2} d={d} dur={dur} />
    </svg>
  );
}

/* ── 染血墨笔：垂直流淌 + 血滴 ── */
function RanxueInkDrip({ d, dur }: TimingProps) {
  const c1 = PALETTE.bloodBright;
  const c2 = PALETTE.goldDim;
  const splats = radialSplats(8, 48, 3.5);
  const drips = [-50, -20, 10, 40];
  return (
    <svg width={SVG_SIZE} height={SVG_SIZE} viewBox={VIEW_BOX} style={SVG_STYLE}>
      <CenterBurst c1={c1} d={d} dur={dur} r={14} />
      {/* 独特：垂直流淌线 */}
      {drips.map((x, i) => (
        <motion.path key={i}
          d={`M ${x},-80 C ${x + 5},-40 ${x - 3},0 ${x + 2},40 C ${x + 4},60 ${x},75 ${x},85`}
          fill="none" stroke={c1} strokeWidth={2} strokeLinecap="round"
          style={{ filter: `drop-shadow(0 0 4px ${c1})` }}
          initial={{ pathLength: 0, opacity: 0 }}
          animate={{ pathLength: 1, opacity: [0, 0.7, 0.3, 0] }}
          transition={{ duration: dur, delay: d + i * 0.06, times: [0, 0.3, 0.7, 1], ease: "easeOut" }} />
      ))}
      {/* 末端血滴 */}
      {drips.map((x, i) => (
        <motion.circle key={`d${i}`} cx={x} cy={85} r={4} fill={c1}
          style={{ filter: `drop-shadow(0 0 4px ${c1})` }}
          initial={{ opacity: 0, scale: 0, y: -20 }}
          animate={{ opacity: [0, 0.8, 0], scale: [0, 1, 0.3], y: [-20, 0, 15] }}
          transition={{ duration: dur * 0.5, delay: d + 0.3 + i * 0.06, ease: "easeOut" }} />
      ))}
      <SplatterDots dots={splats} c1={c1} c2={c2} d={d} dur={dur} />
    </svg>
  );
}

/* ── 锈迹刻刀：残缺圆环（円相） ── */
function XiujiInkEnso({ d, dur }: TimingProps) {
  const c1 = PALETTE.rust;
  const c2 = PALETTE.parchment;
  const splats = radialSplats(8, 50, 3.5);
  return (
    <svg width={SVG_SIZE} height={SVG_SIZE} viewBox={VIEW_BOX} style={SVG_STYLE}>
      <CenterBurst c1={c1} d={d} dur={dur} r={14} />
      {/* 独特：円相（不完整圆） */}
      <motion.path d="M 20,-72 C 60,-68 82,-30 78,10 C 74,50 40,78 0,76 C -40,74 -72,46 -76,6 C -80,-34 -52,-68 -14,-74"
        fill="none" stroke={c1} strokeWidth={4} strokeLinecap="round"
        style={{ filter: `drop-shadow(0 0 6px ${c1})` }}
        initial={{ pathLength: 0, opacity: 0 }}
        animate={{ pathLength: 1, opacity: [0, 0.8, 0.4, 0] }}
        transition={{ duration: dur, delay: d, times: [0, 0.3, 0.7, 1], ease: "easeOut" }} />
      {/* 锈斑 */}
      {[
        { x: 60, y: -30, r: 3 },
        { x: -50, y: 40, r: 2 },
        { x: 30, y: 60, r: 2.5 },
        { x: -60, y: -20, r: 2 },
      ].map((s, i) => (
        <motion.circle key={i} cx={s.x} cy={s.y} r={s.r} fill={c1} fillOpacity={0.5}
          style={{ filter: `blur(1px)` }}
          initial={{ opacity: 0, scale: 0 }}
          animate={{ opacity: [0, 0.6, 0], scale: [0, 1, 0.5] }}
          transition={{ duration: dur * 0.5, delay: d + 0.2 + i * 0.06, ease: "easeOut" }} />
      ))}
      <SplatterDots dots={splats} c1={c1} c2={c2} d={d} dur={dur} />
    </svg>
  );
}

/* ── 叙事壁垒：水平层叠壁垒 ── */
function BileiInkBolt({ d, dur }: TimingProps) {
  const c1 = PALETTE.bronze;
  const c2 = PALETTE.goldDim;
  const splats = radialSplats(8, 48, 3.5);
  const bars = [-50, -20, 10, 40];
  return (
    <svg width={SVG_SIZE} height={SVG_SIZE} viewBox={VIEW_BOX} style={SVG_STYLE}>
      <CenterBurst c1={c1} d={d} dur={dur} r={14} />
      {/* 独特：水平层叠壁垒 */}
      {bars.map((y, i) => {
        const w = 90 - Math.abs(y) * 0.4;
        return (
          <motion.rect key={i}
            x={-w / 2} y={y - 6} width={w} height={10} rx={2}
            fill="none" stroke={c1} strokeWidth={2}
            style={{ filter: `drop-shadow(0 0 4px ${c1})` }}
            initial={{ opacity: 0, scaleX: 0 }}
            animate={{ opacity: [0, 0.7, 0.3, 0], scaleX: [0, 1, 1, 0.8] }}
            transition={{ duration: dur, delay: d + i * 0.06, times: [0, 0.3, 0.7, 1], ease: "easeOut" }} />
        );
      })}
      <SplatterDots dots={splats} c1={c1} c2={c2} d={d} dur={dur} />
    </svg>
  );
}

/* ── 留白屏障：竖向栅栏 ── */
function LiubaipingInkVessel({ d, dur }: TimingProps) {
  const c1 = PALETTE.ink;
  const c2 = PALETTE.creamLight;
  const splats = radialSplats(8, 48, 3.5);
  const bars = [-60, -30, 0, 30, 60];
  return (
    <svg width={SVG_SIZE} height={SVG_SIZE} viewBox={VIEW_BOX} style={SVG_STYLE}>
      <CenterBurst c1={c1} d={d} dur={dur} r={14} />
      {/* 独特：竖向栅栏 */}
      {bars.map((x, i) => (
        <motion.line key={i} x1={x} y1={-75} x2={x} y2={75}
          stroke={c1} strokeWidth={3} strokeLinecap="round"
          style={{ filter: `drop-shadow(0 0 4px ${c1})` }}
          initial={{ pathLength: 0, opacity: 0 }}
          animate={{ pathLength: 1, opacity: [0, 0.7, 0.3, 0] }}
          transition={{ duration: dur, delay: d + i * 0.04, times: [0, 0.3, 0.7, 1], ease: "easeOut" }} />
      ))}
      {/* 顶部横梁 */}
      <motion.line x1={-75} y1={-75} x2={75} y2={-75}
        stroke={c1} strokeWidth={2} strokeLinecap="round"
        style={{ filter: `drop-shadow(0 0 3px ${c1})` }}
        initial={{ pathLength: 0, opacity: 0 }}
        animate={{ pathLength: 1, opacity: [0, 0.5, 0] }}
        transition={{ duration: dur * 0.5, delay: d + 0.2, ease: "easeOut" }} />
      <SplatterDots dots={splats} c1={c1} c2={c2} d={d} dur={dur} />
    </svg>
  );
}

/* ── 折纸之翼：对角折痕 ── */
function ZhezhiInkFold({ d, dur }: TimingProps) {
  const c1 = PALETTE.ink;
  const c2 = PALETTE.creamLight;
  const splats = radialSplats(8, 48, 3.5);
  return (
    <svg width={SVG_SIZE} height={SVG_SIZE} viewBox={VIEW_BOX} style={SVG_STYLE}>
      <CenterBurst c1={c1} d={d} dur={dur} r={14} />
      {/* 独特：对角折痕 */}
      <motion.path d="M -80,-80 L 80,80 M 80,-80 L -80,80 M -80,0 L 80,0 M 0,-80 L 0,80"
        stroke={c1} strokeWidth={1.5} fill="none" strokeLinecap="round"
        style={{ filter: `drop-shadow(0 0 4px ${c1})` }}
        initial={{ pathLength: 0, opacity: 0 }}
        animate={{ pathLength: 1, opacity: [0, 0.6, 0.2, 0] }}
        transition={{ duration: dur, delay: d, times: [0, 0.3, 0.7, 1], ease: "easeOut" }} />
      {/* 折叠三角 */}
      {[
        { p: "M 0,0 L 35,-35 L 35,0 Z", delay: 0.1 },
        { p: "M 0,0 L -35,35 L -35,0 Z", delay: 0.15 },
        { p: "M 0,0 L -35,-35 L 0,-35 Z", delay: 0.2 },
        { p: "M 0,0 L 35,35 L 0,35 Z", delay: 0.25 },
      ].map((tri, i) => (
        <motion.path key={i} d={tri.p} fill={c1} fillOpacity={0.15}
          stroke={c1} strokeWidth={1}
          style={{ filter: `drop-shadow(0 0 3px ${c1})` }}
          initial={{ opacity: 0, scale: 0 }}
          animate={{ opacity: [0, 0.5, 0], scale: [0, 1, 0.5] }}
          transition={{ duration: dur * 0.5, delay: d + tri.delay, ease: "easeOut" }} />
      ))}
      <SplatterDots dots={splats} c1={c1} c2={c2} d={d} dur={dur} />
    </svg>
  );
}

/* ── 渡鸦信使：展翅轮廓 ── */
function DuyaInkCliff({ d, dur }: TimingProps) {
  const c1 = PALETTE.ravenBlack;
  const c2 = PALETTE.steel;
  const splats = radialSplats(8, 48, 3.5);
  return (
    <svg width={SVG_SIZE} height={SVG_SIZE} viewBox={VIEW_BOX} style={SVG_STYLE}>
      <CenterBurst c1={c2} d={d} dur={dur} r={14} />
      {/* 独特：渡鸦展翅 */}
      <motion.path d="M -90,20 C -70,-10 -50,-30 -20,-25 C -10,-40 10,-40 20,-25 C 50,-30 70,-10 90,20"
        fill="none" stroke={c1} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round"
        style={{ filter: `drop-shadow(0 0 5px ${c1})` }}
        initial={{ pathLength: 0, opacity: 0 }}
        animate={{ pathLength: 1, opacity: [0, 0.8, 0.3, 0] }}
        transition={{ duration: dur, delay: d, times: [0, 0.3, 0.7, 1], ease: "easeOut" }} />
      {/* 羽毛纹理 */}
      {[-60, -30, 30, 60].map((x, i) => (
        <motion.line key={i}
          x1={x} y1={10} x2={x * 0.7} y2={-20}
          stroke={c2} strokeWidth={1} strokeLinecap="round"
          style={{ filter: `drop-shadow(0 0 2px ${c2})` }}
          initial={{ pathLength: 0, opacity: 0 }}
          animate={{ pathLength: 1, opacity: [0, 0.5, 0] }}
          transition={{ duration: dur * 0.5, delay: d + 0.15 + i * 0.04, ease: "easeOut" }} />
      ))}
      <SplatterDots dots={splats} c1={c1} c2={c2} d={d} dur={dur} />
    </svg>
  );
}

/* ── 迷途指南针：四向星芒罗盘 ── */
function MituInkMaze({ d, dur }: TimingProps) {
  const c1 = PALETTE.silver;
  const c2 = PALETTE.creamLight;
  const splats = radialSplats(10, 50, 4);
  return (
    <svg width={SVG_SIZE} height={SVG_SIZE} viewBox={VIEW_BOX} style={SVG_STYLE}>
      <CenterBurst c1={c1} d={d} dur={dur} r={16} />
      <InkStroke path={circlePath(75)} c1={c1} c2={c2} glow={c1} d={d} dur={dur} mainWidth={5} glowWidth={14} coreWidth={1.5} />
      {/* 独特：四向星芒罗盘 */}
      <motion.g style={ROT_CENTER}
        initial={{ opacity: 0, scale: 0, rotate: -45 }}
        animate={{ opacity: [0, 0.8, 0.3, 0], scale: [0, 1, 0.9, 0.7], rotate: [-45, 0, 15, 30] }}
        transition={{ duration: dur, delay: d + 0.1, times: [0, 0.3, 0.7, 1], ease: "easeOut" }}>
        {/* 主十字 */}
        <path d="M 0,-65 L 8,0 L 0,65 L -8,0 Z" fill={c1} fillOpacity={0.4} stroke={c1} strokeWidth={1.5}
          style={{ filter: `drop-shadow(0 0 4px ${c1})` }} />
        <path d="M -65,0 L 0,-8 L 65,0 L 0,8 Z" fill={c2} fillOpacity={0.3} stroke={c2} strokeWidth={1.5}
          style={{ filter: `drop-shadow(0 0 4px ${c2})` }} />
        {/* 中心点 */}
        <circle cx={0} cy={0} r={3} fill={c1} />
      </motion.g>
      <SplatterDots dots={splats} c1={c1} c2={c2} d={d} dur={dur} />
    </svg>
  );
}

/* ========================================================================== *
 * 5. 通用原型 SVG（按 archetype 分发）
 * ========================================================================== */

function ArchetypeSvg({ cfg, d, dur }: { cfg: ResolvedEffectConfig; d: number; dur: number }) {
  const c1 = cfg.primaryColor;
  const c2 = cfg.secondaryColor;
  const glow = cfg.glowColor;
  const splats = radialSplats(8, 48, 3.5);

  const svg = (children: React.ReactNode): React.ReactNode => (
    <svg width={SVG_SIZE} height={SVG_SIZE} viewBox={VIEW_BOX} style={SVG_STYLE}>
      {children}
    </svg>
  );

  switch (cfg.archetype) {
    /* ── 攻击弹道：X形交叉 + 中心冲击星 ── */
    case "strike":
      return svg(
        <>
          <CenterBurst c1={c1} d={d} dur={dur} />
          <InkStroke path="M -90,-60 C -50,-20 -10,10 90,60" c1={c1} c2={c2} glow={glow} d={d} dur={dur} mainWidth={7} glowWidth={18} coreWidth={2} />
          <InkStroke path="M 90,-60 C 50,-20 10,10 -90,60" c1={c1} c2={c2} glow={glow} d={d} dur={dur} mainWidth={7} glowWidth={18} coreWidth={2} />
          {/* 独特：四角冲击星 */}
          {[[0, -30], [30, 0], [0, 30], [-30, 0]].map(([x, y], i) => (
            <motion.line key={i} x1={0} y1={0} x2={x} y2={y}
              stroke={c1} strokeWidth={2} strokeLinecap="round"
              style={{ filter: `drop-shadow(0 0 4px ${glow})` }}
              initial={{ pathLength: 0, opacity: 0 }}
              animate={{ pathLength: 1, opacity: [0, 0.7, 0] }}
              transition={{ duration: dur * 0.4, delay: d + dur * 0.3, ease: "easeOut" }} />
          ))}
          <SplatterDots dots={splats} c1={c1} c2={c2} d={d} dur={dur} />
        </>
      );

    /* ── 防御护盾：六边形 + 内交叉网格 ── */
    case "ward": {
      const hex = "M 0,-90 L 78,-45 L 78,45 L 0,90 L -78,45 L -78,-45 Z";
      return svg(
        <>
          <CenterBurst c1={c1} d={d} dur={dur} r={16} />
          <InkStroke path={hex} c1={c1} c2={c2} glow={glow} d={d} dur={dur} mainWidth={6} glowWidth={16} coreWidth={2} />
          {/* 独特：内交叉网格线 */}
          <motion.path d="M -45,0 L 45,0 M 0,-52 L 0,52"
            stroke={c1} strokeWidth={1} fill="none"
            style={{ filter: `drop-shadow(0 0 3px ${glow})` }}
            initial={{ pathLength: 0, opacity: 0 }}
            animate={{ pathLength: 1, opacity: [0, 0.4, 0] }}
            transition={{ duration: dur * 0.6, delay: d + 0.15, ease: "easeOut" }} />
          <SplatterDots dots={splats} c1={c1} c2={c2} d={d} dur={dur} />
        </>
      );
    }

    /* ── 恢复汇聚：四方向内汇聚 + 光柱 ── */
    case "restore":
      return svg(
        <>
          <CenterBurst c1={c1} d={d} dur={dur} r={16} />
          {[0, 90, 180, 270].map((rot) => (
            <InkStroke key={rot} path="M 100,0 L 10,0" c1={c1} c2={c2} glow={glow} d={d} dur={dur}
              mainWidth={5} glowWidth={14} coreWidth={1.5} rotate={rot} />
          ))}
          {/* 独特：垂直光柱 */}
          <motion.rect x={-3} y={-80} width={6} height={160} fill={c1} fillOpacity={0.3}
            style={{ filter: `blur(4px)` }}
            initial={{ opacity: 0, scaleY: 0 }}
            animate={{ opacity: [0, 0.4, 0], scaleY: [0, 1, 0.8] }}
            transition={{ duration: dur * 0.6, delay: d + 0.1, ease: "easeOut" }} />
          <SplatterDots dots={splats} c1={c1} c2={c2} d={d} dur={dur} />
        </>
      );

    /* ── 反制打断：X形交叉 + 碎片飞散 ── */
    case "counter":
      return svg(
        <>
          <CenterBurst c1={c1} d={d} dur={dur} />
          <InkStroke path="M -80,-80 L 80,80" c1={c1} c2={c2} glow={glow} d={d} dur={dur} mainWidth={7} glowWidth={18} coreWidth={2} />
          <InkStroke path="M 80,-80 L -80,80" c1={c1} c2={c2} glow={glow} d={d} dur={dur} mainWidth={7} glowWidth={18} coreWidth={2} />
          {/* 独特：碎片三角形 */}
          {[0, 90, 180, 270].map((rot) => (
            <motion.polygon key={rot} points="0,-8 5,4 -5,4"
              fill={c1} fillOpacity={0.5}
              style={{ filter: `drop-shadow(0 0 3px ${glow})`, ...ROT_CENTER, rotate: rot, transform: `rotate(${rot}deg) translate(0, -45px)` }}
              initial={{ opacity: 0, scale: 0 }}
              animate={{ opacity: [0, 0.6, 0], scale: [0, 1, 0.2] }}
              transition={{ duration: dur * 0.5, delay: d + 0.15, ease: "easeOut" }} />
          ))}
          <SplatterDots dots={splats} c1={c1} c2={c2} d={d} dur={dur} />
        </>
      );

    /* ── 干扰侵蚀：六方向波浪 + 闪电纹 ── */
    case "disrupt":
      return svg(
        <>
          <CenterBurst c1={c1} d={d} dur={dur} r={14} />
          {[0, 60, 120, 180, 240, 300].map((rot) => (
            <InkStroke key={rot} path="M 10,0 C 30,-8 50,5 70,-3 C 85,-8 95,0 100,5" c1={c1} c2={c2} glow={glow} d={d} dur={dur}
              mainWidth={4} glowWidth={12} coreWidth={1.5} rotate={rot} />
          ))}
          {/* 独特：中心闪电纹 */}
          <motion.path d="M -5,-25 L 5,-10 L -3,0 L 8,15 L -2,25"
            stroke={c1} strokeWidth={2} strokeLinecap="round" fill="none"
            style={{ filter: `drop-shadow(0 0 5px ${glow})` }}
            initial={{ pathLength: 0, opacity: 0 }}
            animate={{ pathLength: 1, opacity: [0, 0.8, 0] }}
            transition={{ duration: dur * 0.4, delay: d + 0.1, ease: "easeOut" }} />
          <SplatterDots dots={splats} c1={c1} c2={c2} d={d} dur={dur} />
        </>
      );

    /* ── 窃取牵扯：七方向内汇聚 + 钩爪 ── */
    case "theft":
      return svg(
        <>
          <CenterBurst c1={c1} d={d} dur={dur} r={14} />
          {Array.from({ length: 7 }).map((_, i) => {
            const rot = (i / 7) * 360;
            return <InkStroke key={i} path="M 100,0 L 10,0" c1={c1} c2={c2} glow={glow} d={d} dur={dur}
              mainWidth={4} glowWidth={12} coreWidth={1.5} rotate={rot} />;
          })}
          {/* 独特：钩爪弧线 */}
          {Array.from({ length: 7 }).map((_, i) => {
            const rot = (i / 7) * 360;
            const rad = (rot * Math.PI) / 180;
            const cx = 70 * Math.cos(rad);
            const cy = 70 * Math.sin(rad);
            return (
              <motion.path key={`h${i}`}
                d={`M ${cx.toFixed(1)},${cy.toFixed(1)} C ${(cx + 10).toFixed(1)},${(cy - 8).toFixed(1)} ${(cx + 5).toFixed(1)},${(cy + 10).toFixed(1)} ${(cx + 12).toFixed(1)},${(cy + 6).toFixed(1)}`}
                stroke={c1} strokeWidth={1.5} fill="none" strokeLinecap="round"
                style={{ filter: `drop-shadow(0 0 3px ${glow})` }}
                initial={{ pathLength: 0, opacity: 0 }}
                animate={{ pathLength: 1, opacity: [0, 0.5, 0] }}
                transition={{ duration: dur * 0.5, delay: d + 0.1 + i * 0.03, ease: "easeOut" }} />
            );
          })}
          <SplatterDots dots={splats} c1={c1} c2={c2} d={d} dur={dur} />
        </>
      );

    /* ── 增益飞行：垂直双柱 + 上升箭头 ── */
    case "augment":
      return svg(
        <>
          <CenterBurst c1={c1} d={d} dur={dur} r={16} />
          <InkStroke path="M 0,-100 L 0,100" c1={c1} c2={c2} glow={glow} d={d} dur={dur} mainWidth={7} glowWidth={18} coreWidth={2} />
          {/* 独特：上升箭头 */}
          {[-50, 0, 50].map((y, i) => (
            <motion.path key={i} d={`M -6,${y + 8} L 0,${y - 4} L 6,${y + 8}`}
              stroke={c1} strokeWidth={1.5} fill="none" strokeLinecap="round"
              style={{ filter: `drop-shadow(0 0 3px ${glow})` }}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: [0, 0.6, 0], y: [20, 0, -20] }}
              transition={{ duration: dur * 0.5, delay: d + 0.1 + i * 0.08, ease: "easeOut" }} />
          ))}
          <SplatterDots dots={splats} c1={c1} c2={c2} d={d} dur={dur} />
        </>
      );

    /* ── 封印判定：圆形 + 内方框 ── */
    case "seal":
      return svg(
        <>
          <CenterBurst c1={c1} d={d} dur={dur} r={16} />
          <InkStroke path={circlePath(80)} c1={c1} c2={c2} glow={glow} d={d} dur={dur} mainWidth={6} glowWidth={16} coreWidth={2} />
          {/* 独特：内方框 */}
          <motion.rect x={-45} y={-45} width={90} height={90} rx={2}
            fill="none" stroke={c1} strokeWidth={1.5}
            style={{ filter: `drop-shadow(0 0 4px ${glow})`, ...ROT_CENTER }}
            initial={{ opacity: 0, rotate: 45, scale: 0 }}
            animate={{ opacity: [0, 0.5, 0], rotate: [45, 0, -15], scale: [0, 1, 0.8] }}
            transition={{ duration: dur, delay: d + 0.15, ease: "easeOut" }} />
          <SplatterDots dots={splats} c1={c1} c2={c2} d={d} dur={dur} />
        </>
      );

    /* ── 决斗碰撞：双向水平 + 爆裂环 ── */
    case "duel":
      return svg(
        <>
          <CenterBurst c1={c1} d={d} dur={dur} r={18} />
          <InkStroke path="M -90,0 L 0,0" c1={c1} c2={c2} glow={glow} d={d} dur={dur} mainWidth={7} glowWidth={18} coreWidth={2} />
          <InkStroke path="M 90,0 L 0,0" c1={c2} c2={c1} glow={glow} d={d} dur={dur} mainWidth={7} glowWidth={18} coreWidth={2} />
          {/* 独特：碰撞爆裂环 */}
          <motion.circle cx={0} cy={0} r={30} fill="none" stroke={c1} strokeWidth={2}
            style={{ filter: `drop-shadow(0 0 6px ${glow})` }}
            initial={{ opacity: 0, scale: 0 }}
            animate={{ opacity: [0, 0.6, 0], scale: [0, 1.5, 2] }}
            transition={{ duration: dur * 0.5, delay: d + dur * 0.3, ease: "easeOut" }} />
          <SplatterDots dots={splats} c1={c1} c2={c2} d={d} dur={dur} />
        </>
      );

    /* ── 群体波纹：扩散波浪 + 多重涟漪 ── */
    case "tide":
      return svg(
        <>
          <CenterBurst c1={c1} d={d} dur={dur} r={16} />
          <InkStroke path={genWave(18, 3)} c1={c1} c2={c2} glow={glow} d={d} dur={dur} mainWidth={6} glowWidth={16} coreWidth={2} />
          {/* 独特：多重偏移涟漪 */}
          {[20, 45, 70, 95].map((r, i) => (
            <motion.circle key={r} cx={0} cy={0} r={r} fill="none" stroke={c1} strokeWidth={0.8}
              style={{ filter: `blur(0.5px)` }}
              initial={{ opacity: 0, scale: 0 }}
              animate={{ opacity: [0, 0.3, 0], scale: [0, 1, 1.1] }}
              transition={{ duration: dur * 0.7, delay: d + i * 0.08, ease: "easeOut" }} />
          ))}
          <SplatterDots dots={splats} c1={c1} c2={c2} d={d} dur={dur} />
        </>
      );

    /* ── 风暴旋涡：螺旋 + 轨道碎片 ── */
    case "storm":
      return svg(
        <>
          <CenterBurst c1={c1} d={d} dur={dur} r={14} />
          <InkStroke path={genSpiral(3, 0.17, 2.5, 0.12)} c1={c1} c2={c2} glow={glow} d={d} dur={dur} mainWidth={6} glowWidth={16} coreWidth={2} />
          {/* 独特：轨道碎片 */}
          <motion.g style={ROT_CENTER}
            initial={{ rotate: 0, opacity: 0 }}
            animate={{ rotate: 360, opacity: [0, 0.5, 0] }}
            transition={{ duration: dur, delay: d, ease: "easeOut" }}>
            {[0, 120, 240].map((rot, i) => {
              const rad = (rot * Math.PI) / 180;
              return (
                <rect key={i}
                  x={(55 * Math.cos(rad) - 2).toFixed(1)} y={(55 * Math.sin(rad) - 2).toFixed(1)}
                  width={4} height={4} rx={1}
                  fill={c1} fillOpacity={0.6}
                  style={{ filter: `drop-shadow(0 0 3px ${glow})` }} />
              );
            })}
          </motion.g>
          <SplatterDots dots={splats} c1={c1} c2={c2} d={d} dur={dur} />
        </>
      );

    /* ── 和谐双流：8字形 + 双圆互锁 ── */
    case "harmony": {
      const fig8 = "M -70,0 C -70,-40 -40,-40 -20,0 C 0,40 40,40 70,0 C 70,-40 40,-40 20,0 C 0,40 -40,40 -70,0 Z";
      return svg(
        <>
          <CenterBurst c1={c1} d={d} dur={dur} r={14} />
          <InkStroke path={fig8} c1={c1} c2={c2} glow={glow} d={d} dur={dur} mainWidth={6} glowWidth={16} coreWidth={2} />
          {/* 独特：双圆互锁 */}
          <motion.circle cx={-25} cy={0} r={18} fill="none" stroke={c1} strokeWidth={1}
            style={{ filter: `drop-shadow(0 0 3px ${glow})` }}
            initial={{ opacity: 0, scale: 0 }}
            animate={{ opacity: [0, 0.4, 0], scale: [0, 1, 0.7] }}
            transition={{ duration: dur * 0.6, delay: d + 0.15, ease: "easeOut" }} />
          <motion.circle cx={25} cy={0} r={18} fill="none" stroke={c2} strokeWidth={1}
            style={{ filter: `drop-shadow(0 0 3px ${glow})` }}
            initial={{ opacity: 0, scale: 0 }}
            animate={{ opacity: [0, 0.4, 0], scale: [0, 1, 0.7] }}
            transition={{ duration: dur * 0.6, delay: d + 0.2, ease: "easeOut" }} />
          <SplatterDots dots={splats} c1={c1} c2={c2} d={d} dur={dur} />
        </>
      );
    }

    /* ── 傀儡操控：六方向丝线 + 十字提线 ── */
    case "puppet":
      return svg(
        <>
          <CenterBurst c1={c1} d={d} dur={dur} r={14} />
          {[0, 60, 120, 180, 240, 300].map((rot) => (
            <InkStroke key={rot} path="M 10,0 C 30,-5 60,3 100,0" c1={c1} c2={c2} glow={glow} d={d} dur={dur}
              mainWidth={4} glowWidth={12} coreWidth={1.5} rotate={rot} />
          ))}
          {/* 独特：十字提线架 */}
          <motion.g
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: [0, 0.5, 0], y: [-20, 0, 10] }}
            transition={{ duration: dur, delay: d + 0.1, ease: "easeOut" }}>
            <line x1={-35} y1={-50} x2={35} y2={-50} stroke={c1} strokeWidth={1.5} strokeLinecap="round"
              style={{ filter: `drop-shadow(0 0 3px ${glow})` }} />
            <line x1={0} y1={-50} x2={0} y2={-15} stroke={c1} strokeWidth={1} strokeLinecap="round"
              style={{ filter: `drop-shadow(0 0 2px ${glow})` }} />
            <circle cx={-35} cy={-50} r={2} fill={c1} />
            <circle cx={35} cy={-50} r={2} fill={c1} />
          </motion.g>
          <SplatterDots dots={splats} c1={c1} c2={c2} d={d} dur={dur} />
        </>
      );

    /* ── 时间扭曲：反向螺旋 + 时针扫掠 ── */
    case "timewarp":
      return svg(
        <>
          <CenterBurst c1={c1} d={d} dur={dur} r={14} />
          <motion.g style={ROT_CENTER} initial={{ rotate: 0, opacity: 0 }} animate={{ rotate: [-0, -360], opacity: [0, 1, 0] }} transition={{ duration: dur, delay: d, ease: "easeOut" }}>
            <InkStroke path={genSpiral(3, 0.17, 2.8, 0.12)} c1={c1} c2={c2} glow={glow} d={d} dur={dur} mainWidth={6} glowWidth={16} coreWidth={2} />
          </motion.g>
          {/* 独特：时针扫掠 */}
          <motion.g style={ROT_CENTER}
            initial={{ rotate: 0, opacity: 0 }}
            animate={{ rotate: 360, opacity: [0, 0.6, 0] }}
            transition={{ duration: dur, delay: d + 0.1, ease: "easeOut" }}>
            <line x1={0} y1={0} x2={0} y2={-60} stroke={c1} strokeWidth={1.5} strokeLinecap="round"
              style={{ filter: `drop-shadow(0 0 4px ${glow})` }} />
            <circle cx={0} cy={-60} r={2} fill={c1} />
          </motion.g>
          <SplatterDots dots={splats} c1={c1} c2={c2} d={d} dur={dur} />
        </>
      );

    /* ── 装备穿戴：四角框架 + 对角连线 ── */
    case "equip": {
      const bracketTL = "M -80,-50 L -80,-80 L -50,-80";
      const bracketTR = "M 50,-80 L 80,-80 L 80,-50";
      const bracketBR = "M 80,50 L 80,80 L 50,80";
      const bracketBL = "M -50,80 L -80,80 L -80,50";
      return svg(
        <>
          <CenterBurst c1={c1} d={d} dur={dur} r={16} />
          <InkStroke path={bracketTL} c1={c1} c2={c2} glow={glow} d={d} dur={dur} mainWidth={5} glowWidth={14} coreWidth={2} />
          <InkStroke path={bracketTR} c1={c1} c2={c2} glow={glow} d={d} dur={dur} mainWidth={5} glowWidth={14} coreWidth={2} />
          <InkStroke path={bracketBR} c1={c1} c2={c2} glow={glow} d={d} dur={dur} mainWidth={5} glowWidth={14} coreWidth={2} />
          <InkStroke path={bracketBL} c1={c1} c2={c2} glow={glow} d={d} dur={dur} mainWidth={5} glowWidth={14} coreWidth={2} />
          {/* 独特：对角连线 */}
          <motion.path d="M -60,-60 L 60,60 M 60,-60 L -60,60"
            stroke={c1} strokeWidth={1} fill="none" strokeLinecap="round"
            style={{ filter: `drop-shadow(0 0 3px ${glow})` }}
            initial={{ pathLength: 0, opacity: 0 }}
            animate={{ pathLength: 1, opacity: [0, 0.3, 0] }}
            transition={{ duration: dur * 0.6, delay: d + 0.15, ease: "easeOut" }} />
          <SplatterDots dots={splats} c1={c1} c2={c2} d={d} dur={dur} />
        </>
      );
    }

    default:
      return svg(
        <>
          <CenterBurst c1={c1} d={d} dur={dur} />
          <InkStroke path={circlePath(60)} c1={c1} c2={c2} glow={glow} d={d} dur={dur} mainWidth={6} glowWidth={16} coreWidth={2} />
          <SplatterDots dots={splats} c1={c1} c2={c2} d={d} dur={dur} />
        </>
      );
  }
}

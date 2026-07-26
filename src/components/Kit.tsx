/**
 * Kit.tsx —— 通用文字 / 微交互原语
 * ============================================================================
 * 这些东西散落在各个界面里被重复实现过好几遍（扫描线、逐字显影、计数器、
 * 悬停下划线……），每处的时长与缓动都对不上，观感就碎了。集中到一处后，
 * 所有界面共享同一套节奏，"高级感"才有统一的来源。
 *
 * 设计原则：
 *  1. 一律用 rAF / CSS 驱动，不逐帧 setState 整棵树。
 *  2. 尊重 prefers-reduced-motion —— 动效是加分项，不能是阅读的前提。
 *  3. 每个原语都能单独用，不依赖具体页面的配色。
 * ============================================================================
 */

import { memo, useEffect, useMemo, useRef, useState } from "react";
import { motion, useInView, useReducedMotion } from "framer-motion";

export const EASE = [0.16, 1, 0.3, 1] as const;

/* ────────────────────────────────────────────────────────────
   Scramble —— 解码式显影
   拉丁字符用拉丁乱码替换，中日韩字符用同为方块字的替身，
   这样文字块的宽度在整个过程里不会跳动。
   ──────────────────────────────────────────────────────────── */
const LATIN_POOL = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#%&/\\|<>*";
const CJK_POOL = "叙事者篇章之战墨笔纸火灰烬星辰塔海雾影书页痕缄";
const isCJK = (c: string) => /[\u3000-\u9fff\uf900-\ufaff\uff00-\uffef]/.test(c);

export const Scramble = memo(function Scramble({
  text,
  className = "",
  speed = 26,
  delay = 0,
  /** 每帧向右推进的字符数；越小越慢越"仪式感" */
  rate = 1.45,
}: {
  text: string;
  className?: string;
  speed?: number;
  delay?: number;
  rate?: number;
}) {
  const reduce = useReducedMotion();
  const [out, setOut] = useState("");
  const rafRef = useRef(0);

  useEffect(() => {
    // 关掉动效时既不跑动画也不 setState —— 渲染期直接取 text 就够了
    if (reduce) return;
    let start: number | null = null;
    const total = text.length;
    const tick = (now: number) => {
      if (start === null) start = now;
      const elapsed = now - start - delay;
      if (elapsed < 0) {
        rafRef.current = requestAnimationFrame(tick);
        return;
      }
      const frame = Math.floor(elapsed / speed);
      const revealed = Math.min(total, Math.floor(frame / rate));
      let s = "";
      for (let i = 0; i < total; i++) {
        const ch = text[i];
        if (ch === " " || ch === "\n") s += ch;
        else if (i < revealed) s += ch;
        else if (i < revealed + 5) {
          const pool = isCJK(ch) ? CJK_POOL : LATIN_POOL;
          s += pool[(Math.random() * pool.length) | 0];
        }
      }
      setOut(s);
      if (revealed < total) rafRef.current = requestAnimationFrame(tick);
      else setOut(text);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [text, speed, delay, rate, reduce]);

  return (
    <span className={className} aria-label={text}>
      {reduce ? text : out || " "}
    </span>
  );
});

/* ────────────────────────────────────────────────────────────
   TypeOut —— 逐字落墨
   中文正文用 Scramble 会很吵；落墨式的逐字淡入更像"写上去的"。
   ──────────────────────────────────────────────────────────── */
export const TypeOut = memo(function TypeOut({
  text,
  className = "",
  perChar = 26,
  delay = 0,
  as: As = "span",
}: {
  text: string;
  className?: string;
  perChar?: number;
  delay?: number;
  as?: "span" | "p" | "div";
}) {
  const reduce = useReducedMotion();
  const chars = useMemo(() => Array.from(text), [text]);
  return (
    <As className={className} aria-label={text}>
      {chars.map((c, i) => (
        <motion.span
          key={`${i}-${c}`}
          aria-hidden
          initial={reduce ? false : { opacity: 0, filter: "blur(4px)", y: 3 }}
          animate={{ opacity: 1, filter: "blur(0px)", y: 0 }}
          transition={{ duration: 0.34, delay: reduce ? 0 : delay / 1000 + (i * perChar) / 1000, ease: EASE }}
          style={{ display: c === " " ? "inline" : "inline-block", whiteSpace: "pre" }}
        >
          {c}
        </motion.span>
      ))}
    </As>
  );
});

/* ────────────────────────────────────────────────────────────
   Counter —— 数字滚动
   ──────────────────────────────────────────────────────────── */
export function Counter({
  to,
  duration = 1400,
  pad = 0,
  className = "",
}: {
  to: number;
  duration?: number;
  pad?: number;
  className?: string;
}) {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLSpanElement | null>(null);
  const inView = useInView(ref, { once: true, margin: "-40px" });
  const [n, setN] = useState(reduce ? to : 0);

  useEffect(() => {
    if (reduce || !inView) return;
    let raf = 0;
    let start: number | null = null;
    const tick = (now: number) => {
      if (start === null) start = now;
      const p = Math.min(1, (now - start) / duration);
      // easeOutExpo：先冲后稳，读数停下来的那一刻最有分量
      const e = p === 1 ? 1 : 1 - Math.pow(2, -10 * p);
      setN(Math.round(to * e));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [to, duration, inView, reduce]);

  return (
    <span ref={ref} className={className}>
      {pad ? String(n).padStart(pad, "0") : n}
    </span>
  );
}

/* ────────────────────────────────────────────────────────────
   Reveal —— 进入视口时浮起
   ──────────────────────────────────────────────────────────── */
export function Reveal({
  children,
  delay = 0,
  y = 16,
  className = "",
}: {
  children: React.ReactNode;
  delay?: number;
  y?: number;
  className?: string;
}) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      className={className}
      initial={reduce ? false : { opacity: 0, y, filter: "blur(6px)" }}
      whileInView={{ opacity: 1, y: 0, filter: "blur(0px)" }}
      viewport={{ once: true, margin: "-50px" }}
      transition={{ duration: 0.85, delay, ease: EASE }}
    >
      {children}
    </motion.div>
  );
}

/* ────────────────────────────────────────────────────────────
   小零件
   ──────────────────────────────────────────────────────────── */
export function Label({
  children,
  className = "",
  color = "#6a5418",
}: {
  children: React.ReactNode;
  className?: string;
  color?: string;
}) {
  return (
    <span
      className={`font-cinzel text-[8px] uppercase tracking-[0.36em] ${className}`}
      style={{ color }}
    >
      {children}
    </span>
  );
}

export function Rule({ className = "", color = "rgba(200,160,67,0.22)" }: { className?: string; color?: string }) {
  return <div className={`h-px w-full ${className}`} style={{ background: color }} />;
}

/** 四角刻线：给面板一点"仪器"感 */
export function CornerTicks({ color = "rgba(240,200,98,0.4)", size = 14 }: { color?: string; size?: number }) {
  return (
    <>
      {[
        "top-0 left-0 border-t border-l",
        "top-0 right-0 border-t border-r",
        "bottom-0 left-0 border-b border-l",
        "bottom-0 right-0 border-b border-r",
      ].map((c) => (
        <span
          key={c}
          className={`pointer-events-none absolute ${c}`}
          style={{ width: size, height: size, borderColor: color }}
        />
      ))}
    </>
  );
}

/**
 * 胶片颗粒 + 扫描线。
 * 只画两层 fixed 伪元素，成本极低，却能立刻把"网页感"压成"胶片感"。
 */
export function FilmOverlay({
  grain = 0.05,
  scan = 0.026,
  z = 70,
}: {
  grain?: number;
  scan?: number;
  z?: number;
}) {
  const reduce = useReducedMotion();
  return (
    <>
      <div
        className="pointer-events-none fixed inset-[-50%]"
        style={{
          zIndex: z,
          opacity: grain,
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3'/%3E%3C/filter%3E%3Crect width='160' height='160' filter='url(%23n)'/%3E%3C/svg%3E\")",
          animation: reduce ? undefined : "kit-grain 0.62s steps(2) infinite",
        }}
      />
      <div
        className="pointer-events-none fixed inset-0"
        style={{
          zIndex: z,
          background: `repeating-linear-gradient(to bottom, rgba(255,246,214,${scan}) 0px, rgba(255,246,214,${scan}) 1px, transparent 1px, transparent 3px)`,
        }}
      />
    </>
  );
}

/** 闪烁的方块光标，用在 HUD 行末 */
export function Caret({ color = "#c8a043" }: { color?: string }) {
  return (
    <span className="kit-blink" style={{ color }}>
      ▮
    </span>
  );
}

/**
 * 数值遥测行：标签 + 等宽读数。
 * 读数用 tabular-nums，数字跳动时不会左右晃。
 */
export function Readout({
  k,
  v,
  color = "#6f6046",
}: {
  k: string;
  v: string;
  color?: string;
}) {
  return (
    <div className="flex items-center gap-2 whitespace-nowrap" style={{ color }}>
      <span className="font-cinzel text-[8px] tracking-[0.26em] opacity-70">{k}</span>
      <span className="text-[9px] tracking-[0.14em]" style={{ fontVariantNumeric: "tabular-nums" }}>
        {v}
      </span>
    </div>
  );
}

/**
 * 开关：一个 6×3 的小闸门，比 checkbox 更契合这套"仪器"语言。
 */
export function Toggle({
  on,
  label,
  onClick,
  color = "#c8a043",
}: {
  on: boolean;
  label: string;
  onClick: () => void;
  color?: string;
}) {
  return (
    <button
      onClick={onClick}
      className="group flex items-center gap-2 font-cinzel text-[8.5px] tracking-[0.24em] transition-colors"
      style={{ color: on ? color : "#6f6046" }}
    >
      <span
        className="flex h-3 w-6 items-center px-[2px] transition-colors"
        style={{ border: `1px solid ${on ? color : "rgba(160,128,48,0.32)"}`, background: on ? `${color}22` : "transparent" }}
      >
        <span
          className="h-[7px] w-[7px] transition-transform duration-300"
          style={{ background: on ? color : "#6f6046", transform: on ? "translateX(9px)" : "none", opacity: on ? 1 : 0.5 }}
        />
      </span>
      {label}
    </button>
  );
}

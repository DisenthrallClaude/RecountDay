import { useEffect, useState, useRef } from "react";
import { motion } from "framer-motion";
import { assetUrl } from "../utils/assetUrl";

interface Props {
  onComplete: () => void;
  duration?: number;
}

export default function LoadingRitual({ onComplete, duration = 3500 }: Props) {
  const [progress, setProgress] = useState(0);
  const [phase, setPhase] = useState(0); // 0: drawing, 1: glowing, 2: complete
  const completedRef = useRef(false);

  const safeComplete = () => {
    if (completedRef.current) return;
    completedRef.current = true;
    onComplete();
  };

  useEffect(() => {
    const start = Date.now();
    // 用 rAF 而不是 30ms 定时器：进度条不再每秒触发 33 次 React 重渲染。
    let raf = 0;
    let done = false;
    const tick = () => {
      const elapsed = Date.now() - start;
      const pct = Math.min(100, (elapsed / duration) * 100);
      setProgress(pct);
      // 直接由进度推导阶段。
      // 原实现写成 `if (pct > 85 && phase === 1)` 且 effect 依赖只有 [duration]，
      // 闭包里的 phase 永远是 0，所以第 2 阶段（"入局就绪" 与完成闪光）
      // 永远不会出现。
      setPhase(pct > 85 ? 2 : pct > 30 ? 1 : 0);
      if (elapsed >= duration) {
        if (!done) {
          done = true;
          window.setTimeout(safeComplete, 300);
        }
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // safeComplete 用 ref 做幂等保护，不需要进依赖
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [duration]);

  return (
    <motion.div
      initial={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.5 }}
      className="fixed inset-0 z-[200] flex items-center justify-center"
      style={{ backgroundImage: `url(${assetUrl("images/formation_bg.jpg")})`, backgroundSize: "cover", backgroundPosition: "center", backgroundColor: "#000" }}
    >
      {/* Complex hand-drawn SVG magic array */}
      <div className="relative" style={{ width: "600px", height: "600px", maxWidth: "80vw", maxHeight: "80vh" }}>
        <svg viewBox="0 0 600 600" className="w-full h-full">
          {/* Outer ring - slow draw */}
          <motion.circle
            cx="300" cy="300" r="280"
            fill="none"
            stroke="#a08030"
            strokeWidth="1"
            strokeDasharray="1759"
            initial={{ strokeDashoffset: 1759, opacity: 0 }}
            animate={{ strokeDashoffset: 0, opacity: 0.4 }}
            transition={{ duration: 1.5, ease: "easeInOut" }}
          />

          {/* Outer decorative marks */}
          {Array.from({ length: 24 }).map((_, i) => {
            const angle = (i * 15) * Math.PI / 180;
            const x1 = 300 + 270 * Math.cos(angle);
            const y1 = 300 + 270 * Math.sin(angle);
            const x2 = 300 + 280 * Math.cos(angle);
            const y2 = 300 + 280 * Math.sin(angle);
            return (
              <motion.line
                key={`outer-${i}`}
                x1={x1} y1={y1} x2={x2} y2={y2}
                stroke="#a08030"
                strokeWidth="0.8"
                initial={{ opacity: 0 }}
                animate={{ opacity: 0.3 }}
                transition={{ delay: 0.3 + i * 0.03, duration: 0.3 }}
              />
            );
          })}

          {/* Second ring */}
          <motion.circle
            cx="300" cy="300" r="240"
            fill="none"
            stroke="#a08030"
            strokeWidth="0.6"
            strokeDasharray="1508"
            initial={{ strokeDashoffset: 1508, opacity: 0 }}
            animate={{ strokeDashoffset: 0, opacity: 0.5 }}
            transition={{ duration: 1.2, delay: 0.4, ease: "easeInOut" }}
          />

          {/* Runic text ring (decorative) */}
          {Array.from({ length: 36 }).map((_, i) => {
            const angle = (i * 10) * Math.PI / 180;
            const x = 300 + 220 * Math.cos(angle);
            const y = 300 + 220 * Math.sin(angle);
            const runes = "ᚠᚢᚦᚨᚱᚲᚷᚹᚺᚾᛁᛃᛇᛈᛉᛊᛏᛒᛖᛗᛚᛜᛟᛞᚠᚢᚦᚨᚱᚲᚷᚹᚺᚾᛁᛃ";
            return (
              <motion.text
                key={`rune-${i}`}
                x={x} y={y}
                fill="#a08030"
                fontSize="8"
                textAnchor="middle"
                dominantBaseline="middle"
                initial={{ opacity: 0 }}
                animate={{ opacity: 0.4 }}
                transition={{ delay: 0.6 + i * 0.02, duration: 0.3 }}
                style={{ fontFamily: "serif" }}
              >
                {runes[i]}
              </motion.text>
            );
          })}

          {/* Third ring */}
          <motion.circle
            cx="300" cy="300" r="190"
            fill="none"
            stroke="#a08030"
            strokeWidth="0.8"
            strokeDasharray="1194"
            initial={{ strokeDashoffset: 1194, opacity: 0 }}
            animate={{ strokeDashoffset: 0, opacity: 0.5 }}
            transition={{ duration: 1, delay: 0.8, ease: "easeInOut" }}
          />

          {/* Inner star - hexagram */}
          <motion.g
            initial={{ opacity: 0, rotate: -30 }}
            animate={{ opacity: 0.5, rotate: 0 }}
            transition={{ duration: 1, delay: 1.2 }}
            style={{ transformOrigin: "300px 300px" }}
          >
            {/* Upward triangle */}
            <motion.path
              d="M300 150 L440 380 L160 380 Z"
              fill="none"
              stroke="#a08030"
              strokeWidth="1"
              strokeDasharray="750"
              initial={{ strokeDashoffset: 750 }}
              animate={{ strokeDashoffset: 0 }}
              transition={{ duration: 1, delay: 1.2, ease: "easeInOut" }}
            />
            {/* Downward triangle */}
            <motion.path
              d="M300 450 L160 220 L440 220 Z"
              fill="none"
              stroke="#a08030"
              strokeWidth="1"
              strokeDasharray="750"
              initial={{ strokeDashoffset: 750 }}
              animate={{ strokeDashoffset: 0 }}
              transition={{ duration: 1, delay: 1.4, ease: "easeInOut" }}
            />
          </motion.g>

          {/* Inner pentagon star */}
          <motion.g
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.4 }}
            transition={{ duration: 0.8, delay: 1.8 }}
          >
            {Array.from({ length: 5 }).map((_, i) => {
              const a1 = (i * 72 - 90) * Math.PI / 180;
              const a2 = ((i + 2) * 72 - 90) * Math.PI / 180;
              const x1 = 300 + 120 * Math.cos(a1);
              const y1 = 300 + 120 * Math.sin(a1);
              const x2 = 300 + 120 * Math.cos(a2);
              const y2 = 300 + 120 * Math.sin(a2);
              return (
                <motion.line
                  key={`pent-${i}`}
                  x1={x1} y1={y1} x2={x2} y2={y2}
                  stroke="#a08030"
                  strokeWidth="0.7"
                  initial={{ pathLength: 0 }}
                  animate={{ pathLength: 1 }}
                  transition={{ duration: 0.5, delay: 1.8 + i * 0.1 }}
                />
              );
            })}
          </motion.g>

          {/* Innermost circle */}
          <motion.circle
            cx="300" cy="300" r="60"
            fill="none"
            stroke="#a08030"
            strokeWidth="0.6"
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.6 }}
            transition={{ duration: 0.5, delay: 2.2 }}
          />

          {/* Center dot */}
          <motion.circle
            cx="300" cy="300" r="3"
            fill="#a08030"
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: [0, 1.5, 1], opacity: 1 }}
            transition={{ duration: 0.6, delay: 2.4 }}
          />

          {/* Rotating decorative elements */}
          <motion.g
            animate={{ rotate: 360 }}
            transition={{ duration: 40, repeat: Infinity, ease: "linear" }}
            style={{ transformOrigin: "300px 300px" }}
          >
            {Array.from({ length: 8 }).map((_, i) => {
              const angle = (i * 45) * Math.PI / 180;
              const x = 300 + 260 * Math.cos(angle);
              const y = 300 + 260 * Math.sin(angle);
              return (
                <circle key={`dot-${i}`} cx={x} cy={y} r="2" fill="#a08030" opacity="0.4" />
              );
            })}
          </motion.g>

          {/* Counter-rotating inner elements */}
          <motion.g
            animate={{ rotate: -360 }}
            transition={{ duration: 30, repeat: Infinity, ease: "linear" }}
            style={{ transformOrigin: "300px 300px" }}
          >
            {Array.from({ length: 6 }).map((_, i) => {
              const angle = (i * 60) * Math.PI / 180;
              const x = 300 + 160 * Math.cos(angle);
              const y = 300 + 160 * Math.sin(angle);
              return (
                <g key={`tri-${i}`}>
                  <circle cx={x} cy={y} r="1.5" fill="#a08030" opacity="0.5" />
                  <line x1={x} y1={y} x2={300 + 100 * Math.cos(angle)} y2={300 + 100 * Math.sin(angle)} stroke="#a08030" strokeWidth="0.3" opacity="0.3" />
                </g>
              );
            })}
          </motion.g>

          {/* Glow effect when phase >= 1 */}
          {phase >= 1 && (
            <motion.circle
              cx="300" cy="300" r="60"
              fill="none"
              stroke="#e8dfc8"
              strokeWidth="0.5"
              initial={{ opacity: 0, scale: 0.5 }}
              animate={{ opacity: [0, 0.4, 0], scale: [0.5, 1.5, 2] }}
              transition={{ duration: 2, repeat: Infinity }}
            />
          )}

          {/* Completion flash */}
          {phase >= 2 && (
            <motion.circle
              cx="300" cy="300" r="280"
              fill="none"
              stroke="#e8dfc8"
              strokeWidth="1"
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: [0, 0.3, 0], scale: [0.8, 1, 1.05] }}
              transition={{ duration: 0.8 }}
            />
          )}
        </svg>

        {/* Progress text */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1 }}
          className="absolute left-0 right-0 text-center" style={{ bottom: "max(-60px, calc(-6vh))" }}
        >
          <div className="font-gothic text-[#c9b896] text-sm tracking-[0.4em] mb-2">
            {phase === 0 ? "叙 事 篇 章 展 开" : phase === 1 ? "世 界 文 本 显 现" : "入 局 就 绪"}
          </div>
          {/* Progress bar */}
          <div className="w-64 h-px bg-[#a08030]/20 mx-auto overflow-hidden rounded-full">
            <motion.div
              className="h-full bg-gradient-to-r from-transparent via-[#a08030] to-transparent"
              style={{ width: `${progress}%` }}
            />
          </div>
          <div className="font-cinzel text-[9px] text-[#6a5418] tracking-widest mt-2">
            {Math.round(progress)}%
          </div>
        </motion.div>
      </div>
    </motion.div>
  );
}

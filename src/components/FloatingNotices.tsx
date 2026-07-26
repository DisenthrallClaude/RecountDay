/**
 * FloatingNotices.tsx —— 座位上方的浮动判定提示
 * ============================================================================
 * 为什么需要它：
 *
 * 破题反制、正身符印/空白之身免疫、叙事壁垒抵消、命运干预减伤 ——
 * 这些都是改变胜负走向的关键判定，但它们此前只往战报里写一行字，
 * 而战报面板默认是收起的（GameBoard 的 showLog 初始为 false）。
 * 玩家看到的只是"我的策略牌打出去之后什么都没发生"，
 * 自然会认为这张牌坏了。
 *
 * 这一层把它们抬到棋盘上：在受影响的座位正上方浮出一枚短标签，
 * 升起、淡出，不打断节奏，但保证你知道刚才发生了什么。
 * ============================================================================
 */

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useGameStore } from "../store/gameStore";
import { SEAT_ANCHOR } from "./CardFlight";

type Tone = "block" | "buff" | "info";

const TONE_STYLE: Record<Tone, { fg: string; bg: string; border: string; glow: string }> = {
  // 被挡下 / 被免疫 —— 冷灰蓝，读作"无事发生"
  block: { fg: "#cfe0ea", bg: "rgba(24,34,44,0.94)", border: "rgba(150,190,215,0.55)", glow: "rgba(120,170,210,0.35)" },
  // 己方获得增益 —— 金
  buff: { fg: "#f4dc9a", bg: "rgba(38,30,14,0.94)", border: "rgba(220,180,90,0.6)", glow: "rgba(230,190,100,0.4)" },
  info: { fg: "#d8cdb4", bg: "rgba(26,22,16,0.94)", border: "rgba(160,128,48,0.5)", glow: "rgba(160,128,48,0.3)" },
};

/** 同一座位上的提示要错开，否则会叠在一起看不清 */
const STACK_OFFSET = 30;

interface Live {
  id: number;
  seat: number;
  text: string;
  tone: Tone;
  slot: number;
}

export default function FloatingNotices() {
  const notices = useGameStore((s) => s.floatingNotices);
  const [live, setLive] = useState<Live[]>([]);
  const seenRef = useRef<number>(0);

  useEffect(() => {
    if (notices.length === 0) {
      seenRef.current = 0;
      return;
    }
    const fresh = notices.filter((n) => n.id > seenRef.current);
    if (fresh.length === 0) return;
    seenRef.current = notices[notices.length - 1].id;

    setLive((prev) => {
      const next = [...prev];
      for (const n of fresh) {
        // 同座位已有几条在飘，就往上再挪一格
        const slot = next.filter((x) => x.seat === n.seat).length;
        next.push({ ...n, tone: n.tone as Tone, slot });
      }
      return next;
    });

    // 每条各自到期后移除
    for (const n of fresh) {
      window.setTimeout(() => {
        setLive((prev) => prev.filter((x) => x.id !== n.id));
      }, 1600);
    }
  }, [notices]);

  return (
    <div className="absolute inset-0 pointer-events-none z-[70]">
      <AnimatePresence>
        {live.map((n) => {
          const pos = SEAT_ANCHOR[n.seat] ?? { x: 50, y: 50 };
          const st = TONE_STYLE[n.tone] ?? TONE_STYLE.info;
          return (
            <motion.div
              key={n.id}
              className="absolute"
              style={{ left: `${pos.x}%`, top: `${pos.y}%` }}
              initial={{ opacity: 0, y: -6, scale: 0.82, x: "-50%" }}
              animate={{ opacity: 1, y: -58 - n.slot * STACK_OFFSET, scale: 1, x: "-50%" }}
              exit={{ opacity: 0, y: -84 - n.slot * STACK_OFFSET, scale: 0.9, x: "-50%" }}
              transition={{
                duration: 0.42,
                ease: [0.16, 1, 0.3, 1],
                opacity: { duration: 0.28 },
              }}
            >
              <div
                className="relative px-2.5 py-1 rounded-[3px] whitespace-nowrap"
                style={{
                  background: st.bg,
                  border: `1px solid ${st.border}`,
                  boxShadow: `0 4px 16px rgba(0,0,0,0.7), 0 0 18px ${st.glow}`,
                  backdropFilter: "blur(6px)",
                }}
              >
                {/* 顶部高光细线 */}
                <div
                  className="absolute inset-x-2 top-0 h-px"
                  style={{ background: `linear-gradient(90deg, transparent, ${st.border}, transparent)` }}
                />
                <span
                  className="text-[11px] tracking-[0.12em]"
                  style={{ color: st.fg, textShadow: `0 0 8px ${st.glow}` }}
                >
                  {n.text}
                </span>
              </div>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}

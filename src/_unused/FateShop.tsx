import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  IconCoin,
  IconExit,
  IconFrame,
  IconFrameThorn,
  IconQuill,
  IconScroll,
  IconEmote,
  IconRedCircle,
} from "./Icons";

interface ShopItem {
  id: string;
  name: string;
  desc: string;
  price: number;
  category: string;
  iconKey: string;
}

const ITEMS: ShopItem[] = [
  { id: "back_gold", name: "鎏金卷轴 · 卡背", desc: "为你的卡牌背面覆上鎏金卷轴纹样。", price: 320, iconKey: "scroll", category: "卡背" },
  { id: "back_blood", name: "血契残页 · 卡背", desc: "以血为墨绘制的禁忌卡背图案。", price: 480, iconKey: "scroll", category: "卡背" },
  { id: "frame_silver", name: "白银画框", desc: "为角色立绘镶上古银画框。", price: 260, iconKey: "frame", category: "画框" },
  { id: "frame_thorn", name: "荆棘画框", desc: "缠绕黑色荆棘的哥特画框。", price: 400, iconKey: "thorn", category: "画框" },
  { id: "title_narrator", name: "称号 · 执笔者", desc: "在个人信息中展示专属称号。", price: 150, iconKey: "quill", category: "称号" },
  { id: "title_archivist", name: "称号 · 档案守望人", desc: "彰显你对历史的执着。", price: 150, iconKey: "quill", category: "称号" },
  { id: "emote_pack1", name: "暗语表情包·壹", desc: "5句专属对局台词。", price: 200, iconKey: "emote", category: "表情" },
  { id: "board_crimson", name: "赤色魔法阵桌布", desc: "更换对局桌面主题。", price: 560, iconKey: "circle", category: "桌布" },
];

const CATS = ["全部", "卡背", "画框", "称号", "表情", "桌布"];

function loadOwned(): string[] {
  try { return JSON.parse(localStorage.getItem("rerun_owned") ?? "[]"); } catch { return []; }
}
function loadCurrency(): number {
  const v = localStorage.getItem("rerun_currency");
  return v ? parseInt(v, 10) : 2000;
}

function ItemIcon({ iconKey, size = 40 }: { iconKey: string; size?: number }) {
  switch (iconKey) {
    case "scroll": return <IconScroll size={size} color="#a08030" />;
    case "frame": return <IconFrame size={size} color="#a08030" />;
    case "thorn": return <IconFrameThorn size={size} color="#a08030" />;
    case "quill": return <IconQuill size={size} color="#a08030" />;
    case "emote": return <IconEmote size={size} color="#a08030" />;
    case "circle": return <IconRedCircle size={size} />;
    default: return <IconCoin size={size} color="#a08030" />;
  }
}

export default function FateShop({ onBack }: { onBack: () => void }) {
  const [cat, setCat] = useState("全部");
  const [owned, setOwned] = useState<string[]>([]);
  const [currency, setCurrency] = useState(2000);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => { setOwned(loadOwned()); setCurrency(loadCurrency()); }, []);
  useEffect(() => { localStorage.setItem("rerun_owned", JSON.stringify(owned)); }, [owned]);
  useEffect(() => { localStorage.setItem("rerun_currency", String(currency)); }, [currency]);

  const buy = (item: ShopItem) => {
    if (owned.includes(item.id) || currency < item.price) return;
    setCurrency((c) => c - item.price);
    setOwned((o) => [...o, item.id]);
    setToast(`已获得【${item.name}】`);
    setTimeout(() => setToast(null), 2000);
  };

  const list = cat === "全部" ? ITEMS : ITEMS.filter((i) => i.category === cat);

  return (
    <div className="fixed inset-0 bg-parchment bg-noise overflow-hidden flex flex-col">
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute inset-0" style={{
          background: "radial-gradient(ellipse at 60% 40%, rgba(245,239,224,0.5) 0%, rgba(217,206,176,0.7) 60%, rgba(156,122,46,0.2) 100%)",
        }} />
      </div>

      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
        className="relative z-10 flex items-center justify-between px-8 py-5"
      >
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-[#8a6a20] font-cinzel text-sm hover:text-[#a08030] transition-colors group"
        >
          <IconExit size={14} color="#8a6a20" />
          <span className="group-hover:translate-x-[-2px] transition-transform">返回主菜单</span>
        </button>
        <div className="text-center">
          <motion.h2
            initial={{ opacity: 0, scale: 0.9, letterSpacing: "0.6em" }}
            animate={{ opacity: 1, scale: 1, letterSpacing: "0.4em" }}
            transition={{ duration: 1, delay: 0.2 }}
            className="font-marcellus text-ink-gradient text-3xl md:text-4xl"
          >
            命 运 商 店
          </motion.h2>
          <div className="flex items-center justify-center gap-3 mt-1">
            <motion.span
              initial={{ scaleX: 0 }}
              animate={{ scaleX: 1 }}
              transition={{ duration: 0.8, delay: 0.5 }}
              className="block w-12 h-px bg-gradient-to-r from-transparent to-[#a08030] origin-right"
            />
            <span className="font-cinzel text-[10px] text-[#a08030] tracking-[0.4em]">FATE EMPORIUM</span>
            <motion.span
              initial={{ scaleX: 0 }}
              animate={{ scaleX: 1 }}
              transition={{ duration: 0.8, delay: 0.5 }}
              className="block w-12 h-px bg-gradient-to-l from-transparent to-[#a08030] origin-left"
            />
          </div>
        </div>
        <div className="flex items-center gap-2 text-[#8a6a20] font-cinzel text-sm border border-[#a08030]/60 rounded-full px-4 py-1.5 bg-[#c9b896]/70 backdrop-blur-sm">
          <IconCoin size={16} color="#a08030" />
          <span>{currency}</span>
          <span className="text-[10px] text-[#a08030]/70">残墨结晶</span>
        </div>
      </motion.div>

      {/* Categories */}
      <div className="relative z-10 flex justify-center gap-2 px-6 pb-4 flex-wrap">
        {CATS.map((c) => (
          <button
            key={c}
            onClick={() => setCat(c)}
            className={`px-4 py-1.5 rounded-full text-xs font-cinzel border transition-all ${
              cat === c
                ? "border-[#c9b896] bg-[#c9b896]/20 text-[#8a6a20]"
                : "border-[#a08030]/50 text-[#a08030]/80 hover:border-[#a08030] hover:bg-[#a08030]/10"
            }`}
          >
            {c}
          </button>
        ))}
      </div>

      {/* Items grid */}
      <div className="relative z-10 flex-1 overflow-y-auto px-8 pb-8 perspective-mid">
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          {list.map((item, i) => {
            const isOwned = owned.includes(item.id);
            return (
              <motion.div
                key={item.id}
                initial={{ opacity: 0, y: 20, rotateX: -8 }}
                animate={{ opacity: 1, y: 0, rotateX: 0 }}
                transition={{ delay: i * 0.06 }}
                whileHover={{ y: -4, scale: 1.02 }}
                className="preserve-3d rounded-xl border border-[#a08030]/50 bg-[#c9b896]/85 backdrop-blur-sm p-4 flex flex-col"
                style={{ boxShadow: "0 6px 18px rgba(60,45,20,0.3), inset 0 0 0 1px rgba(240,200,98,0.15)" }}
              >
                <div className="w-full aspect-square rounded-lg bg-[#9c8a68] border border-[#a08030]/40 flex items-center justify-center mb-3 relative overflow-hidden">
                  <div className="absolute inset-0" style={{
                    background: "radial-gradient(circle at center, rgba(240,200,98,0.15), transparent 70%)",
                  }} />
                  <div className="relative"><ItemIcon iconKey={item.iconKey} size={48} /></div>
                </div>
                <h4 className="font-gothic text-[#8a6a20] text-base">{item.name}</h4>
                <p className="text-[11px] text-[#4a3f30] mt-1 flex-1 leading-snug">{item.desc}</p>
                <button
                  disabled={isOwned || currency < item.price}
                  onClick={() => buy(item)}
                  className="gold-btn mt-3 py-1.5 rounded-full text-xs font-cinzel disabled:opacity-40 flex items-center justify-center gap-1.5"
                >
                  <IconCoin size={12} color="#3a2c14" />
                  <span>{isOwned ? "已拥有" : `${item.price} 结晶`}</span>
                </button>
              </motion.div>
            );
          })}
        </div>
      </div>

      {toast && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          className="fixed bottom-8 left-1/2 -translate-x-1/2 z-30 px-5 py-2.5 rounded-full bg-[#c9b896] border border-[#c9b896] text-[#8a6a20] text-sm font-cinzel flex items-center gap-2"
          style={{ boxShadow: "0 8px 24px rgba(240,200,98,0.4)" }}
        >
          <IconCoin size={14} color="#a08030" />
          {toast}
        </motion.div>
      )}
    </div>
  );
}

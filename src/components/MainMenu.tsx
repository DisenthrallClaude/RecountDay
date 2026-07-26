import { useState, useEffect, useRef, type MouseEvent } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { AudioManager } from "../audio/AudioManager";
import { syncPaceFromSettings } from "../store/helpers";
import { assetUrl } from "../utils/assetUrl";

interface Props {
  onNewGame: () => void;
  onFactions: () => void;
  onGallery: () => void;
  onPet: () => void;
}

export function playSound(type: "click" | "hover" | "card" | "deal" | "damage" | "heal" | "skill" | "win" | "select" | "open") {
  AudioManager.playSfx(type);
}

interface MenuButtonData {
  key: string;
  label: string;
  subLabel: string;
  onClick: () => void;
}

export default function MainMenu({ onNewGame, onFactions, onGallery, onPet }: Props) {
  const [fading, setFading] = useState<null | (() => void)>(null);
  const [loaded, setLoaded] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showMessages, setShowMessages] = useState(false);
  const [hoveredKey, setHoveredKey] = useState<string | null>(null);

  // 四个按钮排成一行需要 4×260 + 3×32 = 1136px。
  // 视口更窄时整体等比缩小，而不是让最外侧的按钮溢出屏幕。
  const [menuScale, setMenuScale] = useState(1);
  useEffect(() => {
    const measure = () => {
      const need = 1136 + 48; // 加左右安全边距
      setMenuScale(Math.max(0.52, Math.min(1, window.innerWidth / need)));
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pixelNoiseRef = useRef<HTMLCanvasElement>(null);
  const [mousePos, setMousePos] = useState({ x: 0.5, y: 0.5 });
  const [clickRipples, setClickRipples] = useState<{ id: number; x: number; y: number }[]>([]);

  // Settings state with localStorage persistence
  const [settings, setSettings] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("rerun_settings") || '{"bgm":60,"sfx":80,"quality":"high","autoPlay":true,"speed":"normal","difficulty":"normal"}');
    } catch { return { bgm: 60, sfx: 80, quality: "high", autoPlay: true, speed: "normal", difficulty: "normal" }; }
  });
  const saveSettings = (s: any) => {
    setSettings(s);
    localStorage.setItem("rerun_settings", JSON.stringify(s));
    // Immediately update volumes
    AudioManager.updateVolumes();
    // 「游戏节奏」此前只是个存进 localStorage 就没人读的装饰项；
    // 现在把它接到回合流程的 sleep 倍率上，真正改变对局速度。
    syncPaceFromSettings();
  };

  // 进入主菜单时同步一次，覆盖"上次设置过、这次冷启动"的情况
  useEffect(() => { syncPaceFromSettings(); }, []);

  const go = (fn: () => void) => {
    playSound("click");
    setFading(() => fn);
  };

  // Mouse tracking for spotlight + parallax
  const handleMouseMove = (e: MouseEvent<HTMLDivElement>) => {
    setMousePos({
      x: e.clientX / window.innerWidth,
      y: e.clientY / window.innerHeight,
    });
  };

  // Click ripple anywhere on the menu background
  const handleBgClick = (e: MouseEvent<HTMLDivElement>) => {
    // Only trigger if clicking the background, not buttons
    if ((e.target as HTMLElement).closest("button")) return;
    const id = Date.now();
    setClickRipples(prev => [...prev, { id, x: e.clientX, y: e.clientY }]);
    setTimeout(() => setClickRipples(prev => prev.filter(r => r.id !== id)), 1000);
  };

  // Rain canvas - white and gold raindrops with texture, not too dense
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animationId: number;
    let drops: { x: number; y: number; speed: number; len: number; width: number; opacity: number; isGold: boolean; wobble: number }[] = [];

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      // Fewer drops, not too dense
      const count = Math.floor(canvas.width / 14);
      drops = Array.from({ length: count }).map(() => ({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        speed: 3 + Math.random() * 4,
        len: 8 + Math.random() * 16,
        width: Math.random() > 0.7 ? 2 : 1,
        opacity: 0.15 + Math.random() * 0.25,
        isGold: Math.random() > 0.5,
        wobble: Math.random() * Math.PI * 2,
      }));
    };
    resize();
    window.addEventListener("resize", resize);

    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      drops.forEach(d => {
        const color = d.isGold
          ? `rgba(220, 180, 80, ${d.opacity})`
          : `rgba(255, 255, 255, ${d.opacity})`;
        // Draw raindrop as a thin line with a rounded head
        ctx.strokeStyle = color;
        ctx.lineWidth = d.width;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(d.x, d.y);
        ctx.lineTo(d.x, d.y + d.len);
        ctx.stroke();
        // Brighter dot at the tip for raindrop texture
        ctx.fillStyle = d.isGold
          ? `rgba(240, 200, 100, ${d.opacity * 1.5})`
          : `rgba(255, 255, 255, ${d.opacity * 1.5})`;
        ctx.beginPath();
        ctx.arc(d.x, d.y + d.len, d.width * 0.8, 0, Math.PI * 2);
        ctx.fill();
        d.y += d.speed;
        if (d.y > canvas.height) {
          d.y = -d.len - Math.random() * 50;
          d.x = Math.random() * canvas.width;
        }
      });
      animationId = requestAnimationFrame(draw);
    };
    draw();

    return () => {
      cancelAnimationFrame(animationId);
      window.removeEventListener("resize", resize);
    };
  }, []);

  // Background music - use global AudioManager for seamless crossfade
  useEffect(() => {
    // Menu uses the main BGM
    AudioManager.playBgm("/audio/bgm-main.mp3", true);

    // Handle autoplay restriction - start on first interaction
    const onInteract = () => {
      AudioManager.playBgm("/audio/bgm-main.mp3", true);
      window.removeEventListener("click", onInteract);
      window.removeEventListener("keydown", onInteract);
    };
    window.addEventListener("click", onInteract, { once: true });
    window.addEventListener("keydown", onInteract, { once: true });

    return () => {
      window.removeEventListener("click", onInteract);
      window.removeEventListener("keydown", onInteract);
    };
  }, []);

  // Update BGM volume when settings change
  useEffect(() => {
    AudioManager.updateVolumes();
  }, [settings.bgm, settings.sfx]);

  // Black & white pixel noise - scattered pixels across non-title areas
  useEffect(() => {
    const canvas = pixelNoiseRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animationId: number;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener("resize", resize);

    const PIXEL_SIZE = 3;
    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const w = canvas.width;
      const h = canvas.height;
      // Title area to exclude (44.3%-55.7% horizontal, 42.9%-57.1% vertical)
      const tx1 = w * 0.443, tx2 = w * 0.557;
      const ty1 = h * 0.429, ty2 = h * 0.571;
      const count = Math.floor(w * h / 1200);
      for (let i = 0; i < count; i++) {
        const px = Math.floor(Math.random() * w / PIXEL_SIZE) * PIXEL_SIZE;
        const py = Math.floor(Math.random() * h / PIXEL_SIZE) * PIXEL_SIZE;
        if (px >= tx1 && px <= tx2 && py >= ty1 && py <= ty2) continue;
        const isWhite = Math.random() > 0.5;
        const alpha = Math.random() * 0.4 + 0.1;
        ctx.fillStyle = isWhite
          ? `rgba(255,255,255,${alpha})`
          : `rgba(0,0,0,${alpha * 1.2})`;
        ctx.fillRect(px, py, PIXEL_SIZE, PIXEL_SIZE);
      }
      animationId = requestAnimationFrame(draw);
    };
    draw();

    return () => {
      cancelAnimationFrame(animationId);
      window.removeEventListener("resize", resize);
    };
  }, []);

  const buttons: MenuButtonData[] = [
    { key: "factions", label: "势力分布", subLabel: "FACTIONS", onClick: () => go(onFactions) },
    { key: "new", label: "新游戏", subLabel: "NEW GAME", onClick: () => go(onNewGame) },
    { key: "gallery", label: "人物图谱", subLabel: "CHARACTERS", onClick: () => go(onGallery) },
    { key: "pet", label: "灵宠", subLabel: "COMPANIONS", onClick: () => go(onPet) },
  ];

  return (
    <div className="fixed inset-0 overflow-hidden bg-black" onMouseMove={handleMouseMove} onClick={handleBgClick}>
      {/* Background image - completely static, no transforms */}
      <img
        src={assetUrl("images/main-menu-official.jpg")}
        alt="主菜单"
        className="absolute inset-0 w-full h-full object-cover"
        draggable={false}
        onLoad={() => setLoaded(true)}
      />

      {/* === Effect layers - all BELOW the title protector === */}
      {/* Title bounding box: left 38.5%, top 28.5%, right 62.5%, bottom 58% */}

      {/* Pixel rain canvas */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 pointer-events-none z-[5]"
        style={{ opacity: 0.7 }}
      />

      {/* Black & white pixel noise - localized to non-title areas */}
      <canvas
        ref={pixelNoiseRef}
        className="absolute inset-0 pointer-events-none z-[5.5]"
        style={{ opacity: 0.35, mixBlendMode: "overlay" }}
      />

      {/* Scanline overlay */}
      <div className="scanlines absolute inset-0 pointer-events-none z-[6]" />

      {/* Mouse spotlight */}
      <div
        className="absolute inset-0 pointer-events-none z-[6.5]"
        style={{
          background: `radial-gradient(circle 280px at ${mousePos.x * 100}% ${mousePos.y * 100}%, rgba(200,160,67,0.05) 0%, transparent 60%)`,
          transition: "background 0.1s ease-out",
        }}
      />

      {/* Click ripples on background */}
      {clickRipples.map(r => (
        <span
          key={r.id}
          className="bg-click-ripple pointer-events-none z-[6.5]"
          style={{ left: r.x, top: r.y }}
        />
      ))}

      {!loaded && (
        <div className="absolute inset-0 flex items-center justify-center bg-black z-50">
          <div className="flex gap-2">
            {[0, 1, 2].map(i => (
              <span key={i} className="w-2 h-2 rounded-full bg-[#c9b896]" style={{ animation: `pulse 1.2s ease-in-out ${i * 0.2}s infinite` }} />
            ))}
          </div>
        </div>
      )}

      {/* Atmospheric effects - mist only, no colored particles */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden z-[4]">
        <div className="mist-layer absolute inset-y-0 w-1/3" style={{ background: "linear-gradient(90deg, transparent, rgba(200,160,67,0.03), transparent)", animationDuration: "25s" }} />
        <div className="mist-layer absolute inset-y-0 w-1/3" style={{ background: "linear-gradient(90deg, transparent, rgba(200,160,67,0.02), transparent)", animationDuration: "35s", animationDelay: "5s" }} />
        <div className="absolute inset-0" style={{ background: "linear-gradient(180deg, transparent 30%, rgba(200,160,67,0.04) 50%, transparent 70%)", backgroundSize: "100% 300%", animation: "vertical-sweep 20s ease-in-out infinite" }} />
      </div>

      {/* === Title protector: clean copy of background image clipped to 497x335 ratio === */}
      <img
        src={assetUrl("images/main-menu-official.jpg")}
        alt=""
        className="absolute inset-0 w-full h-full object-cover pointer-events-none"
        draggable={false}
        style={{
          zIndex: 9,
          clipPath: "polygon(44.3% 42.9%, 55.7% 42.9%, 55.7% 57.1%, 44.3% 57.1%)",
        }}
      />

      {/* Top-right corner controls */}
      <div className="absolute top-5 right-5 z-30 flex gap-3">
        <button
          onClick={() => { playSound("click"); setShowMessages(true); }}
          onMouseEnter={() => playSound("hover")}
          className="para-corner-btn group"
          title="消息"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
            <path d="M13.73 21a2 2 0 0 1-3.46 0" />
          </svg>
          <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-[#c8a043] animate-pulse" />
        </button>
        <button
          onClick={() => { playSound("click"); setShowSettings(true); }}
          onMouseEnter={() => playSound("hover")}
          className="para-corner-btn group"
          title="设置"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="group-hover:rotate-90 transition-transform duration-500">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
        </button>
      </div>

      {/* Premium parallelogram buttons —— 整行按视口缩放，窄屏也能完整显示 */}
      <div
        className="absolute bottom-[9%] left-1/2 z-20 flex flex-row items-end justify-center gap-4 lg:gap-8"
        style={{
          transform: `translateX(-50%) scale(${menuScale})`,
          transformOrigin: "50% 100%",
        }}
      >
        {buttons.map((btn, i) => (
          <ParallelogramButton
            key={btn.key}
            data={btn}
            index={i}
            isHovered={hoveredKey === btn.key}
            onHover={(k) => { setHoveredKey(k); playSound("hover"); }}
            onLeave={() => setHoveredKey(null)}
          />
        ))}
      </div>

      {/* Settings panel */}
      <AnimatePresence>
        {showSettings && <SettingsModal onClose={() => setShowSettings(false)} settings={settings} onSave={saveSettings} />}
      </AnimatePresence>

      {/* Messages panel */}
      <AnimatePresence>
        {showMessages && <MessagesModal onClose={() => setShowMessages(false)} />}
      </AnimatePresence>

      {/* Ritual fade transition */}
      <AnimatePresence>
        {fading && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.8 }}
            className="fixed inset-0 z-50 bg-black flex items-center justify-center"
            onAnimationComplete={() => fading()}
          >
            <motion.div initial={{ scaleX: 0 }} animate={{ scaleX: 1 }} transition={{ duration: 0.8, delay: 0.2 }} className="h-px bg-gradient-to-r from-transparent via-[#c9b896] to-transparent" style={{ width: 220 }} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ============ Premium Parallelogram Button - Black + Black 3D ============ */

function ParallelogramButton({
  data,
  index,
  isHovered,
  onHover,
  onLeave,
}: {
  data: MenuButtonData;
  index: number;
  isHovered: boolean;
  onHover: (key: string) => void;
  onLeave: () => void;
}) {
  const [ripples, setRipples] = useState<{ id: number; x: number; y: number }[]>([]);
  const [particles, setParticles] = useState<{ id: number; dx: number; dy: number; delay: number }[]>([]);

  const handleClick = (e: MouseEvent<HTMLButtonElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const id = Date.now();
    setRipples(prev => [...prev, { id, x: e.clientX - rect.left, y: e.clientY - rect.top }]);
    setTimeout(() => setRipples(prev => prev.filter(r => r.id !== id)), 800);
    const newParts = Array.from({ length: 8 }).map((_, i) => ({
      id: id * 10 + i,
      dx: (Math.random() - 0.5) * 140,
      dy: -40 - Math.random() * 100,
      delay: i * 0.04,
    }));
    setParticles(prev => [...prev, ...newParts]);
    setTimeout(() => setParticles(prev => prev.filter(p => !newParts.some(np => np.id === p.id))), 1200);
    data.onClick();
  };

  const paraClip = "polygon(14% 0, 100% 0, 86% 100%, 0 100%)";

  return (
    <motion.button
      initial={{ opacity: 0, y: 50, filter: "blur(8px)" }}
      animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
      transition={{ duration: 0.7, delay: 0.5 + index * 0.15, ease: [0.16, 1, 0.3, 1] }}
      onClick={handleClick}
      onMouseEnter={() => onHover(data.key)}
      onMouseLeave={onLeave}
      className={`para-btn-wrap relative`}
      style={{ width: 260, height: 80, flex: "0 0 auto" }}
    >
      {/* Ambient glow behind button */}
      <span className="para-ambient" style={{ opacity: isHovered ? 1 : 0 }} />

      {/* Back parallelogram - solid black, offset for 3D depth */}
      <span
        className="para-back absolute inset-0"
        style={{
          clipPath: paraClip,
          transform: isHovered ? "translate(7px, 5px)" : "translate(4px, 3px)",
          transition: "transform 0.4s cubic-bezier(0.16,1,0.3,1)",
        }}
      />

      {/* Front parallelogram - darker black, main visible layer */}
      <span
        className="para-front absolute inset-0"
        style={{
          clipPath: paraClip,
          transform: isHovered ? "translate(-2px, -2px)" : "translate(0, 0)",
          transition: "transform 0.4s cubic-bezier(0.16,1,0.3,1)",
        }}
      >
        {/* Shimmer sweep on hover */}
        {isHovered && <span className="para-shimmer" />}
        {/* Pixel grid overlay on hover */}
        {isHovered && <span className="para-pixel-grid" />}
        {/* Glitch scan lines inside button */}
        <span className="para-scanline" />
        {/* Inner gradient line accents */}
        <span className="para-line-top" style={{ clipPath: paraClip }} />
        <span className="para-line-bottom" style={{ clipPath: paraClip }} />
      </span>

      {/* Parallelogram border outline - glowing */}
      <span
        className="para-border absolute inset-0"
        style={{
          clipPath: paraClip,
          opacity: isHovered ? 1 : 0.4,
          transition: "opacity 0.4s ease",
        }}
      />

      {/* Corner accent marks */}
      <span className="para-corner para-corner-tl" style={{ opacity: isHovered ? 1 : 0.3, transition: "opacity 0.4s ease" }} />
      <span className="para-corner para-corner-br" style={{ opacity: isHovered ? 1 : 0.3, transition: "opacity 0.4s ease" }} />

      {/* Glitch text layers (RGB split on hover) */}
      {isHovered && (
        <>
          <span
            className="absolute inset-0 z-[8] flex flex-col items-center justify-center h-full gap-1 px-8 pointer-events-none"
            style={{ transform: "skewX(-8deg) translate(2px, 0)", clipPath: paraClip }}
          >
            <span className="font-cormorant text-2xl tracking-[0.2em] italic leading-tight" style={{ color: "rgba(255,0,80,0.5)" }}>
              {data.label}
            </span>
          </span>
          <span
            className="absolute inset-0 z-[8] flex flex-col items-center justify-center h-full gap-1 px-8 pointer-events-none"
            style={{ transform: "skewX(-8deg) translate(-2px, 0)", clipPath: paraClip }}
          >
            <span className="font-cormorant text-2xl tracking-[0.2em] italic leading-tight" style={{ color: "rgba(0,200,255,0.5)" }}>
              {data.label}
            </span>
          </span>
        </>
      )}

      {/* Content: label + sublabel, italic text */}
      <span className="relative z-10 flex flex-col items-center justify-center h-full gap-1 px-8" style={{ transform: "skewX(-8deg)" }}>
        <span
          className="font-cormorant text-2xl tracking-[0.2em] italic leading-tight"
          style={{
            color: isHovered ? "#fff5d0" : "#e8dfc8",
            textShadow: isHovered ? "0 0 14px rgba(240,200,98,0.6), 0 2px 4px rgba(0,0,0,0.8)" : "0 2px 4px rgba(0,0,0,0.8)",
            transition: "all 0.4s ease",
          }}
        >
          {data.label}
        </span>
        <span
          className="font-cormorant text-[10px] tracking-[0.3em] italic leading-tight"
          style={{
            color: isHovered ? "#c8a043" : "#8a7a5c",
            transition: "color 0.4s ease",
          }}
        >
          {data.subLabel}
        </span>
      </span>

      {/* Floating pixel particles on hover */}
      {isHovered && (
        <span className="absolute inset-0 pointer-events-none overflow-visible">
          {Array.from({ length: 5 }).map((_, i) => (
            <span
              key={i}
              className="para-float-particle"
              style={{
                left: `${15 + i * 20}%`,
                bottom: "50%",
                animationDelay: `${i * 0.4}s`,
              }}
            />
          ))}
          {/* Pixel squares drifting */}
          {Array.from({ length: 4 }).map((_, i) => (
            <span
              key={`px-${i}`}
              className="para-pixel-drift"
              style={{
                left: `${20 + i * 25}%`,
                top: `${30 + i * 10}%`,
                animationDelay: `${i * 0.3}s`,
              }}
            />
          ))}
        </span>
      )}

      {/* Click ripples & burst particles */}
      {ripples.map(r => (
        <span key={r.id} className="para-ripple" style={{ left: r.x, top: r.y }} />
      ))}
      {particles.map(p => (
        <span
          key={p.id}
          className="para-burst-particle"
          style={{
            left: "50%",
            top: "50%",
            ["--dx" as string]: `${p.dx}px`,
            ["--dy" as string]: `${p.dy}px`,
            animationDelay: `${p.delay}s`,
          }}
        />
      ))}
    </motion.button>
  );
}

/* ============ Settings Modal ============ */

function SettingsModal({ onClose, settings, onSave }: { onClose: () => void; settings: any; onSave: (s: any) => void }) {
  const [local, setLocal] = useState(settings);
  const update = (key: string, val: any) => { const s = { ...local, [key]: val }; setLocal(s); onSave(s); playSound("hover"); };

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-[60] flex items-center justify-center p-8"
      style={{ background: "rgba(0,0,0,0.88)", backdropFilter: "blur(8px)" }}
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.9, y: 20, opacity: 0 }} animate={{ scale: 1, y: 0, opacity: 1 }} exit={{ scale: 0.9, y: 20, opacity: 0 }}
        transition={{ type: "spring", stiffness: 220, damping: 22 }}
        onClick={(e) => e.stopPropagation()}
        className="w-[560px] rounded-xl overflow-hidden relative"
        style={{ background: "#0a0806", border: "1px solid rgba(160,128,48,0.3)", boxShadow: "0 20px 50px rgba(0,0,0,0.8)" }}
      >
        <div className="absolute top-0 left-0 w-6 h-6 border-t-2 border-l-2 border-[#a08030]/50 rounded-tl-xl" />
        <div className="absolute top-0 right-0 w-6 h-6 border-t-2 border-r-2 border-[#a08030]/50 rounded-tr-xl" />
        <div className="absolute bottom-0 left-0 w-6 h-6 border-b-2 border-l-2 border-[#a08030]/50 rounded-bl-xl" />
        <div className="absolute bottom-0 right-0 w-6 h-6 border-b-2 border-r-2 border-[#a08030]/50 rounded-br-xl" />

        <div className="p-5 border-b border-[#a08030]/20 flex items-center justify-between">
          <h3 className="font-cormorant text-[#e8dfc8] text-2xl tracking-[0.2em]" style={{ fontWeight: 600 }}>设 置</h3>
          <button onClick={onClose} className="w-8 h-8 rounded-full flex items-center justify-center hover:scale-110 transition-all" style={{ background: "rgba(0,0,0,0.4)", border: "1px solid rgba(160,128,48,0.3)" }}>
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2 2l8 8M10 2l-8 8" stroke="#c9b896" strokeWidth="1.3" strokeLinecap="round"/></svg>
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="font-gothic text-[#e8dfc8] text-sm tracking-wider">背景音乐</span>
              <span className="font-cinzel text-[10px] text-[#a08030] tracking-widest">{local.bgm}%</span>
            </div>
            <input type="range" min="0" max="100" value={local.bgm} onChange={(e) => update("bgm", parseInt(e.target.value))} className="w-full h-1 rounded-full appearance-none cursor-pointer" style={{ background: `linear-gradient(to right, #a08030 ${local.bgm}%, #1a1612 ${local.bgm}%)` }} />
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="font-gothic text-[#e8dfc8] text-sm tracking-wider">音效音量</span>
              <span className="font-cinzel text-[10px] text-[#a08030] tracking-widest">{local.sfx}%</span>
            </div>
            <input type="range" min="0" max="100" value={local.sfx} onChange={(e) => update("sfx", parseInt(e.target.value))} className="w-full h-1 rounded-full appearance-none cursor-pointer" style={{ background: `linear-gradient(to right, #a08030 ${local.sfx}%, #1a1612 ${local.sfx}%)` }} />
          </div>

          <div>
            <span className="font-gothic text-[#e8dfc8] text-sm tracking-wider mb-2 block">画面质量</span>
            <div className="flex gap-2">
              {["low", "medium", "high"].map(q => (
                <button key={q} onClick={() => update("quality", q)} className={`flex-1 py-2 rounded text-xs font-cinzel border transition-all ${local.quality === q ? "border-[#a08030] bg-[#a08030]/15 text-[#e8dfc8]" : "border-[#a08030]/30 text-[#c9b896]/60 hover:border-[#a08030]/60"}`}>
                  {q === "low" ? "低" : q === "medium" ? "中" : "高"}
                </button>
              ))}
            </div>
          </div>

          <div>
            <span className="font-gothic text-[#e8dfc8] text-sm tracking-wider mb-2 block">游戏节奏</span>
            <div className="flex gap-2">
              {[
                { v: "slow", l: "慢速" },
                { v: "normal", l: "正常" },
                { v: "fast", l: "快速" },
              ].map(s => (
                <button key={s.v} onClick={() => update("speed", s.v)} className={`flex-1 py-2 rounded text-xs font-cinzel border transition-all ${local.speed === s.v ? "border-[#a08030] bg-[#a08030]/15 text-[#e8dfc8]" : "border-[#a08030]/30 text-[#c9b896]/60 hover:border-[#a08030]/60"}`}>
                  {s.l}
                </button>
              ))}
            </div>
          </div>

          <div>
            <span className="font-gothic text-[#e8dfc8] text-sm tracking-wider mb-2 block">对手强度</span>
            <div className="flex gap-2">
              {[
                { v: "easy", l: "生手" },
                { v: "normal", l: "叙事者" },
                { v: "hard", l: "执笔人" },
              ].map((d) => (
                <button
                  key={d.v}
                  onClick={() => update("difficulty", d.v)}
                  className={`flex-1 py-2 rounded text-xs font-cinzel border transition-all ${(local.difficulty ?? "normal") === d.v ? "border-[#a08030] bg-[#a08030]/15 text-[#e8dfc8]" : "border-[#a08030]/30 text-[#c9b896]/60 hover:border-[#a08030]/60"}`}
                >
                  {d.l}
                </button>
              ))}
            </div>
            <div className="font-cormorant text-[10px] text-[#6a5418] italic mt-1.5">
              影响 AI 的决策噪声：执笔人几乎不会走错，生手常有失误。
            </div>
          </div>

          <div className="flex items-center justify-between p-3 rounded-lg border border-[#a08030]/20 bg-[#1a1612]/50">
            <span className="font-gothic text-[#e8dfc8] text-sm tracking-wider">自动出牌</span>
            <button onClick={() => update("autoPlay", !local.autoPlay)} className={`w-12 h-6 rounded-full transition-all relative ${local.autoPlay ? "bg-[#a08030]" : "bg-[#1a1612] border border-[#a08030]/30"}`}>
              <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-[#e8dfc8] transition-all ${local.autoPlay ? "left-6" : "left-0.5"}`} />
            </button>
          </div>
        </div>

        <div className="px-5 py-3 border-t border-[#a08030]/20 flex items-center justify-between">
          <span className="font-cinzel text-[9px] text-[#6a5418] tracking-widest">VERSION 0.9.9034 / 5.64</span>
          <span className="font-brush text-[11px] text-[#8a7a5c] italic">「叙事者篇章之战」</span>
        </div>
      </motion.div>
    </motion.div>
  );
}

function MessagesModal({ onClose }: { onClose: () => void }) {
  const messages = [
    { title: "系统公告", desc: "欢迎来到重叙日·篇章之战", time: "刚刚", unread: true },
    { title: "版本更新", desc: "新增3D势力环廊视图", time: "1小时前", unread: true },
    { title: "活动通知", desc: "叙事者征集活动开启", time: "昨天", unread: false },
  ];

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-[60] flex items-center justify-center p-8"
      style={{ background: "rgba(0,0,0,0.88)", backdropFilter: "blur(8px)" }}
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.9, y: 20, opacity: 0 }} animate={{ scale: 1, y: 0, opacity: 1 }} exit={{ scale: 0.9, y: 20, opacity: 0 }}
        transition={{ type: "spring", stiffness: 220, damping: 22 }}
        onClick={(e) => e.stopPropagation()}
        className="w-[480px] rounded-xl overflow-hidden relative"
        style={{ background: "#0a0806", border: "1px solid rgba(160,128,48,0.3)", boxShadow: "0 20px 50px rgba(0,0,0,0.8)" }}
      >
        <div className="absolute top-0 left-0 w-6 h-6 border-t-2 border-l-2 border-[#a08030]/50 rounded-tl-xl" />
        <div className="absolute top-0 right-0 w-6 h-6 border-t-2 border-r-2 border-[#a08030]/50 rounded-tr-xl" />
        <div className="absolute bottom-0 left-0 w-6 h-6 border-b-2 border-l-2 border-[#a08030]/50 rounded-bl-xl" />
        <div className="absolute bottom-0 right-0 w-6 h-6 border-b-2 border-r-2 border-[#a08030]/50 rounded-br-xl" />

        <div className="p-5 border-b border-[#a08030]/20 flex items-center justify-between">
          <h3 className="font-cormorant text-[#e8dfc8] text-2xl tracking-[0.2em]" style={{ fontWeight: 600 }}>消 息</h3>
          <button onClick={onClose} className="w-8 h-8 rounded-full flex items-center justify-center hover:scale-110 transition-all" style={{ background: "rgba(0,0,0,0.4)", border: "1px solid rgba(160,128,48,0.3)" }}>
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2 2l8 8M10 2l-8 8" stroke="#c9b896" strokeWidth="1.3" strokeLinecap="round"/></svg>
          </button>
        </div>

        <div className="p-4 space-y-2 max-h-[400px] overflow-y-auto">
          {messages.map((m, i) => (
            <div key={i} className="p-3 rounded-lg border border-[#a08030]/20 bg-[#1a1612]/50 hover:border-[#a08030]/40 transition-all cursor-pointer">
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  {m.unread && <span className="w-2 h-2 rounded-full bg-[#a08030]" />}
                  <span className="font-gothic text-[#e8dfc8] text-sm">{m.title}</span>
                </div>
                <span className="font-cinzel text-[9px] text-[#6a5418]">{m.time}</span>
              </div>
              <p className="text-xs text-[#c9b896] leading-relaxed">{m.desc}</p>
            </div>
          ))}
        </div>
      </motion.div>
    </motion.div>
  );
}

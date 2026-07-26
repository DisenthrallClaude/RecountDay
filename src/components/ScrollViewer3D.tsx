import { Component, Suspense, useEffect, useState, useRef, useCallback, type ReactNode } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, ContactShadows } from '@react-three/drei';
import { motion, AnimatePresence } from 'framer-motion';
import type { CharacterDef } from '../data/characters';
import ScrollScene from './Scroll';
import CharacterScrollContent from './CharacterScrollContent';
import { Floor, Backdrop, Torchlight } from './SceneDressing';
import './ParchmentMaterial';
import { IconExit } from './Icons';

function Loader() {
  return (
    <mesh>
      <boxGeometry args={[0.1, 0.1, 0.1]} />
      <meshBasicMaterial color="#601010" />
    </mesh>
  );
}

/* ──────────────────────────────────────────────
   Loading transition
   ────────────────────────────────────────────── */

function LoadingTransition({ character }: { character: CharacterDef }) {
  return (
    <motion.div
      key="loading"
      initial={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.6 }}
      className="fixed inset-0 z-[95] flex items-center justify-center"
      style={{
        background: 'radial-gradient(ellipse at 50% 40%, #2a1010 0%, #0a0303 70%, #000 100%)',
      }}
    >
      <div className="text-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.2 }}
          className="font-caoshu text-5xl md:text-6xl mb-3"
          style={{ color: character.color, textShadow: '0 0 30px rgba(200,160,67,0.3)' }}
        >
          {character.name}
        </motion.div>
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 0.6 }}
          transition={{ duration: 0.6, delay: 0.6 }}
          className="font-cinzel text-xs tracking-[0.5em] text-[#a08030] mb-8"
        >
          {character.ability}
        </motion.div>
        <div className="flex justify-center gap-2">
          {[0, 1, 2].map((i) => (
            <motion.div
              key={i}
              className="w-2 h-2 rounded-full bg-[#a08030]"
              animate={{ opacity: [0.2, 1, 0.2] }}
              transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.2 }}
            />
          ))}
        </div>
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 0.4 }}
          transition={{ duration: 0.6, delay: 1 }}
          className="font-cinzel text-[10px] tracking-[0.4em] text-[#a08030] mt-6"
        >
          UNFOLDING THE SCROLL
        </motion.div>
      </div>
    </motion.div>
  );
}

/* ──────────────────────────────────────────────
   Fullscreen detail — large portrait + big white
   text with key info. Minimal, clean, readable.
   ────────────────────────────────────────────── */

function FullscreenDetail({ character, onClose }: { character: CharacterDef; onClose: () => void }) {
  // Get top 3 skills for compact display
  const topSkills = character.skills.slice(0, 3);
  const maxRank = Math.max(...character.skills.map(s => s.rankReq));

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
      className="fixed inset-0 z-[100] flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.95)', backdropFilter: 'blur(10px)' }}
      onClick={onClose}
    >
      {/* Close button */}
      <button
        onClick={(e) => { e.stopPropagation(); onClose(); }}
        className="absolute top-6 right-6 w-10 h-10 rounded-full flex items-center justify-center transition-all hover:scale-110 z-10"
        style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)' }}
      >
        <IconExit size={14} color="#ffffff" />
      </button>

      <motion.div
        initial={{ scale: 0.9, y: 30 }}
        animate={{ scale: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        className="flex gap-12 items-center max-w-[1200px] max-h-[90vh] px-10"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Left: large portrait */}
        <div className="flex-shrink-0" style={{ width: '380px' }}>
          <div className="relative" style={{
            background: 'linear-gradient(135deg, #3a2814 0%, #2a1a08 50%, #1a1208 100%)',
            padding: '6px', borderRadius: '4px', border: '1px solid #4a3818',
            boxShadow: '0 16px 50px rgba(0,0,0,0.9), 0 0 24px rgba(200,160,67,0.2)',
          }}>
            <div className="relative rounded-[3px] overflow-hidden" style={{ border: '1px solid rgba(200,160,67,0.3)', aspectRatio: '9/16' }}>
              <img src={character.portrait} alt={character.name} className="w-full h-full object-cover" />
              <div className="absolute inset-0" style={{ background: `linear-gradient(180deg, transparent 55%, ${character.color}22 85%, ${character.color}44 100%)` }} />
            </div>
          </div>
        </div>

        {/* Right: large white text with key info */}
        <div className="flex-1">
          {/* Name — very large white */}
          <motion.h1
            initial={{ opacity: 0, x: 30 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="font-caoshu text-white leading-none mb-2"
            style={{ fontSize: '5rem', textShadow: '0 0 40px rgba(255,255,255,0.15)' }}
          >
            {character.name}
          </motion.h1>

          {/* Ability — medium white */}
          <motion.p
            initial={{ opacity: 0, x: 30 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6, delay: 0.25 }}
            className="font-cinzel text-white/60 tracking-[0.3em] mb-8"
            style={{ fontSize: '1.1rem' }}
          >
            {character.ability}
          </motion.p>

          {/* Quote — large white italic */}
          <motion.p
            initial={{ opacity: 0, x: 30 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6, delay: 0.4 }}
            className="font-brush text-white/90 italic mb-8"
            style={{ fontSize: '1.6rem', lineHeight: 1.6 }}
          >
            「{character.quote}」
          </motion.p>

          {/* Description — medium white */}
          <motion.p
            initial={{ opacity: 0, x: 30 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6, delay: 0.55 }}
            className="text-white/70 mb-8"
            style={{ fontSize: '1.1rem', lineHeight: 1.8 }}
          >
            {character.desc}
          </motion.p>

          {/* Key stats — large white numbers */}
          <motion.div
            initial={{ opacity: 0, x: 30 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6, delay: 0.7 }}
            className="flex gap-8 mb-8"
          >
            <div>
              <div className="text-white/40 text-xs tracking-widest mb-1">篇幅</div>
              <div className="font-gothic text-white text-4xl">{character.maxFragments}</div>
            </div>
            <div>
              <div className="text-white/40 text-xs tracking-widest mb-1">技能</div>
              <div className="font-gothic text-white text-4xl">{character.skills.length}</div>
            </div>
            <div>
              <div className="text-white/40 text-xs tracking-widest mb-1">最高阶</div>
              <div className="font-gothic text-white text-4xl">{maxRank}</div>
            </div>
          </motion.div>

          {/* Top skills — white text */}
          <motion.div
            initial={{ opacity: 0, x: 30 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6, delay: 0.85 }}
            className="space-y-3"
          >
            {topSkills.map((sk) => (
              <div key={sk.key} className="flex items-baseline gap-3">
                <span className="font-gothic text-white text-xl">{sk.name}</span>
                <span className="text-white/40 text-sm">— {sk.desc}</span>
              </div>
            ))}
          </motion.div>
        </div>
      </motion.div>
    </motion.div>
  );
}

/* ──────────────────────────────────────────────
   Main viewer
   ────────────────────────────────────────────── */

interface ScrollViewer3DProps {
  character: CharacterDef;
  onClose: () => void;
}

export default function ScrollViewer3D({ character, onClose }: ScrollViewer3DProps) {
  const [showLoading, setShowLoading] = useState(true);
  const [sceneError, setSceneError] = useState<string | null>(null);
  const [openTarget, setOpenTarget] = useState<0 | 1>(0);
  const [progress, setProgress] = useState(0);
  const [showFullscreen, setShowFullscreen] = useState(false);
  const sceneMountedRef = useRef(false);
  const lastClickRef = useRef<number>(0);

  // Phase 1: loading transition (1.5 s) → then mount 3D scene
  useEffect(() => {
    const t = setTimeout(() => setShowLoading(false), 1500);
    return () => clearTimeout(t);
  }, []);

  // Phase 2: once scene is mounted, auto-open the scroll after a short beat
  useEffect(() => {
    if (!showLoading && !sceneMountedRef.current) {
      sceneMountedRef.current = true;
      const t = setTimeout(() => setOpenTarget(1), 500);
      return () => clearTimeout(t);
    }
  }, [showLoading]);

  const handleProgress = (p: number) => {
    setProgress(p);
  };

  const contentRevealed = progress > 0.88;

  // Double-click on the canvas area → fullscreen
  const handleCanvasClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (!contentRevealed) return;
    const now = Date.now();
    if (now - lastClickRef.current < 400) {
      // Double click — open fullscreen
      setShowFullscreen(true);
      lastClickRef.current = 0;
    } else {
      lastClickRef.current = now;
    }
  }, [contentRevealed]);

  return (
    <div className="fixed inset-0 z-[90] overflow-hidden bg-black" onClick={onClose}>
      {/* ambient CSS backdrop glow */}
      <div className="absolute inset-0" style={{
        background: 'radial-gradient(ellipse at 50% 35%, #8a3030 0%, #3a1010 45%, #180505 100%)',
      }} />

      {/* 3D Canvas — double-click triggers fullscreen */}
      <div className="absolute inset-0" onClick={handleCanvasClick}>
        <Canvas
          shadows
          camera={{ position: [0, 1.4, 4.6], fov: 42 }}
          gl={{ antialias: true, powerPreference: 'high-performance' }}
          className="!absolute inset-0"
        >
          <color attach="background" args={['#2a1010']} />
          <fog attach="fog" args={['#2a1010', 12, 28]} />

          <ambientLight intensity={1.6} color={'#9a7a6a'} />
          <directionalLight
            position={[3, 5, 4]}
            intensity={4.2}
            color={'#ffe3c2'}
            castShadow
            shadow-mapSize={[2048, 2048]}
            shadow-camera-left={-4}
            shadow-camera-right={4}
            shadow-camera-top={4}
            shadow-camera-bottom={-4}
          />
          <directionalLight position={[-4, 2, -3]} intensity={1.4} color={'#b06bff'} />
          <Torchlight position={[-3.2, 2.0, 1.5]} />
          <Torchlight position={[3.2, 2.0, 1.5]} />

          <SceneErrorBoundary onError={setSceneError}>
            <Suspense fallback={<Loader />}>
              <Backdrop />
              <Floor />
              <ScrollScene openTarget={openTarget} onProgress={handleProgress} />
              {/* Character portrait embedded on the parchment surface */}
              <CharacterScrollContent character={character} progress={progress} />
              <ContactShadows position={[0, -0.34, 0]} opacity={0.55} scale={12} blur={2.4} far={2} />
            </Suspense>
          </SceneErrorBoundary>

          <OrbitControls
            enablePan={false}
            minDistance={2.6}
            maxDistance={7}
            minPolarAngle={Math.PI / 4}
            maxPolarAngle={Math.PI / 1.7}
            minAzimuthAngle={-Math.PI * 0.35}
            maxAzimuthAngle={Math.PI * 0.35}
            target={[0, 0.8, 0]}
          />
        </Canvas>
      </div>

      {/* Progress bar */}
      <div
        className="pointer-events-none absolute bottom-8 left-1/2 -translate-x-1/2 z-[5]"
        style={{ opacity: contentRevealed ? 0 : 1, transition: 'opacity 0.6s ease' }}
      >
        <div className="w-64 h-1 rounded-full bg-black/40 border border-[#5a2a12]/60 overflow-hidden backdrop-blur-sm">
          <div
            className="h-full bg-gradient-to-r from-[#7a1010] via-[#c9862f] to-[#ffdca0] transition-[width] duration-150"
            style={{ width: `${Math.round(progress * 100)}%` }}
          />
        </div>
      </div>

      {/* Double-click hint — fades in after scroll opens */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: contentRevealed ? 0.5 : 0 }}
        transition={{ duration: 0.8, delay: 0.5 }}
        className="pointer-events-none absolute bottom-8 left-1/2 -translate-x-1/2 z-[5] font-cinzel text-[10px] tracking-[0.4em] text-[#c9b896]"
      >
        DOUBLE CLICK TO VIEW FULLSCREEN
      </motion.div>

      {/* Close button */}
      <button
        onClick={(e) => { e.stopPropagation(); onClose(); }}
        className="absolute top-6 right-6 w-10 h-10 rounded-full flex items-center justify-center transition-all hover:scale-110 z-10"
        style={{ background: 'rgba(0,0,0,0.6)', border: '1px solid rgba(160,128,48,0.4)' }}
      >
        <IconExit size={14} color="#c9b896" />
      </button>

      {/* Loading transition overlay */}
      <AnimatePresence>
        {showLoading && !sceneError && <LoadingTransition character={character} />}
        {/* 场景加载失败时给出明确反馈，而不是让玩家对着加载动画干等 */}
        {sceneError && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-3 text-center px-6"
            style={{ background: "rgba(10,5,4,0.92)", backdropFilter: "blur(6px)" }}
          >
            <div className="font-caoshu text-[#c9b896] text-2xl tracking-[0.26em]">卷轴未能展开</div>
            <div className="font-cinzel text-[8px] tracking-[0.42em] text-[#6a5418]">SCROLL FAILED TO UNFURL</div>
            <p className="font-brush text-[12px] text-[#8a7a5c] italic max-w-sm leading-relaxed mt-1">
              叙事场景的素材未能载入。
            </p>
            <code className="text-[10px] text-[#5a4818] max-w-md break-all">{sceneError}</code>
            <button
              onClick={onClose}
              className="mt-3 px-6 py-2 rounded-full font-cinzel text-[11px] tracking-[0.24em] transition-all hover:scale-105"
              style={{ background: "linear-gradient(180deg,#2a2218,#1a1410)", border: "1px solid #a08030", color: "#e8dfc8" }}
            >
              返回
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Fullscreen detail overlay */}
      <AnimatePresence>
        {showFullscreen && <FullscreenDetail character={character} onClose={() => setShowFullscreen(false)} />}
      </AnimatePresence>
    </div>
  );
}

/**
 * 3D 场景错误边界。
 *
 * drei 的 useTexture / useGLTF 在资源加载失败时会向上抛出 promise 或错误。
 * 没有边界时，Suspense 会永远停在 fallback 上 —— 表现就是"点了展开叙事卷轴，
 * 然后一直卡在加载界面"，而控制台之外没有任何提示。
 * （本次修复的直接诱因：Scroll.tsx 用的是 `/textures/parchment.jpg` 这种
 *  绝对路径，一旦部署在子路径下就 404。路径已改走 assetUrl，
 *  这里再补一道兜底，避免以后任何一张贴图缺失又把整个场景拖死。）
 */
class SceneErrorBoundary extends Component<
  { children: ReactNode; onError: (msg: string) => void },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(err: unknown) {
    this.props.onError(err instanceof Error ? err.message : String(err));
  }

  render() {
    if (this.state.failed) return null;
    return this.props.children;
  }
}

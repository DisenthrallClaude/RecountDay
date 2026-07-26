import { useState, useEffect, useCallback, Suspense, Component, type ReactNode } from "react";
import { Canvas } from "@react-three/fiber";
import { useGLTF, OrbitControls, Center, Bounds, ContactShadows } from "@react-three/drei";
import { motion, AnimatePresence } from "framer-motion";
import { AudioManager } from "../audio/AudioManager";
import * as THREE from "three";
import { assetUrl } from "../utils/assetUrl";

// 模型已用 gltf-transform 重新压制：EXT_meshopt_compression + KHR_mesh_quantization
// + EXT_texture_webp（贴图 4096→2048）。单个模型从 63~87MB 降到 7~10MB，
// 显存占用也从约 268MB/只降到约 67MB/只，网格三角面数保持不变。
//
// 因此 useGLTF 必须开启 meshopt 解码（第三个参数），否则会直接解析失败。
// Draco 未使用，也就不再需要那个 gstatic CDN 解码器 —— 顺带去掉了一个
// 运行时的第三方依赖。

// ---------------- 神兽数据 ----------------
interface BeastDef {
  key: string;
  name: string;
  title: string;
  element: string;
  desc: string;
  lore: string;
  color: string;
  glow: string;
}

const BEASTS: BeastDef[] = [
  { key: "baize", name: "白泽", title: "通晓之兽", element: "智慧 · 神识", desc: "通晓万物之情，能言说天下鬼神之事。", lore: "黄帝巡狩至东海，遇白泽，其能言达万物之情，以知鬼神之事。古传《白泽图》一卷，录万妖之形，皆白泽所授。", color: "#e8dfc8", glow: "#c9b896" },
  { key: "feilian", name: "飞廉", title: "风神之兽", element: "疾风 · 风暴", desc: "鹿身雀首，蛇尾豹纹，掌管八面疾风。", lore: "飞廉，风神也。其形如鹿而雀首，蛇尾豹纹，能致风气。商纣之时，飞廉为将，善走奔袭，后为风神。", color: "#7ac4d0", glow: "#5ab0c0" },
  { key: "fuzhu", name: "夫诸", title: "水之瑞兽", element: "洪水 · 水脉", desc: "白角大鹿，现身则大水将至。", lore: "夫诸，状如白鹿而四角，见则其邑大水。上古之时，洪水泛滥，民见夫诸而迁居高处，以避水患。", color: "#6ab8e0", glow: "#4a98c0" },
  { key: "jiuweihu", name: "九尾狐", title: "千年灵狐", element: "幻术 · 永生", desc: "九尾象征千年修为，能化人形，通晓人心。", lore: "狐五十岁能变化为妇人，百岁为美女，千岁即与天通，为九尾狐。九尾狐现，天下太平，食者不蛊。", color: "#e08850", glow: "#c06830" },
  { key: "qilin", name: "麒麟", title: "仁德之兽", element: "仁义 · 祥瑞", desc: "不履生草，不食生虫，太平盛世方现。", lore: "麒麟，仁兽也。麋身牛尾，龙鳞马蹄。不履生草，不食生虫。王者至仁则出，圣人出亦现。", color: "#d0a040", glow: "#b08020" },
  { key: "qingluan", name: "青鸾", title: "西方神鸟", element: "信使 · 爱情", desc: "西王母之使，青羽如华，鸣声如乐。", lore: "青鸾，西王母之使也。其羽青如翠，鸣声如钟磬。青鸾舞则天下安宁，为爱情之信使。", color: "#50c070", glow: "#30a050" },
  { key: "qiongqi", name: "穷奇", title: "四凶之一", element: "混沌 · 惩善", desc: "闻人斗则食直者，闻人忠信则啮其鼻。", lore: "穷奇，状如牛而猬毛，音如獆狗。闻人斗则食直者，闻人忠信则啮其鼻，闻人恶逆则杀之。混沌之凶兽也。", color: "#8a3030", glow: "#6a2020" },
  { key: "taowu", name: "梼杌", title: "四凶之一", element: "混沌 · 顽固", desc: "状如虎而犬毛，人面虎足猪牙，性顽固不可教。", lore: "梼杌，四凶之一也。状如虎而犬毛，人面虎足猪牙。性顽固，不可教训，不知话言。天下之恶皆归之，故曰梼杌。", color: "#704020", glow: "#502010" },
  { key: "wenyao", name: "文鳐", title: "飞鱼之神", element: "夜光 · 飞行", desc: "夜飞昼伏，飞过则天下大穰。", lore: "文鳐鱼，状如鲤里鱼，鱼身而鸟翼，苍文白首赤喙。常行西海，游于东海，以夜飞。其音如鸾鸡，其味酸甘，食之已狂，见则天下大穰。", color: "#a0c0e0", glow: "#80a0c0" },
  { key: "zhuque", name: "朱雀", title: "南方火神", element: "火焰 · 涅槃", desc: "南方七宿之神，浴火重生，掌管天火。", lore: "南方朱雀，七宿之总称也。其形如凤，通体赤色，浴火而生。朱雀鸣则天下安宁，展翅则天火降世。", color: "#e04030", glow: "#c02010" },
];

// ---------------- 3D 模型组件 ----------------
function BeastModel({ modelKey, onLoaded }: { modelKey: string; onLoaded: () => void }) {
  // 第二、三个参数 false/false 关闭 Draco 与 Meshopt 解码：模型未做此类压缩，
  // 启用解码器不仅无益，还会在加载大体积 GLB 时引发解析失败（如 baize.glb）。
  // (path, useDraco=false, useMeshopt=true)
  const { scene } = useGLTF(assetUrl(`models/${modelKey}.glb`), false, true);
  const [cloned, setCloned] = useState<THREE.Group | null>(null);

  useEffect(() => {
    const clone = scene.clone(true);
    // 深拷贝材质以避免共享
    clone.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.material = child.material.clone();
        if (child.material.map) {
          child.material.map = child.material.map.clone();
          child.material.map.needsUpdate = true;
        }
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });
    setCloned(clone);
    // 模型已解码并克隆完成，通知父组件解除加载遮罩
    onLoaded();
    return () => {
      // 只释放"我们自己克隆出来的"资源。
      // 注意 Object3D.clone() 与源场景 **共享 geometry**，之前这里
      // 对 geometry 调用了 dispose()，销毁的其实是 useGLTF 缓存里那份原始
      // 几何体的 GPU 缓冲；一旦切走再切回（缓存仍命中），模型就渲染不出来了。
      // 材质与贴图是上面显式 clone 的，属于本组件私有，可以安全释放。
      clone.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          const mats = Array.isArray(child.material) ? child.material : [child.material];
          for (const m of mats) {
            if (!m) continue;
            (m as THREE.MeshStandardMaterial).map?.dispose();
            m.dispose();
          }
        }
      });
      setCloned(null);
    };
    // onLoaded 由父组件以 useCallback 稳定化；scene 在 GLTF 解析后引用稳定
  }, [scene, onLoaded]);

  if (!cloned) return null;
  return (
    <Center>
      <Bounds fit clip observe margin={1.2}>
        <primitive object={cloned} />
      </Bounds>
    </Center>
  );
}

// ---------------- 加载进度组件 ----------------
// 不再伪造百分比：模型流式下载期间显示不定式扫光进度条，
// 加载是否完成由 Suspense 解除后的 BeastModel 回调决定。
function LoadingProgress({ beastName }: { beastName: string }) {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#0a0806]">
      <div className="text-[#c9b896] font-caoshu text-2xl mb-6 opacity-80">{beastName}</div>
      <div className="w-64 h-px bg-[#3a342a] relative overflow-hidden">
        <div className="absolute inset-y-0 w-1/3 loading-sweep bg-gradient-to-r from-transparent via-[#c9a040] to-transparent" />
      </div>
      <div className="text-[#6a5418] font-cinzel text-xs mt-3 tracking-[0.3em]">
        SUMMONING...
      </div>
    </div>
  );
}

// ---------------- 错误降级组件 ----------------
function ErrorFallback({ beastName }: { beastName: string }) {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#0a0806]">
      <div className="text-[#8a2020] font-caoshu text-xl mb-4">召唤失败</div>
      <div className="text-[#6a5418] font-cormorant text-sm">
        灵兽「{beastName}」的契约无法建立
      </div>
      <div className="text-[#4a4030] font-cinzel text-xs mt-2 tracking-widest">
        CONJURATION FAILED
      </div>
    </div>
  );
}

// ---------------- 错误边界 ----------------
// useGLTF 在加载失败时会抛出异常；R3F 的 Canvas 会把内部错误向外重新抛出，
// 因此用一个 React 错误边界包裹 Canvas，捕获后渲染降级 UI，避免整个组件崩溃。
class ModelErrorBoundary extends Component<
  { children: ReactNode; fallback: ReactNode; onError?: () => void },
  { hasError: boolean }
> {
  constructor(props: { children: ReactNode; fallback: ReactNode; onError?: () => void }) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError(): { hasError: boolean } {
    return { hasError: true };
  }
  componentDidCatch(): void {
    this.props.onError?.();
  }
  render(): ReactNode {
    if (this.state.hasError) return <>{this.props.fallback}</>;
    return this.props.children;
  }
}

// ---------------- Canvas 容器 ----------------
function BeastCanvas({ modelKey, perfTier, onLoaded }: { modelKey: string; perfTier: "high" | "low"; onLoaded: () => void }) {
  return (
    <Canvas
      shadows={true}
      dpr={[1, 2]}
      camera={{ position: [3, 1.5, 5], fov: 35 }}
      gl={{ antialias: true, powerPreference: "high-performance" }}
    >
      <color attach="background" args={["#12100a"]} />
      <fog attach="fog" args={["#12100a", 18, 40]} />
      {/* 环境光 — 提亮整体，确保模型轮廓清晰 */}
      <ambientLight intensity={0.6} color="#c9b896" />
      {/* 主光源 — 正面偏上的暖白光，照亮模型正面 */}
      <directionalLight
        position={[4, 6, 6]}
        intensity={2.0}
        color="#fff5e0"
        castShadow={perfTier === "high"}
        shadow-mapSize-width={perfTier === "high" ? 1024 : 512}
        shadow-mapSize-height={perfTier === "high" ? 1024 : 512}
      />
      {/* 补光 — 左侧冷光，消除单侧阴影 */}
      <directionalLight position={[-6, 3, 4]} intensity={0.8} color="#a0c0e0" />
      {/* 正面补光 — 从相机方向直接照亮模型正面，提升可见度 */}
      <pointLight position={[0, 2, 5]} intensity={0.8} color="#ffe0b0" />
      {/* 底部补光 — 照亮模型下方，避免脚下全黑 */}
      <pointLight position={[0, -1, 3]} intensity={0.6} color="#e8dfc8" />
      {/* 背后轮廓光 — 勾勒模型边缘 */}
      <pointLight position={[0, 3, -5]} intensity={0.5} color="#a08030" />
      {/* 侧面暖光 — 增加体积感 */}
      <pointLight position={[5, 2, 0]} intensity={0.4} color="#c9a040" />
      <Suspense fallback={null}>
        <BeastModel modelKey={modelKey} onLoaded={onLoaded} />
        {perfTier === "high" && (
          <ContactShadows position={[0, -2, 0]} opacity={0.4} scale={10} blur={2} far={5} color="#000000" />
        )}
      </Suspense>
      <OrbitControls
        enablePan={false}
        minDistance={2}
        maxDistance={10}
        minPolarAngle={Math.PI / 6}
        maxPolarAngle={Math.PI / 1.8}
        autoRotate
        autoRotateSpeed={0.5}
        enableDamping
        dampingFactor={0.08}
      />
    </Canvas>
  );
}

// ---------------- 主组件 ----------------
interface Props {
  onBack: () => void;
}

export default function PetGallery({ onBack }: Props) {
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [loadError, setLoadError] = useState(false);
  // 模型是否真正完成解码并渲染：由 Suspense 解除后 BeastModel 的回调驱动，而非定时器
  const [modelLoaded, setModelLoaded] = useState(false);
  const [perfTier, setPerfTier] = useState<"high" | "low">("high");
  const selected = BEASTS[selectedIdx];

  // 模型加载完成的稳定回调，供 BeastModel 在克隆完成后调用
  const handleModelLoaded = useCallback(() => setModelLoaded(true), []);

  // 检测设备性能
  useEffect(() => {
    const settings = JSON.parse(localStorage.getItem("rerun_settings") || "{}");
    if (settings.quality === "low") {
      setPerfTier("low");
    }
    const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
    if (isMobile) setPerfTier("low");
  }, []);

  // 切换神兽时重置加载状态并预加载对应 GLB（关闭 Draco/Meshopt 解码，与实际加载保持一致）
  useEffect(() => {
    setModelLoaded(false);
    setLoadError(false);
    try {
      useGLTF.preload(assetUrl(`models/${selected.key}.glb`), false, true);
    } catch {
      // 已缓存则忽略
    }
  }, [selected.key]);

  // 压缩后单个模型只有 7~10MB，30 秒仍未就绪基本可以判定为真的失败了。
  // （之前 120 秒的上限是为 63~87MB 的未压缩模型准备的。）
  useEffect(() => {
    if (modelLoaded || loadError) return;
    const timeout = setTimeout(() => setLoadError(true), 30000);
    return () => clearTimeout(timeout);
  }, [modelLoaded, loadError, selected.key]);

  // 退出时释放 GLB 缓存（更彻底地清理，避免大体积模型残留占用显存）
  useEffect(() => {
    return () => {
      // 清理所有预加载的 GLB
      BEASTS.forEach((b) => {
        try {
          useGLTF.clear(assetUrl(`models/${b.key}.glb`));
        } catch {
          // 忽略
        }
      });
      // 额外清理 three.js 全局缓存中的纹理与几何体，避免显存泄漏
      try {
        THREE.Cache.clear();
      } catch {
        // 忽略
      }
    };
  }, []);

  const handleSelect = (idx: number) => {
    if (idx === selectedIdx) return;
    AudioManager.playSfx("select");
    // 立即进入加载态，避免切换瞬间露出尚未挂载模型的空 Canvas
    setModelLoaded(false);
    setSelectedIdx(idx);
  };

  const handleHover = () => {
    AudioManager.playSfx("hover");
  };

  return (
    <div className="fixed inset-0 overflow-hidden bg-[#0a0806] select-none">
      {/* 背景层 - 雾效 + 粒子 */}
      <div className="absolute inset-0 z-0">
        <div className="absolute inset-0" style={{
          background: "radial-gradient(ellipse at 50% 40%, rgba(20,16,12,0.6) 0%, #0a0806 70%)"
        }} />
        <div className="absolute inset-0 opacity-30" style={{
          backgroundImage: "url('/textures/parchment.jpg')",
          mixBlendMode: "overlay",
        }} />
      </div>

      {/* 浮动粒子 */}
      {[...Array(8)].map((_, i) => (
        <div
          key={i}
          className="absolute rounded-full pointer-events-none"
          style={{
            left: `${15 + i * 10}%`,
            top: `${20 + (i % 4) * 20}%`,
            width: "3px",
            height: "3px",
            background: selected.glow,
            opacity: 0.15,
            animation: `float-particle ${8 + i * 2}s ease-in-out infinite`,
            animationDelay: `${i * 0.8}s`,
          }}
        />
      ))}

      {/* 顶部标题栏 */}
      <div className="absolute top-0 left-0 right-0 z-30 flex items-center justify-between px-8 py-5">
        <button
          onClick={() => { AudioManager.playSfx("click"); onBack(); }}
          className="group flex items-center gap-2 text-[#8a7a5c] hover:text-[#c9b896] transition-colors"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
          <span className="font-cinzel text-sm tracking-widest">RETURN</span>
        </button>

        <div className="text-center">
          <div className="font-caoshu text-3xl text-[#c9b896] tracking-wider">灵宠图鉴</div>
          <div className="font-cinzel text-[10px] text-[#6a5418] tracking-[0.5em] mt-1">COMPANIONS · GRIMOIRE</div>
        </div>

        <div className="w-20" />
      </div>

      {/* 3D 召唤空间 - 中央 */}
      <div className="absolute inset-0 z-10 flex items-center justify-center">
        <div className="relative" style={{ width: "100%", height: "100%" }}>
          {loadError ? (
            <ErrorFallback beastName={selected.name} />
          ) : (
            <>
              <ModelErrorBoundary
                key={selected.key}
                fallback={<ErrorFallback beastName={selected.name} />}
                onError={() => setLoadError(true)}
              >
                <BeastCanvas
                  modelKey={selected.key}
                  perfTier={perfTier}
                  onLoaded={handleModelLoaded}
                />
              </ModelErrorBoundary>

              {/* 加载遮罩 - 模型流式下载期间显示不定式进度，加载完成自动淡出 */}
              <AnimatePresence>
                {!modelLoaded && (
                  <motion.div
                    key={`loading-${selected.key}`}
                    initial={{ opacity: 1 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.4 }}
                    className="absolute inset-0"
                  >
                    <LoadingProgress beastName={selected.name} />
                  </motion.div>
                )}
              </AnimatePresence>
            </>
          )}

          {/* 3D 空间装饰 - 召唤阵 */}
          {modelLoaded && !loadError && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.08 }}
              transition={{ delay: 0.5, duration: 1 }}
              className="absolute bottom-[15%] left-1/2 -translate-x-1/2 pointer-events-none"
            >
              <svg width="300" height="150" viewBox="0 0 300 150" style={{ color: selected.color }}>
                <ellipse cx="150" cy="75" rx="140" ry="60" fill="none" stroke="currentColor" strokeWidth="0.5" />
                <ellipse cx="150" cy="75" rx="100" ry="40" fill="none" stroke="currentColor" strokeWidth="0.5" strokeDasharray="3 2" />
                <ellipse cx="150" cy="75" rx="60" ry="20" fill="none" stroke="currentColor" strokeWidth="0.5" />
              </svg>
            </motion.div>
          )}
        </div>
      </div>

      {/* 右侧信息面板 - 契约档案 */}
      <AnimatePresence mode="wait">
        {modelLoaded && !loadError && (
          <motion.div
            key={`info-${selected.key}`}
            initial={{ x: 60, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 60, opacity: 0 }}
            transition={{ type: "spring", stiffness: 220, damping: 24, delay: 0.3 }}
            className="absolute right-6 top-1/2 -translate-y-1/2 z-20 w-[300px]"
          >
            <div
              className="relative p-6 border border-[#3a342a]"
              style={{
                background: "linear-gradient(135deg, rgba(15,12,8,0.95) 0%, rgba(10,8,6,0.9) 100%)",
                backdropFilter: "blur(8px)",
                boxShadow: `0 0 30px ${selected.glow}20, inset 0 0 40px rgba(0,0,0,0.5)`,
              }}
            >
              {/* 四角装饰 */}
              {["top-0 left-0", "top-0 right-0", "bottom-0 left-0", "bottom-0 right-0"].map((pos) => (
                <div key={pos} className={`absolute ${pos} w-4 h-4 border-[#6a5418]`} style={{
                  borderTop: pos.includes("top") ? "1px solid" : "none",
                  borderBottom: pos.includes("bottom") ? "1px solid" : "none",
                  borderLeft: pos.includes("left") ? "1px solid" : "none",
                  borderRight: pos.includes("right") ? "1px solid" : "none",
                }} />
              ))}

              {/* 分类标签 */}
              <div className="flex items-center gap-2 mb-3">
                <div className="w-2 h-2 rounded-full" style={{ background: selected.color, boxShadow: `0 0 8px ${selected.glow}` }} />
                <span className="font-cinzel text-[9px] tracking-[0.4em] text-[#6a5418]">CONTRACT NO.{String(selectedIdx + 1).padStart(2, "0")}</span>
              </div>

              {/* 名称 */}
              <div className="font-caoshu text-4xl mb-1" style={{ color: selected.color, textShadow: `0 0 20px ${selected.glow}60` }}>
                {selected.name}
              </div>
              <div className="font-cormorant text-sm text-[#8a7a5c] italic mb-4">{selected.title}</div>

              {/* 元素标签 */}
              <div className="inline-block px-3 py-1 border border-[#3a342a] mb-4">
                <span className="font-cinzel text-[10px] text-[#c9b896] tracking-widest">{selected.element}</span>
              </div>

              {/* 描述 */}
              <p className="font-serif-display text-sm text-[#c9b896] leading-relaxed mb-4">
                {selected.desc}
              </p>

              {/* 背景故事 */}
              <div className="border-t border-[#2a241a] pt-3">
                <div className="font-cinzel text-[9px] tracking-[0.3em] text-[#4a4030] mb-2">LORE</div>
                <p className="font-serif-display text-xs text-[#6a5418] leading-relaxed italic">
                  {selected.lore}
                </p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 底部神兽切换栏 - 灵宠列表 */}
      <div className="absolute bottom-0 left-0 right-0 z-20 px-8 py-5">
        <div
          className="flex items-center justify-center gap-2 overflow-x-auto pb-2"
          style={{ scrollbarWidth: "none" }}
        >
          {BEASTS.map((beast, i) => {
            const isActive = i === selectedIdx;
            return (
              <button
                key={beast.key}
                onClick={() => handleSelect(i)}
                onMouseEnter={handleHover}
                className="group relative flex-shrink-0 transition-all duration-300"
                style={{
                  width: isActive ? "64px" : "44px",
                  height: isActive ? "64px" : "44px",
                }}
              >
                <div
                  className="w-full h-full rounded-full border flex items-center justify-center transition-all"
                  style={{
                    borderColor: isActive ? beast.color : "#3a342a",
                    background: isActive
                      ? `radial-gradient(circle, ${beast.glow}30 0%, transparent 80%)`
                      : "rgba(10,8,6,0.6)",
                    boxShadow: isActive ? `0 0 15px ${beast.glow}50` : "none",
                    backdropFilter: "blur(4px)",
                  }}
                >
                  <span
                    className="font-caoshu transition-all"
                    style={{
                      fontSize: isActive ? "18px" : "13px",
                      color: isActive ? beast.color : "#6a5418",
                      textShadow: isActive ? `0 0 8px ${beast.glow}` : "none",
                    }}
                  >
                    {beast.name[0]}
                  </span>
                </div>
                {/* 激活指示器 */}
                {isActive && (
                  <motion.div
                    layoutId="active-beast"
                    className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full"
                    style={{ background: beast.color }}
                  />
                )}
              </button>
            );
          })}
        </div>

        {/* 操作提示 */}
        <div className="text-center mt-2">
          <span className="font-cinzel text-[9px] text-[#4a4030] tracking-[0.3em]">
            DRAG TO ROTATE · SCROLL TO ZOOM
          </span>
        </div>
      </div>
    </div>
  );
}

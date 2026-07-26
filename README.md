# 重叙日（RecountDay）

> 暗黑哥特风 · 隐藏阵营卡牌对战游戏

四名叙事者围坐，各自被秘密分配一个势力。牌桌上比的不只是谁先把对手的「篇幅」打到归零 ——
每个势力都有一条只有自己知道的胜利路径：有的要杀，有的要活，有的要求你从头到尾一件畸变物都别装。

---

## 运行

```bash
npm install
npm run dev        # 开发服务器
npm run build      # 生产构建 → dist/
npm run preview    # 预览构建产物
npm test           # 单元 + 回归 + 全自动对局测试
npx tsc --noEmit   # 类型检查
```

构建产物 `dist/index.html` 会把 JS/CSS 内联成单文件，`public/` 下的图片、音频、模型按原样拷贝过去。
`vite.config.ts` 里 `base: "./"`，所有资源都通过 `src/utils/assetUrl.ts` 解析，
因此部署在根路径或任意子路径（GitHub Pages、`/raw/...` 之类）都能正确加载。

> 注意：直接用 `file://` 打开 `dist/index.html` 会因为浏览器的跨域限制拿不到音频，
> 需要用任意静态服务器托管，例如 `npx serve dist` 或 `python3 -m http.server -d dist`。

---

## 目录

```
src/
├── data/          卡牌、角色、势力、星球坐标等静态数据
├── engine/        纯逻辑：类型、距离/射程、胜利条件判定
├── store/         zustand + immer 状态机
│   ├── turnFlow     回合流程（恢复→审阅→书写→归档）
│   ├── cardEffects  每张牌的结算
│   ├── skills       48 个角色技能
│   ├── damage       伤害/治疗/淘汰
│   ├── ai           AI 决策引擎（评分制）
│   └── resolvers    需要玩家响应的异步窗口
├── audio/         采样音效引擎 + 战斗音频反应层
├── components/    全部界面
└── __tests__/     单元 / 回归 / 全自动对局
```

---

## 核心机制

**篇幅**既是血也是蓝：受击扣减，施展技能同样消耗，归零即被归档出局。
回合结束时手牌上限等于当前篇幅 —— 血越少，能握的牌也越少。

**叙事等级**随自身回合数推进（一阶→四阶），高阶技能需要对应阶位。

**隐藏势力**：22 个势力，每局随机抽 4 个不同类别秘密分配。达成自己的条件即刻获胜。

**终章**：对局拖过 44 个玩家回合后停止自然恢复，并逐轮加重侵蚀。
这条规则的存在理由很实际 —— 四人局的伤害经济天然趋向僵持
（每人每回合回 1 段，牌堆里 28 张笔伐对 24 张留白，约一半攻击被挡下），
实测出现过 413 个回合仍分不出胜负的对局。终章保证任何一局都会收束。

---

## 平衡性

`src/__tests__/simulation.test.ts` 会让四个 AI 互相打完整局，用来守住几条不变量：
对局必然终结、牌张守恒、篇幅不越界、已淘汰玩家不再行动。

最近一次 150 局采样：

```
turns   median=26  p90=50  max=53
outcome faction:141  lastAlive:9      全部正常终局
cardLeaks 0
distinctWinningFactions 20/22         （另 2 个在其它采样里出现过）
```

> 牌张守恒这条断言不是形式主义 —— 历史上「叙事回音」会凭空造牌、
> 死于「重叙」判定时判定区会被重复弃置，都是靠它抓出来的。

---

## 音频

`src/audio/AudioManager.ts` 是采样播放器：解码为 AudioBuffer 缓存、声部抢占、
按类型限制并发、动态压缩器防削波，资源缺失时自动回落到合成器占位音。

`src/audio/useGameAudio.ts` 是战斗反应层，**只订阅结构化状态**
（`log.kind`、`phase`、`activeSeat`、`winner`），不做文案字符串匹配 ——
日志文案随时会改，`text.includes("摸了")` 这类判定改一次就静默失效。

---

## 3D 资源

`public/models/` 下 10 个神兽模型经 `gltf-transform` 重新压制：

| | 压缩前 | 压缩后 |
|---|---|---|
| 总体积 | 758 MB | **86 MB** |
| 单个模型 | 63–90 MB | 7–10 MB |
| 显存占用 | ~268 MB/只 | ~67 MB/只 |

方案：`EXT_meshopt_compression` + `KHR_mesh_quantization` + `EXT_texture_webp`（贴图 4096→2048）。
**三角面数没有变化**，只是顶点属性量化 + 贴图压缩。

因此 `useGLTF` 必须开启 meshopt 解码：

```ts
useGLTF(path, /* draco */ false, /* meshopt */ true)
```

重新压制的命令：

```bash
npx @gltf-transform/cli optimize in.glb out.glb \
  --compress meshopt --texture-compress webp --texture-size 2048 --simplify false
```

---

## 需要留意的地方

- **字体**：Cinzel / Cormorant / EB Garamond / Marcellus 都是**纯拉丁字体**。
  给中文加这些 class 不会报错，但会静默回退到 Noto Serif SC。
  想让中文真的变样式，只有 `font-caoshu`（Liu Jian Mao Cao）和 `font-brush`（Ma Shan Zheng）。
  书法体已提到首屏加载，装饰性拉丁字体仍然延后。

- **资源路径**：一律走 `assetUrl()`，不要写 `/images/...` 这种绝对路径 ——
  在子路径部署下会 404，而且报错方式很隐蔽（`useTexture` 抛出后
  Suspense 会永远停在 fallback，表现为"一直加载中"）。

- **装备生效**：读取装备**功能**时要用 `equipAt(p, slot)` 而不是 `p.equips[slot]` ——
  【破邪】会挂 `equips_suppressed` 让畸变物临时失效。纯展示用途才直接读。

- **`src/_unused/`**：存档目录，不参与构建（见其中的 README）。

---

## 已知限制

- 势力星球（`FactionGlobe`）是 canvas 逐帧重绘，低端设备上可在
  `POINT_COUNT` 处下调点数。
- 原始未压缩的 GLB 模型没有随项目分发；若需回退，压缩参数见上方命令。
- 所有验证均为 typecheck / 自动化测试 / 构建产物探测，
  未经真人浏览器逐屏走查。

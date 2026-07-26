/**
 * rng.ts —— 全局可复现随机源
 * ============================================================================
 * 为什么需要它
 * ----------------------------------------------------------------------------
 * 逻辑层原本散着 31 处 `Math.random()`，外加 `data/cards.ts` 里的洗牌。
 * 这意味着**没有任何一局是可以重放的**。直接后果有两个：
 *
 *  1. simulation.test.ts 每次跑 6 局 / 10 局随机对局，断言牌张守恒、篇幅
 *     不越界、回合数落在合理区间。它偶尔会红一次 —— 然后你永远查不出
 *     那一局发生了什么，因为下一次跑就是另一副牌、另一批角色、另一串判定。
 *     一个无法复现的失败等于没有失败：既不能定位，也不能验证修没修好。
 *  2. 玩家侧同样：牌局出了诡异结算，没有任何办法把它还原出来。
 *
 * 设计
 * ----------------------------------------------------------------------------
 * mulberry32：32 位状态、四则运算即可实现，周期 2^32，分布对牌类游戏
 * 完全够用，而且跨平台逐位一致（这点比 xorshift 的有符号移位更省心）。
 *
 * 默认行为与改造前一致：模块加载时用时间戳播一个种子，每次开局都不一样。
 * 只有显式调用 `seedRng(n)` 之后才进入可复现模式。也就是说，
 * 这次改造对正常游玩是**零行为变化**的，只是多了一个可以按下的复现开关。
 * ============================================================================
 */

/** 当前种子。保留下来是为了出问题时能把它打印/上报出去。 */
let seed = (Date.now() ^ 0x9e3779b9) >>> 0;
let state = seed;

/** mulberry32 —— 小、快、跨平台一致 */
function next(): number {
  state = (state + 0x6d2b79f5) >>> 0;
  let t = state;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/**
 * 把随机序列重置到指定种子。
 * 测试里在每局开始前调用；正常游玩不调用。
 */
export function seedRng(n: number): void {
  seed = n >>> 0;
  state = seed;
}

/** 当前种子 —— 断言失败时把它打出来，就能原样重放那一局 */
export function currentSeed(): number {
  return seed;
}

/** `Math.random()` 的等价替代：[0, 1) */
export function rand(): number {
  return next();
}

/** [0, n) 的整数 */
export function randInt(n: number): number {
  return Math.floor(next() * n);
}

/** 从数组里等概率取一个；空数组返回 undefined */
export function pick<T>(arr: readonly T[]): T | undefined {
  if (arr.length === 0) return undefined;
  return arr[randInt(arr.length)];
}

/** Fisher–Yates，返回新数组，不改原数组 */
export function shuffled<T>(arr: readonly T[]): T[] {
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = randInt(i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

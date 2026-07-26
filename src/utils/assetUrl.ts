/**
 * assetUrl.ts —— 静态资源路径解析
 * ============================================================================
 * 项目里大量资源路径写成了以 "/" 开头的绝对路径（/images/... /models/...）。
 * 这在部署到根路径时没问题，但只要挂在子路径下（GitHub Pages 的
 * /<repo>/、或本地预览的 /raw/... 之类），所有图片、模型、音频就会 404。
 *
 * 这里统一改为基于 Vite 的 BASE_URL 解析，无论部署在哪一层目录都能命中。
 * ============================================================================
 */
export function assetUrl(rel: string): string {
  const base = (import.meta.env?.BASE_URL ?? "/") || "/";
  const b = base.endsWith("/") ? base : base + "/";
  return b + String(rel).replace(/^\/+/, "");
}

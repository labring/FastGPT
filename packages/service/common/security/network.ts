/**
 * 网络出站安全校验工具集。
 *
 * 这里集中导出 URL 字符串层面的轻量校验,供 serverRequest/plusRequest 等
 * 内部 helper 在调用前快速短路。更复杂的 SSRF 校验(协议白名单 + DNS +
 * 内网/metadata 拦截)请使用 `common/system/utils.ts` 中的 `checkUrlSafety`。
 */

/**
 * 判断给定字符串是否是"绝对 URL"。
 * 命中条件:
 *  - 以 `scheme://` 形式开头(http://、https://、ws://、ftp:// ...)
 *  - 以 `//` 开头(protocol-relative,会被 axios/new URL 当成绝对 URL 处理)
 *
 * 校验严格的目的是阻止 helper 调用方意外把绝对 URL 传进来覆盖 baseURL,
 * 即使该 helper 已经显式关闭 SSRF 拦截器也不会形成 SSRF。
 */
export const isAbsoluteUrl = (url: unknown): boolean => {
  if (typeof url !== 'string') return false;
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(url) || url.startsWith('//');
};

/**
 * 强制要求传入的 URL 是相对路径,否则 reject。
 * 适用于"按设计只访问内部固定 baseURL"的内部 helper。
 *
 * 例: serverRequest(本机 NextJS API)、plusRequest(商业版 Pro 服务)。
 */
export const assertRelativePath = (url: unknown, helperName = 'request'): void => {
  if (typeof url !== 'string' || isAbsoluteUrl(url)) {
    throw new Error(`${helperName} only accepts relative paths, absolute URLs are not allowed`);
  }
};

/**
 * 在用 `new URL(path, base)` 构造目标 URL 后,强制校验最终 origin 与 base 一致。
 *
 * 防御 "protocol-relative URL" 主机覆盖:
 *  - `new URL('//169.254.169.254/foo', 'http://internal:3000')` → host 被替换
 *  - NextJS catch-all `[...path]` 中,`/api//evil/...` 会被拆成 `['', 'evil', ...]`,
 *    join 回去就构造出 `//evil/...` 这种 protocol-relative path
 *
 * 用法:
 *   const target = buildSameOriginUrl(requestPath, baseUrl);  // 抛错 = 攻击
 */
export const buildSameOriginUrl = (path: string, base: string): URL => {
  const baseUrl = new URL(base);
  const target = new URL(path, baseUrl);
  if (target.origin !== baseUrl.origin) {
    throw new Error(
      `Refused: target URL origin (${target.origin}) does not match base (${baseUrl.origin})`
    );
  }
  return target;
};

import { CliArgumentError, CliAuthError } from './errors';

export const DEFAULT_FASTGPT_BASE_URL = 'https://cloud.fastgpt.cn/api';

export const FASTGPT_BASE_URL_PRESETS = [
  {
    value: 'http://localhost:3000',
    label: 'http://localhost:3000',
    hint: 'Local development'
  },
  {
    value: 'https://cloud.fastgpt.cn',
    label: 'https://cloud.fastgpt.cn',
    hint: 'FastGPT Cloud (CN)'
  },
  {
    value: 'https://cloud.fastgpt.io',
    label: 'https://cloud.fastgpt.io',
    hint: 'FastGPT Cloud (Global)'
  }
] as const;

/**
 * 判断主机名是否属于本机回环地址。
 */
export function isLoopbackHost(hostname: string): boolean {
  const normalized = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  return (
    normalized === 'localhost' ||
    normalized === '127.0.0.1' ||
    normalized === '::1' ||
    normalized.endsWith('.localhost')
  );
}

/**
 * 规范化 FastGPT API Base URL 并校验传输安全策略：
 * - 非回环地址默认拒绝明文 `http://`，除非显式允许 `allowInsecureHttp`；
 * - 统一补全 `/api` 路径前缀以匹配 OpenAPI `servers: [{ url: '/api' }]`。
 */
export function normalizeBaseUrl(
  rawUrl: string,
  options: { allowInsecureHttp?: boolean } = {}
): string {
  const trimmed = rawUrl.trim();
  if (!trimmed) {
    throw new CliArgumentError('Base URL cannot be empty.');
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new CliArgumentError(`Invalid Base URL: ${rawUrl}`);
  }

  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new CliAuthError({
      code: 'TLS_OR_URL_INVALID',
      message: `Unsupported URL protocol "${parsed.protocol}". Only https:// (or http:// for localhost) is supported.`
    });
  }

  if (parsed.username || parsed.password) {
    throw new CliAuthError({
      code: 'TLS_OR_URL_INVALID',
      message: 'Base URL must not embed credentials in userinfo.'
    });
  }

  if (parsed.search || parsed.hash) {
    throw new CliArgumentError(
      'Base URL must not contain query parameters or fragments.',
      { baseUrl: rawUrl },
      'Pass the root FastGPT URL such as https://cloud.fastgpt.cn or https://cloud.fastgpt.cn/api'
    );
  }

  if (
    parsed.protocol === 'http:' &&
    !isLoopbackHost(parsed.hostname) &&
    options.allowInsecureHttp !== true
  ) {
    throw new CliAuthError({
      code: 'TLS_OR_URL_INVALID',
      message: `Refusing insecure http:// base URL for non-local host "${parsed.hostname}".`,
      hint: 'Switch to https:// or pass --allow-insecure-http for a trusted private deployment.'
    });
  }

  const cleanPath = parsed.pathname.replace(/\/+$/, '');
  const apiPath = cleanPath.endsWith('/api') ? cleanPath : `${cleanPath}/api`;
  return `${parsed.origin}${apiPath}`;
}

/**
 * 将服务端返回的站内相对资源路径（如 `/api/system/img/...` 或 `/imgs/...`）拼接为可直接访问的完整 URL；
 * 若服务端部署在子路径（如 `https://example.com/fastgpt/api`），会去掉末尾 `/api` 后拼接以保留子路径前缀。
 */
export function resolveServerAssetUrl({
  baseUrl,
  assetPath
}: {
  baseUrl: string;
  assetPath?: string | null;
}): string | null | undefined {
  if (assetPath === undefined || assetPath === null) {
    return assetPath;
  }
  const trimmed = assetPath.trim();
  if (!trimmed) {
    return trimmed;
  }
  if (/^(https?:|data:|blob:)/i.test(trimmed)) {
    return trimmed;
  }
  const siteBase = baseUrl.replace(/\/+$/, '').replace(/\/api$/, '');
  if (trimmed.startsWith('/')) {
    return `${siteBase}${trimmed}`;
  }
  return `${siteBase}/${trimmed}`;
}

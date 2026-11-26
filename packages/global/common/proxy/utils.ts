import { ServerConfigError } from '../error/utils';

export const PROXY_AUTHORIZATION_HEADER = 'Proxy-Authorization';

export const SUPPORTED_HTTP_PROXY_PROTOCOLS = new Set(['http:', 'https:']);
export const SUPPORTED_SOCKS5_PROXY_PROTOCOLS = new Set(['socks:', 'socks5:', 'socks5h:']);

const getEffectiveUrlPort = (url: URL): number =>
  url.port ? Number(url.port) : url.protocol === 'https:' ? 443 : 80;

/**
 * 构造不含代理 URL/凭据细节的出站代理配置错误。
 *
 * Node 的 URL 解析异常（TypeError [ERR_INVALID_URL]）会在可枚举属性 `input` 中保留原始代理 URL
 *（可能含 username/password）；直接透传为 `cause` 会被 OTel 日志序列化器递归输出导致凭据泄露。
 * 这里仅保留安全的错误码（如 `ERR_INVALID_URL`）用于排障，绝不附带原始错误对象或凭据内容。
 */
export const createOutboundProxyConfigError = (
  message: string,
  error?: unknown
): ServerConfigError => {
  const code =
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof (error as { code?: unknown }).code === 'string' &&
    /^[A-Z0-9_]+$/.test((error as { code: string }).code)
      ? (error as { code: string }).code
      : undefined;

  const configError = new ServerConfigError(message);
  if (code) {
    Object.assign(configError, { code });
  }
  return configError;
};

/**
 * 解析并校验受支持的出站代理 URL（无传输层依赖，供服务端与代码沙箱共用）。
 *
 * - 统一支持 http: / https: / socks: / socks5: / socks5h:，全部采用代理侧 DNS 解析语义；
 * - 建连前预校验代理 host 非空及 username/password 百分号编码合法性，避免代理库在建连后抛出未脱敏的 URIError；
 * - 所有非法配置统一抛出不含原始 URL 与凭据的 ServerConfigError，保留 5xx 告警。
 */
export const parseSupportedOutboundProxyUrl = (proxyUrl: string | URL): URL => {
  const parsed = (() => {
    try {
      return proxyUrl instanceof URL ? new URL(proxyUrl.href) : new URL(proxyUrl);
    } catch (error) {
      throw createOutboundProxyConfigError('Invalid outbound proxy URL configuration', error);
    }
  })();

  if (
    !SUPPORTED_HTTP_PROXY_PROTOCOLS.has(parsed.protocol) &&
    !SUPPORTED_SOCKS5_PROXY_PROTOCOLS.has(parsed.protocol)
  ) {
    throw new ServerConfigError(
      `Unsupported outbound proxy protocol: ${parsed.protocol} (supported: http, https, socks, socks5, socks5h)`
    );
  }

  if (!parsed.hostname) {
    throw createOutboundProxyConfigError('Invalid outbound proxy URL configuration');
  }

  try {
    if (parsed.username) {
      decodeURIComponent(parsed.username);
    }
    if (parsed.password) {
      decodeURIComponent(parsed.password);
    }
  } catch (error) {
    throw createOutboundProxyConfigError('Invalid outbound proxy credentials configuration', error);
  }

  return parsed;
};

/**
 * 基于已通过 SSRF 预检的 targetUrl 构造 HTTP 转发代理目标 URI，并校验最终 scheme/host/port 未偏离预检目标。
 *
 * http-proxy-agent 默认执行 `new URL(req.path, `${protocol}//${host}`)`，当 req.path 以 `//` 或 `/\` 开头时
 * 会被 WHATWG URL 重新解析为新 authority，导致实际转发目标偏离 SSRF 预检。
 * 这里强制从预检 targetUrl.origin 构造并二次断言最终 scheme/hostname/port 与空凭据。
 */
export const resolveValidatedHttpForwardTargetUri = ({
  targetUrl,
  requestPath
}: {
  targetUrl: URL;
  requestPath?: string;
}): string => {
  if (targetUrl.protocol !== 'http:') {
    throw new Error(`Unsupported HTTP forward proxy target protocol: ${targetUrl.protocol}`);
  }

  const sanitizedBase = new URL(targetUrl.href);
  sanitizedBase.username = '';
  sanitizedBase.password = '';
  sanitizedBase.hash = '';
  const targetPort = getEffectiveUrlPort(sanitizedBase);

  const candidate = (() => {
    if (!requestPath) {
      return sanitizedBase.href;
    }
    if (/[\u0000-\u001f\u007f]/.test(requestPath)) {
      throw new Error('Invalid HTTP forward proxy target URL');
    }
    if (/^[a-zA-Z][a-zA-Z\d+\-.]*:/.test(requestPath)) {
      return requestPath;
    }
    const pathWithSlash = requestPath.startsWith('/') ? requestPath : `/${requestPath}`;
    return `${sanitizedBase.origin}${pathWithSlash}`;
  })();

  let forwarded: URL;
  try {
    forwarded = new URL(candidate);
  } catch {
    throw new Error('Invalid HTTP forward proxy target URL');
  }
  forwarded.hash = '';

  if (
    forwarded.protocol !== sanitizedBase.protocol ||
    forwarded.hostname !== sanitizedBase.hostname ||
    getEffectiveUrlPort(forwarded) !== targetPort ||
    forwarded.username !== '' ||
    forwarded.password !== ''
  ) {
    throw new Error('HTTP forward proxy target mismatch');
  }

  return forwarded.href;
};

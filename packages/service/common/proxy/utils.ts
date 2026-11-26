import type http from 'http';
import { ServerConfigError } from '@fastgpt/global/common/error/utils';
import { ProxyAgent as NodeProxyAgent } from 'proxy-agent';
import { ProxyAgent as UndiciProxyAgent } from 'undici';

export const PROXY_AUTHORIZATION_HEADER = 'Proxy-Authorization';

const SUPPORTED_HTTP_PROXY_PROTOCOLS = new Set(['http:', 'https:']);
const SUPPORTED_SOCKS5_PROXY_PROTOCOLS = new Set(['socks:', 'socks5:', 'socks5h:']);

/**
 * 构造不含代理 URL/凭据细节的出站代理配置错误。
 *
 * Node 的 URL 解析异常（TypeError [ERR_INVALID_URL]）会在可枚举属性 `input` 中保留原始代理 URL
 *（可能含 username/password）；直接透传为 `cause` 会被 OTel 日志序列化器递归输出导致凭据泄露。
 * 这里仅保留安全的错误码（如 `ERR_INVALID_URL`）用于排障，绝不附带原始 URL 错误对象。
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
 * 解析并校验受支持的出站代理 URL。
 *
 * 统一支持 http: / https: / socks: / socks5: / socks5h:，且全部采用代理侧 DNS 解析语义，
 * 保证共享 Axios、MCP、微信个人号及团队模型自定义端点在无目标 DNS 的隔离环境中可使用同一代理配置。
 * 实例出站代理配置错误属于服务端故障，统一抛出 ServerConfigError 保留 5xx 告警。
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
  return parsed;
};

/**
 * 为 undici 客户端构造统一的出站 ProxyAgent。
 *
 * undici 的 Socks5ProxyAgent 始终由代理侧解析目标域名，但仅接受 socks:/socks5: 协议名；
 * 这里将 socks5h: 归一化为 socks5:，使各端对 socks5:// 与 socks5h:// 保持一致语义。
 */
export const createUndiciOutboundProxyAgent = (proxyUrl: string | URL): UndiciProxyAgent => {
  const parsed = parseSupportedOutboundProxyUrl(proxyUrl);
  const normalizedUri =
    parsed.protocol === 'socks5h:' ? parsed.href.replace(/^socks5h:/i, 'socks5:') : parsed.href;
  return new UndiciProxyAgent({ uri: normalizedUri, proxyTunnel: false });
};

/**
 * 为 Node http/https 客户端（共享 Axios）构造统一的出站代理 Agent。
 *
 * 直接复用原生 proxy-agent：
 * - 将 socks5: 归一化为 socks5h:，使 socks-proxy-agent 统一由代理侧解析目标域名，不触发本机 DNS；
 * - 代理认证头通过 headers 选项仅注入代理建连/转发阶段，避免泄露到目标站点或直连跳转。
 */
export const createNodeOutboundProxyAgent = ({
  proxyUrl,
  rejectUnauthorized,
  proxyAuthorization
}: {
  proxyUrl: string | URL;
  rejectUnauthorized: boolean;
  proxyAuthorization?: string;
}): http.Agent => {
  const parsed = parseSupportedOutboundProxyUrl(proxyUrl);
  // socks-proxy-agent 对 socks5:// 会先走本机 dns.lookup，仅 socks5h:// 与 socks:// 委托代理侧解析域名。
  const normalizedUri =
    parsed.protocol === 'socks5:' ? parsed.href.replace(/^socks5:/i, 'socks5h:') : parsed.href;

  return new NodeProxyAgent({
    getProxyForUrl: () => normalizedUri,
    rejectUnauthorized,
    ...(proxyAuthorization
      ? { headers: () => ({ [PROXY_AUTHORIZATION_HEADER]: proxyAuthorization }) }
      : {})
  });
};

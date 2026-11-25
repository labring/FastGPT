import { ProxyAgent } from 'undici';

const SUPPORTED_HTTP_PROXY_PROTOCOLS = new Set(['http:', 'https:']);
const SUPPORTED_SOCKS5_PROXY_PROTOCOLS = new Set(['socks:', 'socks5:', 'socks5h:']);

export const isHttpProxyProtocol = (protocol: string): boolean =>
  SUPPORTED_HTTP_PROXY_PROTOCOLS.has(protocol);

export const isSocks5ProxyProtocol = (protocol: string): boolean =>
  SUPPORTED_SOCKS5_PROXY_PROTOCOLS.has(protocol);

/**
 * 解析并校验受支持的出站代理 URL。
 *
 * 统一支持 http: / https: / socks: / socks5: / socks5h:，且全部采用代理侧 DNS 解析语义，
 * 保证共享 Axios、MCP 与微信个人号在无目标 DNS 的隔离环境中可使用同一代理配置。
 */
export const parseSupportedOutboundProxyUrl = (proxyUrl: string | URL): URL => {
  const parsed = proxyUrl instanceof URL ? new URL(proxyUrl.href) : new URL(proxyUrl);
  if (!isHttpProxyProtocol(parsed.protocol) && !isSocks5ProxyProtocol(parsed.protocol)) {
    throw new Error(
      `Unsupported outbound proxy protocol: ${parsed.protocol} (supported: http, https, socks, socks5, socks5h)`
    );
  }
  return parsed;
};

/**
 * 为 undici 客户端构造统一的出站 ProxyAgent。
 *
 * undici 的 Socks5ProxyAgent 始终由代理侧解析目标域名，但仅接受 socks:/socks5: 协议名；
 * 这里将 socks5h: 归一化为 socks5:，使三端对 socks5:// 与 socks5h:// 保持一致语义。
 */
export const createUndiciOutboundProxyAgent = (proxyUrl: string | URL): ProxyAgent => {
  const parsed = parseSupportedOutboundProxyUrl(proxyUrl);
  const normalizedUri =
    parsed.protocol === 'socks5h:' ? parsed.href.replace(/^socks5h:/i, 'socks5:') : parsed.href;
  return new ProxyAgent({ uri: normalizedUri, proxyTunnel: false });
};

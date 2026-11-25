import type http from 'http';
import { ProxyAgent as NodeProxyAgent } from 'proxy-agent';
import { ProxyAgent as UndiciProxyAgent } from 'undici';

export const PROXY_AUTHORIZATION_HEADER = 'Proxy-Authorization';

const SUPPORTED_HTTP_PROXY_PROTOCOLS = new Set(['http:', 'https:']);
const SUPPORTED_SOCKS5_PROXY_PROTOCOLS = new Set(['socks:', 'socks5:', 'socks5h:']);

/**
 * 解析并校验受支持的出站代理 URL。
 *
 * 统一支持 http: / https: / socks: / socks5: / socks5h:，且全部采用代理侧 DNS 解析语义，
 * 保证共享 Axios、MCP、微信个人号及团队模型自定义端点在无目标 DNS 的隔离环境中可使用同一代理配置。
 */
export const parseSupportedOutboundProxyUrl = (proxyUrl: string | URL): URL => {
  const parsed = proxyUrl instanceof URL ? new URL(proxyUrl.href) : new URL(proxyUrl);
  if (
    !SUPPORTED_HTTP_PROXY_PROTOCOLS.has(parsed.protocol) &&
    !SUPPORTED_SOCKS5_PROXY_PROTOCOLS.has(parsed.protocol)
  ) {
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

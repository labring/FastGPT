import type http from 'http';
import { isIP } from 'net';
import { HttpProxyAgent, type HttpProxyAgentOptions } from 'http-proxy-agent';
import { HttpsProxyAgent, type HttpsProxyAgentOptions } from 'https-proxy-agent';
import { SocksProxyAgent } from 'socks-proxy-agent';
import { ProxyAgent as UndiciProxyAgent } from 'undici';
import {
  parseSupportedOutboundProxyUrl,
  PROXY_AUTHORIZATION_HEADER,
  resolveValidatedHttpForwardTargetUri,
  SUPPORTED_SOCKS5_PROXY_PROTOCOLS
} from '@fastgpt/global/common/proxy/utils';

type HttpProxySetRequestPropsArgs = Parameters<HttpProxyAgent<string>['setRequestProps']>;
type HttpsProxyConnectArgs = Parameters<HttpsProxyAgent<string>['connect']>;
type SocksProxyConnectArgs = Parameters<SocksProxyAgent['connect']>;

const buildProxyTlsOptions = (proxyUrl: URL): { rejectUnauthorized: true; servername?: string } => {
  const proxyHost = proxyUrl.hostname.replace(/^\[|\]$/g, '');
  return {
    // 代理层 TLS 证书始终严格校验，并为域名形式的 https:// 代理补齐 SNI。
    rejectUnauthorized: true,
    ...(proxyUrl.protocol === 'https:' && !isIP(proxyHost) ? { servername: proxyHost } : {})
  };
};

/**
 * 面向明文 HTTP 目标的转发代理 Agent：
 * 仅覆写 setRequestProps，基于已通过 SSRF 预检的 targetUrl 锁定 Host 与绝对转发 URI，
 * 阻断 `//127.0.0.1`、`/\\...` 路径二次解析绕过；不触碰 Node 私有 _header。
 */
class PinnedHttpProxyAgent extends HttpProxyAgent<string> {
  private readonly targetUrl: URL;

  constructor(proxyUrl: URL, targetUrl: URL, opts?: HttpProxyAgentOptions<string>) {
    super(proxyUrl, {
      ...opts,
      ...buildProxyTlsOptions(proxyUrl)
    });
    this.targetUrl = targetUrl;
  }

  override setRequestProps(
    req: HttpProxySetRequestPropsArgs[0],
    opts: HttpProxySetRequestPropsArgs[1]
  ): void {
    const validatedHref = resolveValidatedHttpForwardTargetUri({
      targetUrl: this.targetUrl,
      requestPath: req.path
    });
    const targetPort = this.targetUrl.port ? Number(this.targetUrl.port) : 80;
    req.setHeader('host', this.targetUrl.host);
    req.path = validatedHref;
    super.setRequestProps(req, {
      ...opts,
      secureEndpoint: false,
      port: targetPort
    });
    req.path = resolveValidatedHttpForwardTargetUri({
      targetUrl: this.targetUrl,
      requestPath: req.path
    });
  }
}

/**
 * 面向 HTTPS 目标的双层 TLS 代理 Agent：
 * - 外层连接 https:// 代理服务器时始终严格校验证书（HttpsProxyAgent 内置域名 SNI）；
 * - 内层隧道连接目标站点时再应用调用方传入的 targetRejectUnauthorized。
 */
class TwoLayerHttpsProxyAgent extends HttpsProxyAgent<string> {
  private readonly targetRejectUnauthorized: boolean;

  constructor(
    proxyUrl: URL,
    opts: HttpsProxyAgentOptions<string> & { targetRejectUnauthorized: boolean }
  ) {
    const { targetRejectUnauthorized, ...rest } = opts;
    super(proxyUrl, {
      ...rest,
      rejectUnauthorized: true
    });
    this.targetRejectUnauthorized = targetRejectUnauthorized;
  }

  override async connect(req: HttpsProxyConnectArgs[0], opts: HttpsProxyConnectArgs[1]) {
    return super.connect(
      req,
      opts.secureEndpoint
        ? {
            ...opts,
            rejectUnauthorized: this.targetRejectUnauthorized
          }
        : opts
    );
  }
}

class TwoLayerSocksProxyAgent extends SocksProxyAgent {
  private readonly targetRejectUnauthorized: boolean;

  constructor(proxyUrl: URL, targetRejectUnauthorized: boolean) {
    // socks-proxy-agent 对 socks5:// 会先走本机 dns.lookup，仅 socks5h:// 与 socks:// 委托代理侧解析域名。
    const normalizedUri =
      proxyUrl.protocol === 'socks5:'
        ? proxyUrl.href.replace(/^socks5:/i, 'socks5h:')
        : proxyUrl.href;
    super(normalizedUri);
    this.targetRejectUnauthorized = targetRejectUnauthorized;
  }

  override async connect(req: SocksProxyConnectArgs[0], opts: SocksProxyConnectArgs[1]) {
    return super.connect(
      req,
      opts.secureEndpoint
        ? {
            ...opts,
            rejectUnauthorized: this.targetRejectUnauthorized
          }
        : opts
    );
  }
}

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
 * 为 Node http/https 客户端（共享 Axios 与 crawlWebsite）构造统一的单跳出站代理 Agent。
 *
 * 直接组合基础代理 Agent 以精确隔离两层 TLS 与转发目标校验：
 * - SOCKS5 统一将 socks5: 归一化为 socks5h:，由代理侧解析目标域名，不触发本机 DNS；
 * - 明文 HTTP 目标使用 PinnedHttpProxyAgent 锁定已预检的转发目标并在 https:// 代理上发送 SNI；
 * - HTTPS 目标使用 TwoLayerHttpsProxyAgent，保持代理层 TLS 严格校验、仅对目标站点应用 rejectUnauthorized；
 * - 代理认证头通过 headers 选项仅注入代理建连/转发阶段，避免泄露到目标站点或直连跳转。
 */
export const createNodeOutboundProxyAgent = ({
  targetUrl,
  proxyUrl,
  rejectUnauthorized,
  proxyAuthorization
}: {
  targetUrl: URL;
  proxyUrl: string | URL;
  rejectUnauthorized: boolean;
  proxyAuthorization?: string;
}): http.Agent => {
  const parsedProxy = parseSupportedOutboundProxyUrl(proxyUrl);

  if (SUPPORTED_SOCKS5_PROXY_PROTOCOLS.has(parsedProxy.protocol)) {
    return new TwoLayerSocksProxyAgent(parsedProxy, rejectUnauthorized);
  }

  const headersOption = proxyAuthorization
    ? { headers: () => ({ [PROXY_AUTHORIZATION_HEADER]: proxyAuthorization }) }
    : {};

  if (targetUrl.protocol === 'https:') {
    return new TwoLayerHttpsProxyAgent(parsedProxy, {
      ...headersOption,
      targetRejectUnauthorized: rejectUnauthorized
    });
  }

  return new PinnedHttpProxyAgent(parsedProxy, targetUrl, headersOption);
};

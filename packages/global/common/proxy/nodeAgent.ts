import { isIP } from 'net';
import { HttpProxyAgent, type HttpProxyAgentOptions } from 'http-proxy-agent';
import { HttpsProxyAgent, type HttpsProxyAgentOptions } from 'https-proxy-agent';
import { resolveValidatedHttpForwardTargetUri } from './utils';

type HttpProxySetRequestPropsArgs = Parameters<HttpProxyAgent<string>['setRequestProps']>;
type HttpProxyConnectArgs = Parameters<HttpProxyAgent<string>['connect']>;
type HttpsProxyConnectArgs = Parameters<HttpsProxyAgent<string>['connect']>;

/**
 * 构造连接代理服务器自身时的 TLS 选项：
 * - 代理层证书始终严格校验（rejectUnauthorized: true），避免目标站点放宽证书校验时波及代理层 TLS 或泄露代理凭据；
 * - 连接域名形式的 https:// 代理时显式发送代理域名 SNI。
 */
export const buildProxyTlsOptions = (
  proxyUrl: URL
): { rejectUnauthorized: true; servername?: string } => {
  const proxyHost = proxyUrl.hostname.replace(/^\[|\]$/g, '');
  return {
    rejectUnauthorized: true,
    ...(proxyUrl.protocol === 'https:' && !isIP(proxyHost) ? { servername: proxyHost } : {})
  };
};

/**
 * 面向明文 HTTP 目标的转发代理 Agent：
 * 1. 基于已通过 SSRF 预检的 targetUrl 锁定 Host 与绝对转发 URI，防止 http-proxy-agent 二次解析
 *    `//127.0.0.1/...`、`/\\...` 等路径造成转发目标偏离预检；
 * 2. 连接 https:// 代理时始终严格校验证书并按代理域名发送 SNI。
 */
export class PinnedHttpProxyAgent extends HttpProxyAgent<string> {
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

  override async connect(req: HttpProxyConnectArgs[0], opts: HttpProxyConnectArgs[1]) {
    // 对齐 HttpProxyAgent.connect：先清空已缓冲的 _header，再锁定 Host 与目标 URI。
    (req as { _header?: string | null })._header = null;
    req.setHeader('host', this.targetUrl.host);
    req.path = resolveValidatedHttpForwardTargetUri({
      targetUrl: this.targetUrl,
      requestPath: req.path
    });
    return super.connect(req, {
      ...opts,
      secureEndpoint: false
    });
  }
}

/**
 * 面向 HTTPS 目标的双层 TLS 代理 Agent：
 * - 外层连接 https:// 代理服务器时始终严格校验证书（rejectUnauthorized: true）并发送代理 SNI；
 * - 内层隧道连接目标站点时再应用调用方传入的 targetRejectUnauthorized（默认 true）。
 */
export class TwoLayerHttpsProxyAgent extends HttpsProxyAgent<string> {
  private readonly targetRejectUnauthorized: boolean;

  constructor(
    proxyUrl: URL,
    opts: HttpsProxyAgentOptions<string> & { targetRejectUnauthorized?: boolean } = {}
  ) {
    const { targetRejectUnauthorized = true, ...rest } = opts;
    super(proxyUrl, {
      ...rest,
      ...buildProxyTlsOptions(proxyUrl)
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

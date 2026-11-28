import http from 'http';
import https from 'https';
import { isIP } from 'net';
import dns from 'dns/promises';
import { checkServerIdentity } from 'tls';
import {
  parseSupportedOutboundProxyUrl,
  resolveValidatedHttpForwardTargetUri,
  SUPPORTED_HTTP_PROXY_PROTOCOLS,
  SUPPORTED_SOCKS5_PROXY_PROTOCOLS
} from '@fastgpt/global/common/proxy/utils';
import { HttpProxyAgent, type HttpProxyAgentOptions } from 'http-proxy-agent';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { getProxyForUrl } from 'proxy-from-env';
import { SocksProxyAgent } from 'socks-proxy-agent';
import { isInternalAddress, isInternalResolvedIP } from './ipCheck.util';

export type SandboxHttpLimits = {
  maxRequests: number;
  timeoutMs: number;
  maxResponseSize: number;
  maxRequestBodySize: number;
  allowedProtocols?: string[];
};

export type SandboxHttpState = {
  requestCount: number;
};

export type SandboxHttpRequestPayload = {
  url: string;
  method?: string;
  headers?: Record<string, any>;
  body?: any;
  timeout?: number;
  timeoutMs?: number;
};

type HttpProxySetRequestPropsArgs = Parameters<HttpProxyAgent<string>['setRequestProps']>;

const createAbortError = () => {
  const error = new Error('The operation was aborted');
  error.name = 'AbortError';
  return error;
};

/**
 * 面向明文 HTTP 目标的转发代理 Agent：
 * 仅覆写 setRequestProps，基于已通过 SSRF 预检的 targetUrl 锁定 Host 与绝对转发 URI，
 * 阻断 `//127.0.0.1`、`/\\...` 路径二次解析绕过；连接 https:// 代理时严格校验证书并发送 SNI。
 */
class PinnedHttpProxyAgent extends HttpProxyAgent<string> {
  private readonly targetUrl: URL;

  constructor(proxyUrl: URL, targetUrl: URL, opts?: HttpProxyAgentOptions<string>) {
    const proxyHost = proxyUrl.hostname.replace(/^\[|\]$/g, '');
    super(proxyUrl, {
      ...opts,
      rejectUnauthorized: true,
      ...(proxyUrl.protocol === 'https:' && !isIP(proxyHost) ? { servername: proxyHost } : {})
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
 * 按目标协议与代理协议构造单次请求使用的出站代理 Agent（直接组合基础 agent，避免将 pac-proxy-agent 打入单文件 bundle）。
 */
const createSandboxProxyAgent = ({
  targetUrl,
  proxyUrl,
  isHttpsTarget,
  timeout,
  signal
}: {
  targetUrl: URL;
  proxyUrl: URL;
  isHttpsTarget: boolean;
  timeout: number;
  signal: AbortSignal;
}): http.Agent => {
  if (SUPPORTED_SOCKS5_PROXY_PROTOCOLS.has(proxyUrl.protocol)) {
    // socks-proxy-agent 仅对 socks:// 与 socks5h:// 委托代理侧解析目标域名，统一将 socks5:// 归一化为 socks5h://。
    const normalizedUri =
      proxyUrl.protocol === 'socks5:'
        ? proxyUrl.href.replace(/^socks5:/i, 'socks5h:')
        : proxyUrl.href;
    return new SocksProxyAgent(normalizedUri, {
      keepAlive: false,
      timeout
    });
  }

  if (isHttpsTarget) {
    return new HttpsProxyAgent(proxyUrl, {
      keepAlive: false,
      signal,
      rejectUnauthorized: true
    });
  }

  return new PinnedHttpProxyAgent(proxyUrl, targetUrl, {
    keepAlive: false,
    signal
  });
};

/**
 * 直连路径（未配置代理或命中 NO_PROXY）在建连前解析并二次校验目标 IP，防止 DNS rebinding。
 */
const resolveSafeConnectIP = async (normalizedHostname: string): Promise<string> => {
  if (isIP(normalizedHostname)) {
    return normalizedHostname;
  }

  const res = await dns.lookup(normalizedHostname, { all: true, verbatim: true });
  const ips = res.map((r) => r.address);
  if (ips.length === 0 || ips.some((ip) => isInternalResolvedIP(ip))) {
    throw new Error('Request to private network not allowed');
  }
  return ips[0];
};

/**
 * 执行受控 HTTP 请求。
 *
 * 该函数用于 sandbox 代理出网，集中维护协议、SSRF、代理路由、直连 DNS pinning、请求次数、
 * 请求体大小、响应大小和超时限制。调用方应为每次代码执行创建独立 state。
 *
 * 出站代理语义与主服务对齐：
 * - 命中 HTTP_PROXY / HTTPS_PROXY / ALL_PROXY 时保留本机 isInternalAddress() best-effort 预检，
 *   将目标域名解析与出站连接委托给代理层（支持 http/https/socks/socks5/socks5h）；
 * - 直连（含命中 NO_PROXY）时继续执行本机 DNS 解析复检与 IP pinning。
 */
export async function runSandboxHttpRequest({
  payload,
  limits,
  state,
  signal
}: {
  payload: SandboxHttpRequestPayload;
  limits: SandboxHttpLimits;
  state: SandboxHttpState;
  signal?: AbortSignal;
}): Promise<any> {
  signal?.throwIfAborted();
  if (++state.requestCount > limits.maxRequests) {
    throw new Error('Request limit exceeded');
  }

  const allowedProtocols = limits.allowedProtocols ?? ['http:', 'https:'];
  const parsed = new URL(payload.url);
  if (!allowedProtocols.includes(parsed.protocol)) {
    throw new Error('Protocol not allowed');
  }

  const method = (payload.method || 'GET').toUpperCase();
  const headers: Record<string, any> = { ...(payload.headers || {}) };
  const body =
    payload.body != null
      ? typeof payload.body === 'string'
        ? payload.body
        : JSON.stringify(payload.body)
      : null;

  if (body && Buffer.byteLength(body, 'utf8') > limits.maxRequestBodySize) {
    throw new Error('Request body too large');
  }

  if (await isInternalAddress(payload.url)) {
    throw new Error('Request to private network not allowed');
  }
  signal?.throwIfAborted();

  const rawProxyUrl = getProxyForUrl(payload.url);
  const proxyUrl = rawProxyUrl ? parseSupportedOutboundProxyUrl(rawProxyUrl) : undefined;
  const isHttps = parsed.protocol === 'https:';
  const normalizedHostname = parsed.hostname.replace(/^\[|\]$/g, '');
  const connectHostname = proxyUrl
    ? normalizedHostname
    : await resolveSafeConnectIP(normalizedHostname);
  signal?.throwIfAborted();

  const timeout = (() => {
    if (
      typeof payload.timeoutMs === 'number' &&
      Number.isFinite(payload.timeoutMs) &&
      payload.timeoutMs > 0
    ) {
      return Math.min(Math.ceil(payload.timeoutMs), limits.timeoutMs);
    }
    if (
      typeof payload.timeout === 'number' &&
      Number.isFinite(payload.timeout) &&
      payload.timeout > 0
    ) {
      return Math.min(Math.ceil(payload.timeout * 1000), limits.timeoutMs);
    }
    return limits.timeoutMs;
  })();

  const deleteHeaderCaseInsensitive = (targetName: string) => {
    for (const key of Object.keys(headers)) {
      if (key.toLowerCase() === targetName) {
        delete headers[key];
      }
    }
  };
  const hasHeader = (targetName: string) =>
    Object.keys(headers).some((key) => key.toLowerCase() === targetName);

  // 禁止沙箱内用户代码注入或伪造代理认证头。
  deleteHeaderCaseInsensitive('proxy-authorization');

  if (body && !hasHeader('content-type')) {
    headers['Content-Type'] = 'application/json';
  }

  // HttpProxyAgent 会直接根据 Host 头构造转发绝对 URI；对走 HTTP 转发代理的明文请求强制锁定为已校验目标 host，
  // 防止沙箱代码伪造 Host 头绕过 isInternalAddress 并将代理请求导向内网地址。
  const usesHttpForwardProxy =
    proxyUrl !== undefined && !isHttps && SUPPORTED_HTTP_PROXY_PROTOCOLS.has(proxyUrl.protocol);
  if (usesHttpForwardProxy) {
    deleteHeaderCaseInsensitive('host');
    headers['Host'] = parsed.host;
  } else if (!hasHeader('host')) {
    headers['Host'] = parsed.host;
  }

  const requestController = new AbortController();
  let timedOut = false;
  const agent = proxyUrl
    ? createSandboxProxyAgent({
        targetUrl: parsed,
        proxyUrl,
        isHttpsTarget: isHttps,
        timeout,
        signal: requestController.signal
      })
    : undefined;

  const lib = isHttps ? https : http;
  const port = parsed.port ? Number(parsed.port) : isHttps ? 443 : 80;

  return new Promise((resolve, reject) => {
    let settled = false;
    const onCallerAbort = () => {
      const abortError = signal?.reason ?? createAbortError();
      requestController.abort(abortError);
      fail(abortError);
    };
    const timeoutTimer = setTimeout(() => {
      timedOut = true;
      const timeoutError = new Error('Request timeout');
      requestController.abort(timeoutError);
      fail(timeoutError);
    }, timeout);
    timeoutTimer.unref();

    const cleanup = () => {
      clearTimeout(timeoutTimer);
      signal?.removeEventListener('abort', onCallerAbort);
      agent?.destroy();
    };
    const succeed = (result: any) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(result);
    };
    const fail = (error: unknown) => {
      if (settled) return;
      settled = true;
      cleanup();
      if (timedOut) {
        reject(new Error('Request timeout'));
        return;
      }
      if (signal?.aborted) {
        reject(signal.reason ?? createAbortError());
        return;
      }
      reject(error);
    };

    if (signal) {
      if (signal.aborted) {
        onCallerAbort();
        return;
      }
      signal.addEventListener('abort', onCallerAbort, { once: true });
    }

    try {
      const req = lib.request(
        {
          method,
          headers,
          timeout,
          hostname: connectHostname,
          port,
          path: parsed.pathname + parsed.search,
          signal: requestController.signal,
          ...(agent ? { agent } : {}),
          ...(isHttps
            ? {
                ...(isIP(normalizedHostname) ? {} : { servername: normalizedHostname }),
                checkServerIdentity: (
                  _host: string,
                  certificate: Parameters<typeof checkServerIdentity>[1]
                ) => checkServerIdentity(normalizedHostname, certificate)
              }
            : {})
        },
        (res: any) => {
          const chunks: Buffer[] = [];
          let size = 0;
          res.on('data', (chunk: Buffer) => {
            size += chunk.length;
            if (size > limits.maxResponseSize) {
              fail(new Error('Response too large'));
              req.destroy();
              return;
            }
            chunks.push(chunk);
          });
          res.on('end', () => {
            const data = Buffer.concat(chunks).toString('utf-8');
            const h: Record<string, any> = {};
            for (const [k, v] of Object.entries(res.headers)) h[k] = v;
            succeed({ status: res.statusCode, statusText: res.statusMessage, headers: h, data });
          });
          res.on('error', fail);
        }
      );
      req.on('timeout', () => {
        timedOut = true;
        req.destroy();
        fail(new Error('Request timeout'));
      });
      req.on('error', fail);
      if (body) req.write(body);
      req.end();
    } catch (error) {
      fail(error);
    }
  });
}

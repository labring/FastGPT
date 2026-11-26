import http from 'http';
import https from 'https';
import { isIP } from 'net';
import dns from 'dns/promises';
import { checkServerIdentity } from 'tls';
import { ServerConfigError } from '@fastgpt/global/common/error/utils';
import { HttpProxyAgent } from 'http-proxy-agent';
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

const SUPPORTED_HTTP_PROXY_PROTOCOLS = new Set(['http:', 'https:']);
const SUPPORTED_SOCKS5_PROXY_PROTOCOLS = new Set(['socks:', 'socks5:', 'socks5h:']);

const createAbortError = () => {
  const error = new Error('The operation was aborted');
  error.name = 'AbortError';
  return error;
};

/**
 * 构造不含代理 URL/凭据细节的出站代理配置错误，避免把含认证信息的代理地址暴露到异常或日志中。
 */
const createOutboundProxyConfigError = (message: string, error?: unknown): ServerConfigError => {
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
 * 解析并校验受支持的出站代理 URL（对齐 @fastgpt/service 的 http/https/socks/socks5/socks5h 语义）。
 */
const parseSandboxOutboundProxyUrl = (proxyUrl: string): URL => {
  let parsed: URL;
  try {
    parsed = new URL(proxyUrl);
  } catch (error) {
    throw createOutboundProxyConfigError('Invalid outbound proxy URL configuration', error);
  }

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
 * 按目标协议与代理协议构造单次请求使用的出站代理 Agent（直接组合基础 agent，避免将 pac-proxy-agent 打入单文件 bundle）。
 */
const createSandboxProxyAgent = ({
  proxyUrl,
  isHttpsTarget,
  timeout,
  signal
}: {
  proxyUrl: URL;
  isHttpsTarget: boolean;
  timeout: number;
  signal: AbortSignal;
}): http.Agent => {
  if (SUPPORTED_SOCKS5_PROXY_PROTOCOLS.has(proxyUrl.protocol)) {
    // socks-proxy-agent 仅对 socks:// 与 socks5h:// 委托代理侧解析目标域名，这里统一将 socks5:// 归一化为 socks5h://。
    const normalizedUri =
      proxyUrl.protocol === 'socks5:'
        ? proxyUrl.href.replace(/^socks5:/i, 'socks5h:')
        : proxyUrl.href;
    return new SocksProxyAgent(normalizedUri, {
      keepAlive: false,
      timeout,
      socketOptions: { signal }
    });
  }

  if (isHttpsTarget) {
    return new HttpsProxyAgent(proxyUrl, {
      keepAlive: false,
      signal
    });
  }

  return new HttpProxyAgent(proxyUrl, {
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
  const proxyUrl = rawProxyUrl ? parseSandboxOutboundProxyUrl(rawProxyUrl) : undefined;
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
      requestController.abort(signal?.reason ?? createAbortError());
    };
    const timeoutTimer = setTimeout(() => {
      timedOut = true;
      requestController.abort(new Error('Request timeout'));
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
      } else {
        signal.addEventListener('abort', onCallerAbort, { once: true });
      }
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

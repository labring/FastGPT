import http from 'http';
import https from 'https';
import { isIP } from 'net';
import dns from 'dns/promises';
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

const dnsResolve = async (hostname: string) => {
  const res = await dns.lookup(hostname, { all: true });
  return res.map((r) => r.address);
};

/**
 * 执行受控 HTTP 请求。
 *
 * 该函数用于 sandbox 代理出网，集中维护协议、SSRF、DNS pinning、请求次数、
 * 请求体大小、响应大小和超时限制。调用方应为每次代码执行创建独立 state。
 */
export async function runSandboxHttpRequest({
  payload,
  limits,
  state
}: {
  payload: SandboxHttpRequestPayload;
  limits: SandboxHttpLimits;
  state: SandboxHttpState;
}): Promise<any> {
  if (++state.requestCount > limits.maxRequests) {
    throw new Error('Request limit exceeded');
  }

  const allowedProtocols = limits.allowedProtocols ?? ['http:', 'https:'];
  const parsed = new URL(payload.url);
  if (!allowedProtocols.includes(parsed.protocol)) {
    throw new Error('Protocol not allowed');
  }

  if (await isInternalAddress(payload.url)) {
    throw new Error('Request to private network not allowed');
  }

  const ips = await dnsResolve(parsed.hostname);
  if (ips.length === 0 || ips.some((ip) => isInternalResolvedIP(ip))) {
    throw new Error('Request to private network not allowed');
  }

  const method = (payload.method || 'GET').toUpperCase();
  const headers = { ...(payload.headers || {}) };
  const body =
    payload.body != null
      ? typeof payload.body === 'string'
        ? payload.body
        : JSON.stringify(payload.body)
      : null;

  if (body && Buffer.byteLength(body, 'utf8') > limits.maxRequestBodySize) {
    throw new Error('Request body too large');
  }

  const timeout = (() => {
    if (typeof payload.timeoutMs === 'number' && Number.isFinite(payload.timeoutMs)) {
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

  if (body && !headers['Content-Type'] && !headers['content-type']) {
    headers['Content-Type'] = 'application/json';
  }

  const resolvedIP = ips[0];
  if (!headers['Host'] && !headers['host']) {
    headers['Host'] = parsed.hostname + (parsed.port ? ':' + parsed.port : '');
  }

  const lib = parsed.protocol === 'https:' ? https : http;

  return new Promise((resolve, reject) => {
    const req = lib.request(
      {
        method,
        headers,
        timeout,
        hostname: resolvedIP,
        port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
        path: parsed.pathname + parsed.search,
        ...(isIP(parsed.hostname) ? {} : { servername: parsed.hostname })
      },
      (res: any) => {
        const chunks: Buffer[] = [];
        let size = 0;
        res.on('data', (chunk: Buffer) => {
          size += chunk.length;
          if (size > limits.maxResponseSize) {
            req.destroy();
            reject(new Error('Response too large'));
            return;
          }
          chunks.push(chunk);
        });
        res.on('end', () => {
          const data = Buffer.concat(chunks).toString('utf-8');
          const h: Record<string, any> = {};
          for (const [k, v] of Object.entries(res.headers)) h[k] = v;
          resolve({ status: res.statusCode, statusText: res.statusMessage, headers: h, data });
        });
        res.on('error', reject);
      }
    );
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

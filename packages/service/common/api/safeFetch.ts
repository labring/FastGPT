import { AsyncLocalStorage } from 'node:async_hooks';
import dns from 'node:dns';
import { Agent, Dispatcher, ProxyAgent } from 'undici';
import { getProxyForUrl } from 'proxy-from-env';
import { isInternalAddress, isInternalResolvedIP, PRIVATE_URL_TEXT } from '../system/utils';

/**
 * 团队模型自定义端点的运行时安全 Dispatcher。
 *
 * Undici 的 fetch 在首跳和每次 301/302/303/307/308 自动跳转时都会经过
 * Dispatcher.dispatch(opts, handler)：
 *  - 每跳先通过 isInternalAddress 校验协议、主机名与 IP 字面量（超时/取消由
 *    Undici fetch 原生监听 AbortSignal 立即中断）；
 *  - 命中环境代理时交给 ProxyAgent，直连时通过 Agent connect.lookup 二次校验并固定建连 IP。
 */
const scopeStorage = new AsyncLocalStorage<{ origin: string }>();
const proxyAgentCache = new Map<string, ProxyAgent>();
const originalFetch = globalThis.fetch;
let shimInstalled = false;

const safeAgent = new Agent({
  connect: {
    lookup: (hostname, options, callback) => {
      dns.lookup(hostname, { ...options, all: true }, (error, addresses) => {
        if (error) return (callback as (...args: unknown[]) => void)(error, [], 0);
        const list = addresses as dns.LookupAddress[];
        if (list.length === 0 || list.some(({ address }) => isInternalResolvedIP(address))) {
          return (callback as (...args: unknown[]) => void)(new Error(PRIVATE_URL_TEXT), [], 0);
        }
        if (options.all) return (callback as (...args: unknown[]) => void)(null, list, 0);
        (callback as (...args: unknown[]) => void)(null, list[0].address, list[0].family);
      });
    }
  }
});

const getTargetDispatcher = (origin: string) => {
  try {
    const proxyUrl = getProxyForUrl(origin);
    if (!proxyUrl) return safeAgent;
    let agent = proxyAgentCache.get(proxyUrl);
    if (!agent) {
      agent = new ProxyAgent(proxyUrl);
      proxyAgentCache.set(proxyUrl, agent);
    }
    return agent;
  } catch {
    return safeAgent;
  }
};

class SafeLegacyDispatcher extends Dispatcher {
  dispatch(opts: Dispatcher.DispatchOptions, handler: Dispatcher.DispatchHandler) {
    const onError = (error: Error) => {
      if (handler.onResponseError) {
        // Node 26 使用新回调；预检尚未开始请求，沿用 Undici 早期错误的空 controller 语义。
        handler.onResponseError(undefined!, error);
        return;
      }
      handler.onError?.(error);
    };

    const origin = String(opts.origin);
    isInternalAddress(`${origin}${opts.path || '/'}`).then(
      (isInternal) => {
        if (isInternal) {
          onError(new Error(PRIVATE_URL_TEXT));
          return;
        }
        getTargetDispatcher(origin).dispatch(opts, handler);
      },
      (error) => onError(error instanceof Error ? error : new Error(String(error)))
    );
    return true;
  }
}

const safeDispatcher = new SafeLegacyDispatcher();

const toUrl = (input: RequestInfo | URL): URL =>
  typeof input === 'string' ? new URL(input) : input instanceof URL ? input : new URL(input.url);

export const safeLegacyFetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  try {
    return await originalFetch(input, { ...init, dispatcher: safeDispatcher } as RequestInit);
  } catch (error) {
    if ((error as Error)?.name === 'AbortError' || init?.signal?.aborted) throw error;
    const cause = (error as { cause?: unknown })?.cause;
    throw cause instanceof Error ? cause : error;
  }
}) as typeof fetch;

export const installSafeLegacyFetchShim = () => {
  if (shimInstalled) return;
  shimInstalled = true;

  globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    const scope = scopeStorage.getStore();
    if (scope) {
      try {
        if (toUrl(input).origin === scope.origin) return safeLegacyFetch(input, init);
      } catch {
        // ignore invalid URL and fall back to original fetch
      }
    }
    return originalFetch(input, init);
  }) as typeof fetch;
};

export const runWithSafeLegacyFetch = <T>(endpointUrl: string, fn: () => T): T =>
  scopeStorage.run({ origin: new URL(endpointUrl).origin }, fn);

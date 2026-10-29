import { AsyncLocalStorage } from 'node:async_hooks';
import dns from 'node:dns';
import { Agent, fetch as undiciFetch } from 'undici';
import { isInternalResolvedIP, PRIVATE_URL_TEXT } from '../system/utils';

/**
 * 自定义模型端点的运行时安全传输。
 *
 * 写入时的 checkUrlSafety 只能覆盖保存那一刻的 DNS 结果，运行时仍可能出现
 * DNS rebinding 或公网地址重定向到内网。这里在建连阶段重新解析并校验目标 IP，
 * 校验通过后把解析结果固定给本次连接，重定向的每一跳都会重新走 lookup。
 */

type SafeFetchScope = { origin: string };

const scopeStorage = new AsyncLocalStorage<SafeFetchScope>();

const safeAgent = new Agent({
  connect: {
    lookup: (hostname, options, callback) => {
      dns.lookup(hostname, { ...options, all: true }, (error, addresses) => {
        if (error) {
          (callback as (...args: unknown[]) => void)(error, [], 0);
          return;
        }

        const list = addresses as dns.LookupAddress[];
        if (list.length === 0 || list.some(({ address }) => isInternalResolvedIP(address))) {
          (callback as (...args: unknown[]) => void)(new Error(PRIVATE_URL_TEXT), [], 0);
          return;
        }

        if (options.all) {
          (callback as (...args: unknown[]) => void)(null, list, 0);
          return;
        }

        const [first] = list;
        (callback as (...args: unknown[]) => void)(null, first.address, first.family);
      });
    }
  }
});

const toUrl = (input: RequestInfo | URL): URL => {
  if (typeof input === 'string') return new URL(input);
  if (input instanceof URL) return input;
  return new URL(input.url);
};

/**
 * 面向自定义端点的 fetch：协议校验 + 建连 IP 校验/固定。
 * 仅应在请求确实命中模型自定义地址时使用，AI Proxy 等内部服务仍走原 fetch。
 */
export const safeLegacyFetch = ((input: RequestInfo | URL, init?: RequestInit) => {
  const url = toUrl(input);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return Promise.reject(new Error('requestUrl must use http or https protocol'));
  }

  // IP 字面量不会触发 DNS lookup，必须在发起连接前直接校验。
  const hostname = url.hostname.replace(/^\[|\]$/g, '');
  if (isInternalResolvedIP(hostname)) {
    return Promise.reject(new Error(PRIVATE_URL_TEXT));
  }

  return undiciFetch(input as Parameters<typeof undiciFetch>[0], {
    ...(init as Parameters<typeof undiciFetch>[1]),
    dispatcher: safeAgent
  });
}) as typeof fetch;

/**
 * pi-ai 内部直接使用全局 fetch，无法注入 transport。
 * 安装一次全局包装：只有命中当前作用域端点 origin 的请求才走 safeLegacyFetch，
 * 其它请求（AI Proxy、工具调用等）保持原行为。
 */
const originalFetch = globalThis.fetch;
let shimInstalled = false;

export const installSafeLegacyFetchShim = () => {
  if (shimInstalled) return;
  shimInstalled = true;

  globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    const scope = scopeStorage.getStore();
    if (scope) {
      try {
        // 相对 URL 没有 origin，交给原 fetch 处理，避免影响同进程内的其它请求。
        if (toUrl(input).origin === scope.origin) {
          return safeLegacyFetch(input, init);
        }
      } catch {
        // ignore invalid URL and fall back to the original fetch
      }
    }
    return originalFetch(input, init);
  }) as typeof fetch;
};

/** 在指定自定义端点的作用域内执行；作用域内的 async 调用会继承该标记。 */
export const runWithSafeLegacyFetch = <T>(endpointUrl: string, fn: () => T): T => {
  const origin = new URL(endpointUrl).origin;
  return scopeStorage.run({ origin }, fn);
};

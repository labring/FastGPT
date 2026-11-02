import { AsyncLocalStorage } from 'node:async_hooks';
import dns from 'node:dns';
import { Agent, ProxyAgent, fetch as undiciFetch } from 'undici';
import { getProxyForUrl } from 'proxy-from-env';
import { isInternalAddress, isInternalResolvedIP, PRIVATE_URL_TEXT } from '../system/utils';

/**
 * 自定义模型端点的运行时安全传输。
 *
 * 写入时的 checkUrlSafety 只能覆盖保存那一刻的 DNS 结果，运行时仍可能出现
 * DNS rebinding 或公网地址重定向到内网。这里对每一跳重新做 URL/协议校验，
 * 直连时在建连阶段再解析并固定目标 IP；代理路径与 common/api/axios.ts 保持一致，
 * 保留 HTTP(S)_PROXY/NO_PROXY 语义，最终 DNS 解析由代理侧完成。
 */

type SafeFetchScope = { origin: string };

type SafeRequestHop = {
  url: URL;
  method: string;
  headers: Record<string, string>;
  body?: RequestInit['body'];
  signal?: AbortSignal;
  redirectMode: RequestRedirect;
};

type UndiciFetchInit = Parameters<typeof undiciFetch>[1];

const scopeStorage = new AsyncLocalStorage<SafeFetchScope>();

const MAX_REDIRECTS = 5;
const REDIRECT_STATUS_CODES = new Set([301, 302, 303, 307, 308]);
const SENSITIVE_REDIRECT_HEADERS = ['authorization', 'cookie', 'proxy-authorization'];

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

const proxyAgentCache = new Map<string, ProxyAgent>();

/**
 * 与 safe axios 保持一致：使用 proxy-from-env 解析 HTTP(S)_PROXY/NO_PROXY，
 * 命中代理时保留代理链路，否则使用能校验并固定 DNS 解析结果的直连 Agent。
 * 代理侧负责最终 DNS 解析，因此代理路径只做 URL 级校验。
 */
const getDispatcher = (url: URL) => {
  let proxyUrl = '';

  try {
    proxyUrl = getProxyForUrl(url.toString());
  } catch {
    // 代理判断失败时退回直连安全 Agent，至少保留建连期 IP 校验。
    return safeAgent;
  }

  if (!proxyUrl) return safeAgent;

  let agent = proxyAgentCache.get(proxyUrl);
  if (!agent) {
    agent = new ProxyAgent(proxyUrl);
    proxyAgentCache.set(proxyUrl, agent);
  }

  return agent;
};

const toUrl = (input: RequestInfo | URL): URL => {
  if (typeof input === 'string') return new URL(input);
  if (input instanceof URL) return input;
  return new URL(input.url);
};

const createAbortError = (signal?: AbortSignal) =>
  signal?.reason ?? new DOMException('This operation was aborted', 'AbortError');

const throwIfAborted = (signal?: AbortSignal): void => {
  if (signal?.aborted) throw createAbortError(signal);
};

/**
 * 让不受 signal 控制的异步操作（如 dns.resolve4/6）在 abort 时及时释放调用方。
 * 底层查询本身可能继续执行，但这里会在 resolve/reject/abort 三条路径都移除监听器。
 */
const awaitWithAbort = <T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> => {
  if (!signal) return promise;
  throwIfAborted(signal);

  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(createAbortError(signal));

    signal.addEventListener('abort', onAbort, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener('abort', onAbort);
        resolve(value);
      },
      (error) => {
        signal.removeEventListener('abort', onAbort);
        reject(error);
      }
    );
  });
};

/**
 * 校验单跳 URL。IP 字面量不会触发 DNS lookup，必须在这里直接判定；
 * 域名则由 isInternalAddress 解析后校验，直连时 safeAgent 还会在建连前二次校验。
 * DNS 解析可能较慢，必须与请求 signal 竞速，避免预检拖过调用方的超时/取消截止时间。
 */
const assertSafeHopUrl = async (url: URL, signal?: AbortSignal): Promise<void> => {
  throwIfAborted(signal);

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('requestUrl must use http or https protocol');
  }

  if (await awaitWithAbort(isInternalAddress(url.toString()), signal)) {
    throw new Error(PRIVATE_URL_TEXT);
  }
};

/** 把 fetch 入参归一化成可跨跳转重放的请求描述。 */
const readRequestHop = async (
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<SafeRequestHop> => {
  if (typeof Request !== 'undefined' && input instanceof Request) {
    const request = init ? new Request(input, init) : input;

    return {
      url: new URL(request.url),
      method: request.method,
      headers: Object.fromEntries(request.headers.entries()),
      // Request 的 body 是流且只能消费一次；先复制成 Buffer 才能安全跟随 307/308。
      body: request.body ? await request.clone().arrayBuffer() : undefined,
      signal: request.signal,
      redirectMode: request.redirect
    };
  }

  return {
    url: toUrl(input),
    method: (init?.method ?? 'GET').toUpperCase(),
    headers: Object.fromEntries(new Headers(init?.headers).entries()),
    body: init?.body ?? undefined,
    signal: init?.signal ?? undefined,
    redirectMode: init?.redirect ?? 'follow'
  };
};

/**
 * 判断请求体能否在 307/308 跳转后重放。
 * 流式 body 已被首个请求消费，无法安全复用；常见模型请求体都是字符串。
 */
const canReplayBody = (body: SafeRequestHop['body']) =>
  body === null ||
  body === undefined ||
  typeof body === 'string' ||
  body instanceof URLSearchParams ||
  body instanceof ArrayBuffer ||
  ArrayBuffer.isView(body) ||
  (typeof Blob !== 'undefined' && body instanceof Blob) ||
  (typeof FormData !== 'undefined' && body instanceof FormData);

/**
 * 按 fetch 重定向语义裁剪请求头：
 *  - Host 丢弃，由下一跳目标重新生成
 *  - 301/302 POST 与 303 转 GET 时移除 content-* 请求头
 *  - 跨 origin/protocol 时移除凭证类请求头，避免把端点密钥带到新域名
 */
const buildRedirectHeaders = ({
  headers,
  currentUrl,
  redirectUrl,
  switchToGet
}: {
  headers: Record<string, string>;
  currentUrl: URL;
  redirectUrl: URL;
  switchToGet: boolean;
}) => {
  const nextHeaders = { ...headers };
  const crossOrigin =
    currentUrl.protocol !== redirectUrl.protocol || currentUrl.host !== redirectUrl.host;

  delete nextHeaders.host;

  for (const key of Object.keys(nextHeaders)) {
    if (switchToGet && key.startsWith('content-')) {
      delete nextHeaders[key];
      continue;
    }

    if (crossOrigin && SENSITIVE_REDIRECT_HEADERS.includes(key)) {
      delete nextHeaders[key];
    }
  }

  return nextHeaders;
};

/** 301/302 保留 non-POST 方法与 body；303 仅 GET/HEAD 保留方法与 body。 */
const shouldSwitchRedirectToGet = (status: number, method: string) =>
  ((status === 301 || status === 302) && method === 'POST') ||
  (status === 303 && method !== 'GET' && method !== 'HEAD');

const buildUndiciInit = (hop: SafeRequestHop): UndiciFetchInit =>
  ({
    method: hop.method,
    headers: hop.headers,
    body: hop.body,
    signal: hop.signal,
    redirect: 'manual',
    dispatcher: getDispatcher(hop.url),
    ...(typeof ReadableStream !== 'undefined' && hop.body instanceof ReadableStream
      ? { duplex: 'half' }
      : {})
  }) as UndiciFetchInit;

/**
 * 手动跟随重定向，保证每一跳都重新走 URL/协议与内网地址校验。
 * undici 的自动跳转不会重新进入 safeLegacyFetch，IP 字面量目标也不会触发 lookup，
 * 因此不能在拿到 3xx 后交还给 undici 继续处理。
 */
const fetchWithSafeRedirects = async (initialHop: SafeRequestHop): Promise<Response> => {
  let hop = initialHop;

  for (let count = 0; ; count++) {
    await assertSafeHopUrl(hop.url, hop.signal);

    const response = await undiciFetch(hop.url, buildUndiciInit(hop));

    if (!REDIRECT_STATUS_CODES.has(response.status)) {
      return response as unknown as Response;
    }

    const location = response.headers.get('location');
    if (!location) {
      return response as unknown as Response;
    }

    if (count >= MAX_REDIRECTS) {
      await response.body?.cancel().catch(() => {});
      throw new Error(`Maximum redirects exceeded: ${MAX_REDIRECTS}`);
    }

    try {
      const redirectUrl = new URL(location, hop.url);
      const switchToGet = shouldSwitchRedirectToGet(response.status, hop.method);
      const body = switchToGet ? undefined : hop.body;

      if (!switchToGet && !canReplayBody(body)) {
        throw new Error('Cannot follow redirect with a non-replayable request body');
      }

      hop = {
        url: redirectUrl,
        method: switchToGet ? 'GET' : hop.method,
        headers: buildRedirectHeaders({
          headers: hop.headers,
          currentUrl: hop.url,
          redirectUrl,
          switchToGet
        }),
        body,
        signal: hop.signal,
        redirectMode: hop.redirectMode
      };
    } finally {
      // 跳转元数据可能非法；无论成功与否都先释放当前响应体，避免连接泄漏。
      await response.body?.cancel().catch(() => {});
    }
  }
};

/**
 * 面向自定义端点的 fetch：协议校验 + 逐跳重定向校验 + 建连 IP 校验/固定。
 * 仅应在请求确实命中模型自定义地址时使用，AI Proxy 等内部服务仍走原 fetch。
 */
export const safeLegacyFetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const hop = await readRequestHop(input, init);

  // 调用方显式要求 manual/error 时不自动跟随，但仍校验首跳目标。
  if (hop.redirectMode !== 'follow') {
    await assertSafeHopUrl(hop.url, hop.signal);
    return undiciFetch(hop.url, {
      ...buildUndiciInit(hop),
      redirect: hop.redirectMode
    } as UndiciFetchInit) as unknown as Response;
  }

  return fetchWithSafeRedirects(hop);
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

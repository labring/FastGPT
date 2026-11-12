import { readFile } from 'node:fs/promises';
import ky from 'ky';
import { CliApiError, CliAuthError, CliNetworkError } from '../../shared/errors';
import { redactText } from '../../shared/redact';
import type { CliFetchFn } from '../../shared/types';
import { createNodeTlsFetch } from './tls-fetch';

export const DEFAULT_TIMEOUT_MS = 15_000;

export type HttpRequestAuth = {
  authType: 'token' | 'apikey';
  secret: string;
};

export type SseEvent = {
  event?: string;
  data: string;
  id?: string;
};

export type RawHttpResponse = {
  status: number;
  headers: Headers;
  text: () => Promise<string>;
  arrayBuffer: () => Promise<ArrayBuffer>;
};

export type FastGptHttpClient = {
  readonly baseUrl: string;
  request: <T = unknown>(params: {
    method: 'GET' | 'POST' | 'PUT' | 'DELETE';
    path: string;
    query?: Record<string, string | number | boolean | undefined>;
    body?: unknown;
    auth?: HttpRequestAuth;
    headers?: Record<string, string>;
    timeoutMs?: number;
  }) => Promise<T>;
  requestRaw: (params: {
    method: 'GET' | 'POST' | 'PUT' | 'DELETE';
    path: string;
    query?: Record<string, string | number | boolean | undefined>;
    body?: BodyInit | null;
    auth?: HttpRequestAuth;
    headers?: Record<string, string>;
    timeoutMs?: number;
  }) => Promise<RawHttpResponse>;
  uploadMultipart: <T = unknown>(params: {
    path: string;
    formData: FormData;
    query?: Record<string, string | number | boolean | undefined>;
    auth?: HttpRequestAuth;
    headers?: Record<string, string>;
    timeoutMs?: number;
  }) => Promise<T>;
  streamSse: (params: {
    method?: 'GET' | 'POST';
    path: string;
    query?: Record<string, string | number | boolean | undefined>;
    body?: unknown;
    auth?: HttpRequestAuth;
    headers?: Record<string, string>;
    signal?: AbortSignal;
    timeoutMs?: number;
  }) => AsyncIterable<SseEvent>;
};

function getRuntimeTag(): string {
  const bunVersion = (process.versions as Record<string, string | undefined>).bun;
  if (bunVersion) {
    return `bun/${bunVersion}`;
  }
  return `node/${process.versions.node}`;
}

/**
 * 构造 FastGPT 标准认证与追踪请求头；Session 模式下只传 `token` 不带 `Cookie`，避免触发 GET CSRF。
 */
export function buildAuthHeaders({
  auth,
  cliVersion,
  extraHeaders
}: {
  auth?: HttpRequestAuth;
  cliVersion: string;
  extraHeaders?: Record<string, string>;
}): Record<string, string> {
  const headers: Record<string, string> = {
    accept: 'application/json',
    'x-fastgpt-client': `fastgpt-cli/${cliVersion} (${process.platform}-${process.arch}; ${getRuntimeTag()})`,
    ...extraHeaders
  };

  if (auth) {
    if (auth.authType === 'token') {
      headers.token = auth.secret;
    } else {
      headers.authorization = `Bearer ${auth.secret}`;
    }
  }

  return headers;
}

function mapServerError({
  httpStatus,
  serverCode,
  statusText,
  message,
  url
}: {
  httpStatus: number;
  serverCode?: number;
  statusText?: string;
  message: string;
  url: string;
}): CliAuthError | CliApiError {
  const safeMessage = redactText(message);
  const safeUrl = redactText(url);

  if (/API Key is expired/i.test(safeMessage)) {
    return new CliAuthError({
      code: 'AUTH_EXPIRED',
      message: safeMessage,
      hint: 'Generate a new API Key or extend its expiration in the FastGPT console.',
      details: { httpStatus, serverCode, statusText, url: safeUrl }
    });
  }

  if (/API Key is over usage/i.test(safeMessage)) {
    return new CliAuthError({
      code: 'AUTH_QUOTA_EXCEEDED',
      message: safeMessage,
      hint: 'Increase maxUsagePoints for this API Key or switch to another key.',
      details: { httpStatus, serverCode, statusText, url: safeUrl }
    });
  }

  // FastGPT 服务端 unAuthApiKey 的业务码为 514 且 HTTP 状态可能是 500，不能仅看 401/403。
  if (
    httpStatus === 401 ||
    httpStatus === 403 ||
    serverCode === 401 ||
    serverCode === 403 ||
    serverCode === 514 ||
    statusText === 'unAuthorization' ||
    statusText === 'unAuthApiKey' ||
    statusText === 'unAuthProToken' ||
    statusText === 'unAuthTeam' ||
    /accountCancellationPending/i.test(safeMessage)
  ) {
    const isApiKey = serverCode === 514 || statusText === 'unAuthApiKey';
    return new CliAuthError({
      code: 'AUTH_INVALID',
      message: safeMessage || 'Authentication failed',
      hint: isApiKey
        ? 'Verify your API Key or check whether it has been deleted/restricted. Run "fastgpt doctor" for diagnostics.'
        : 'Your session may be invalid or expired (7-day TTL). Run "fastgpt login" to re-authenticate.',
      details: { httpStatus, serverCode, statusText, url: safeUrl }
    });
  }

  return new CliApiError({
    message: safeMessage || `Request failed with status ${httpStatus}`,
    httpStatus,
    serverCode,
    statusText,
    details: { url: safeUrl }
  });
}

function unpackFastGptResponse<T>({
  response,
  rawText,
  displayUrl,
  onSessionRenewed
}: {
  response: Response;
  rawText: string;
  displayUrl: string;
  onSessionRenewed?: (expiresAt: number) => void;
}): T {
  const sessionExpiresHeader = response.headers?.get?.('x-fastgpt-session-expires');
  if (sessionExpiresHeader) {
    const expiresAt = Number(sessionExpiresHeader);
    if (Number.isFinite(expiresAt) && expiresAt > 0) {
      onSessionRenewed?.(expiresAt);
    }
  }

  if (response.status >= 300 && response.status < 400) {
    const location = response.headers?.get?.('location');
    throw new CliNetworkError(
      `Unhandled HTTP ${response.status} redirect${location ? ` to "${redactText(location)}"` : ''}.`,
      'Ensure FASTGPT_BASE_URL points directly to the canonical API endpoint.'
    );
  }

  let parsed: unknown = undefined;
  if (rawText.trim().length > 0) {
    try {
      parsed = JSON.parse(rawText);
    } catch {
      if (response.status >= 400) {
        throw mapServerError({
          httpStatus: response.status,
          message: rawText.slice(0, 300) || `HTTP ${response.status}`,
          url: displayUrl
        });
      }
      return rawText as T;
    }
  }

  if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
    const envelope = parsed as {
      code?: unknown;
      statusText?: unknown;
      message?: unknown;
      data?: unknown;
    };
    const serverCode = typeof envelope.code === 'number' ? envelope.code : undefined;
    const statusText = typeof envelope.statusText === 'string' ? envelope.statusText : undefined;
    const serverMessage =
      typeof envelope.message === 'string' && envelope.message.length > 0
        ? envelope.message
        : statusText || `Request failed (HTTP ${response.status})`;

    if (response.status >= 400 || (serverCode !== undefined && serverCode >= 400)) {
      throw mapServerError({
        httpStatus: response.status,
        serverCode,
        statusText,
        message: serverMessage,
        url: displayUrl
      });
    }

    if ('code' in envelope && 'data' in envelope) {
      return envelope.data as T;
    }
  }

  if (response.status >= 400) {
    throw mapServerError({
      httpStatus: response.status,
      message: `Request failed (HTTP ${response.status})`,
      url: displayUrl
    });
  }

  return parsed as T;
}

async function* parseSseStream(stream: ReadableStream<Uint8Array>): AsyncIterable<SseEvent> {
  const reader = stream.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';
  let currentEvent: string | undefined;
  let currentId: string | undefined;
  let currentDataLines: string[] = [];

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      buffer += decoder.decode(value, { stream: true });

      let newlineIndex: number;
      while ((newlineIndex = buffer.indexOf('\n')) >= 0) {
        const rawLine = buffer.slice(0, newlineIndex);
        buffer = buffer.slice(newlineIndex + 1);
        const line = rawLine.endsWith('\r') ? rawLine.slice(0, -1) : rawLine;

        if (line === '') {
          if (currentDataLines.length > 0) {
            const data = currentDataLines.join('\n');
            if (data === '[DONE]') {
              return;
            }
            yield {
              ...(currentEvent !== undefined ? { event: currentEvent } : {}),
              ...(currentId !== undefined ? { id: currentId } : {}),
              data
            };
            currentEvent = undefined;
            currentId = undefined;
            currentDataLines = [];
          }
          continue;
        }

        if (line.startsWith(':')) {
          continue;
        }

        if (line.startsWith('event:')) {
          currentEvent = line.slice(6).trim();
        } else if (line.startsWith('data:')) {
          const content = line.startsWith('data: ') ? line.slice(6) : line.slice(5);
          currentDataLines.push(content);
        } else if (line.startsWith('id:')) {
          currentId = line.slice(3).trim();
        }
      }
    }

    // 处理末尾残留块
    if (currentDataLines.length > 0) {
      const data = currentDataLines.join('\n');
      if (data !== '[DONE]') {
        yield {
          ...(currentEvent !== undefined ? { event: currentEvent } : {}),
          ...(currentId !== undefined ? { id: currentId } : {}),
          data
        };
      }
    }
  } finally {
    reader.releaseLock();
  }
}

/**
 * 基于 `ky` 封装的 FastGPT HTTP 客户端：提供标准 `fetch` 适配、追踪头注入、FastGPT 信封解包与错误分级映射。
 */
export function createFastGptHttpClient({
  baseUrl,
  cliVersion,
  fetchFn = globalThis.fetch,
  insecure = false,
  caCertPath,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  onSessionRenewed
}: {
  baseUrl: string;
  cliVersion: string;
  fetchFn?: CliFetchFn;
  insecure?: boolean;
  caCertPath?: string;
  timeoutMs?: number;
  onSessionRenewed?: (expiresAt: number) => void;
}): FastGptHttpClient {
  const normalizedBaseUrl = baseUrl.replace(/\/+$/, '');
  const baseOrigin = new URL(normalizedBaseUrl).origin;
  let cachedCaPem: string | undefined;

  async function resolveTransportFetch(): Promise<CliFetchFn> {
    if (!insecure && !caCertPath) {
      return fetchFn;
    }
    if (caCertPath && cachedCaPem === undefined) {
      cachedCaPem = await readFile(caCertPath, 'utf8');
    }
    return createNodeTlsFetch({ insecure, caPem: cachedCaPem });
  }

  function filterQuery(
    query?: Record<string, string | number | boolean | undefined>
  ): Record<string, string | number | boolean> | undefined {
    if (!query) {
      return undefined;
    }
    const filtered = Object.fromEntries(
      Object.entries(query).filter(([, value]) => value !== undefined) as Array<
        [string, string | number | boolean]
      >
    );
    return Object.keys(filtered).length > 0 ? filtered : undefined;
  }

  async function buildKyClient({
    timeout,
    auth,
    extraHeaders,
    stripAccept = false
  }: {
    timeout: number;
    auth?: HttpRequestAuth;
    extraHeaders?: Record<string, string>;
    stripAccept?: boolean;
  }) {
    const activeFetch = await resolveTransportFetch();
    return ky.create({
      prefixUrl: normalizedBaseUrl,
      timeout,
      retry: 0,
      throwHttpErrors: false,
      redirect: 'manual',
      fetch: activeFetch,
      hooks: {
        beforeRequest: [
          (req) => {
            const reqOrigin = new URL(req.url).origin;
            // 校验请求目标是否跨域，防范重定向将自定义 token/Authorization 凭据泄漏到其他服务
            if (reqOrigin !== baseOrigin) {
              throw new CliNetworkError(
                `Cross-origin redirect to "${redactText(req.url)}" blocked to prevent credential leakage.`,
                'Verify FASTGPT_BASE_URL and check for unintended external redirects.'
              );
            }
            const builtHeaders = buildAuthHeaders({ auth, cliVersion, extraHeaders });
            if (stripAccept) {
              delete builtHeaders.accept;
            }
            for (const [key, value] of Object.entries(builtHeaders)) {
              req.headers.set(key, value);
            }
          }
        ]
      }
    });
  }

  const executeWithRedirects = async ({
    client,
    initialPath,
    method: initialMethod,
    searchParams,
    jsonBody,
    rawBody,
    formData,
    signal
  }: {
    client: any;
    initialPath: string;
    method: 'GET' | 'POST' | 'PUT' | 'DELETE';
    searchParams?: Record<string, string | number | boolean>;
    jsonBody?: unknown;
    rawBody?: BodyInit | null;
    formData?: FormData;
    signal?: AbortSignal;
  }): Promise<{ response: Response; finalUrl: string }> => {
    let currentPath = initialPath;
    let currentMethod = initialMethod;
    let currentJson = jsonBody;
    let currentRawBody = rawBody;
    let currentFormData = formData;
    let currentSearchParams = searchParams;
    let currentDisplayUrl = `${normalizedBaseUrl}/${initialPath}`;

    for (let hop = 0; hop <= 5; hop += 1) {
      let response: Response;
      try {
        response = await client(currentPath, {
          method: currentMethod,
          ...(signal ? { signal } : {}),
          ...(currentSearchParams ? { searchParams: currentSearchParams } : {}),
          ...(currentJson !== undefined ? { json: currentJson } : {}),
          ...(currentRawBody !== undefined && currentRawBody !== null
            ? { body: currentRawBody }
            : {}),
          ...(currentFormData !== undefined ? { body: currentFormData } : {})
        });
      } catch (error) {
        if (error instanceof CliNetworkError) throw error;
        const msg = redactText(error instanceof Error ? error.message : String(error));
        const isTls = /cert|tls|ssl|self[- ]signed|unable to verify/i.test(msg);
        throw new CliNetworkError(
          `Network request failed for ${redactText(currentDisplayUrl)}: ${msg}`,
          isTls
            ? 'Verify your TLS certificate, or pass --ca-cert <pem> (or --insecure for debugging).'
            : 'Check FASTGPT_BASE_URL and confirm the FastGPT server is reachable.',
          { url: redactText(currentDisplayUrl) }
        );
      }

      if (response.status >= 300 && response.status < 400) {
        if (hop === 5) {
          throw new CliNetworkError(
            `Too many redirects (exceeded maximum of 5 hops).`,
            'Verify server redirect configuration.'
          );
        }

        const location = response.headers.get('location');
        if (!location) {
          throw new CliNetworkError(
            `Server returned HTTP ${response.status} redirect without a Location header.`,
            'Verify server routing configuration.'
          );
        }

        const targetUrl = new URL(location, currentDisplayUrl);
        if (targetUrl.origin !== baseOrigin) {
          throw new CliNetworkError(
            `Cross-origin redirect to "${redactText(location)}" blocked to prevent credential leakage.`,
            'Verify FASTGPT_BASE_URL and check for unintended external redirects.'
          );
        }

        // 计算相对于 normalizedBaseUrl 的相对路径
        const basePrefix = new URL(normalizedBaseUrl).pathname.replace(/\/+$/, '');
        const targetPathname = targetUrl.pathname;
        const relativeTarget = targetPathname.startsWith(basePrefix)
          ? targetPathname.slice(basePrefix.length).replace(/^\/+/, '')
          : targetPathname.replace(/^\/+/, '');
        currentPath = relativeTarget + targetUrl.search;
        currentDisplayUrl = targetUrl.toString();
        currentSearchParams = undefined;

        // 301 / 302 / 303 按 HTTP 规范对非幂等请求重写为 GET
        if (response.status === 301 || response.status === 302 || response.status === 303) {
          if (currentMethod !== 'GET') {
            currentMethod = 'GET';
            currentJson = undefined;
            currentRawBody = null;
            currentFormData = undefined;
          }
        }
        // 307 与 308 保留原始 HTTP 方法与请求载荷
        continue;
      }

      return { response, finalUrl: currentDisplayUrl };
    }

    throw new CliNetworkError('Too many redirects.');
  };

  return {
    baseUrl: normalizedBaseUrl,
    request: async <T = unknown>({
      method,
      path,
      query,
      body,
      auth,
      headers: extraHeaders,
      timeoutMs: requestTimeout = timeoutMs
    }: {
      method: 'GET' | 'POST' | 'PUT' | 'DELETE';
      path: string;
      query?: Record<string, string | number | boolean | undefined>;
      body?: unknown;
      auth?: HttpRequestAuth;
      headers?: Record<string, string>;
      timeoutMs?: number;
    }): Promise<T> => {
      const relativePath = path.replace(/^\/+/, '');
      const searchParams = filterQuery(query);
      const client = await buildKyClient({ timeout: requestTimeout, auth, extraHeaders });

      const { response, finalUrl } = await executeWithRedirects({
        client,
        initialPath: relativePath,
        method,
        searchParams,
        jsonBody: body
      });

      const rawText = await response.text();
      return unpackFastGptResponse<T>({
        response,
        rawText,
        displayUrl: finalUrl,
        onSessionRenewed
      });
    },

    requestRaw: async ({
      method,
      path,
      query,
      body,
      auth,
      headers: extraHeaders,
      timeoutMs: requestTimeout = timeoutMs
    }): Promise<RawHttpResponse> => {
      const relativePath = path.replace(/^\/+/, '');
      const searchParams = filterQuery(query);
      const client = await buildKyClient({ timeout: requestTimeout, auth, extraHeaders });

      const { response, finalUrl } = await executeWithRedirects({
        client,
        initialPath: relativePath,
        method,
        searchParams,
        rawBody: body
      });

      if (response.status >= 400) {
        const rawText = await response.text();
        throw mapServerError({
          httpStatus: response.status,
          message: rawText.slice(0, 300) || `HTTP ${response.status}`,
          url: finalUrl
        });
      }

      return {
        status: response.status,
        headers: response.headers,
        text: () => response.text(),
        arrayBuffer: () => response.arrayBuffer()
      };
    },

    uploadMultipart: async <T = unknown>({
      path,
      formData,
      query,
      auth,
      headers: extraHeaders,
      timeoutMs: requestTimeout = timeoutMs
    }: {
      path: string;
      formData: FormData;
      query?: Record<string, string | number | boolean | undefined>;
      auth?: HttpRequestAuth;
      headers?: Record<string, string>;
      timeoutMs?: number;
    }): Promise<T> => {
      const relativePath = path.replace(/^\/+/, '');
      const searchParams = filterQuery(query);
      const client = await buildKyClient({
        timeout: requestTimeout,
        auth,
        extraHeaders,
        stripAccept: true
      });

      const { response, finalUrl } = await executeWithRedirects({
        client,
        initialPath: relativePath,
        method: 'POST',
        searchParams,
        formData
      });

      const rawText = await response.text();
      return unpackFastGptResponse<T>({
        response,
        rawText,
        displayUrl: finalUrl,
        onSessionRenewed
      });
    },

    streamSse: async function* ({
      method = 'POST',
      path,
      query,
      body,
      auth,
      headers: extraHeaders,
      signal,
      timeoutMs: requestTimeout = timeoutMs
    }): AsyncIterable<SseEvent> {
      const relativePath = path.replace(/^\/+/, '');
      const searchParams = filterQuery(query);
      const client = await buildKyClient({
        timeout: requestTimeout,
        auth,
        extraHeaders: {
          accept: 'text/event-stream',
          ...extraHeaders
        }
      });

      const { response, finalUrl } = await executeWithRedirects({
        client,
        initialPath: relativePath,
        method,
        searchParams,
        jsonBody: body,
        signal
      });

      if (response.status >= 400) {
        const rawText = await response.text();
        throw mapServerError({
          httpStatus: response.status,
          message: rawText.slice(0, 300) || `HTTP ${response.status}`,
          url: finalUrl
        });
      }

      if (!response.body) {
        return;
      }

      yield* parseSseStream(response.body);
    }
  };
}

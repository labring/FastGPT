import { ApiPromise } from './apiPromise';
import {
  createMappedApiError,
  FastGptAuthError,
  FastGptBadRequestError,
  FastGptError,
  FastGptNetworkError,
  FastGptTimeoutError
} from './errors';
import {
  notifyErrorObservability,
  notifyRequestObservability,
  notifyResponseObservability,
  resolveLogger
} from './hooks';
import { buildMultipartFormData } from './multipart';
import { ChatStream } from './sse';
import type {
  BinaryInput,
  FastGptClientOptions,
  FastGptIdentity,
  FastGptLogger,
  OperationSpec,
  RawRequestParams,
  RawResponseInfo,
  RequestOptions,
  WithRawResponseResult
} from './types';

export const SDK_VERSION = '0.1.0-beta.1';
const DEFAULT_BASE_URL = 'https://cloud.fastgpt.cn';
const DEFAULT_TIMEOUT_MS = 60_000;
const DEFAULT_GET_MAX_RETRIES = 2;

const RETRYABLE_HTTP_STATUSES = new Set<number>([408, 429, 502, 503, 504]);

const isRecord = (val: unknown): val is Record<string, unknown> =>
  val !== null && typeof val === 'object' && !Array.isArray(val);

const isBrowserEnvironment = (): boolean =>
  typeof globalThis !== 'undefined' &&
  'window' in globalThis &&
  typeof (globalThis as { window?: { document?: unknown } }).window?.document !== 'undefined';

const readEnvVar = (name: string): string | undefined => {
  const proc = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process;
  const val = proc?.env?.[name];
  return typeof val === 'string' && val.trim().length > 0 ? val.trim() : undefined;
};

/**
 * 将用户传入的 baseUrl 归一化为以 `/api` 结尾的标准 API 根路径，
 * 同时兼容传入 `https://host` 与 `https://host/api` 两种习惯。
 */
export const normalizeApiBaseUrl = (rawBaseUrl?: string): string => {
  const candidate = (rawBaseUrl ?? readEnvVar('FASTGPT_BASE_URL') ?? DEFAULT_BASE_URL).trim();
  const withoutTrailingSlash = candidate.replace(/\/+$/, '');
  if (withoutTrailingSlash.endsWith('/api')) {
    return withoutTrailingSlash;
  }
  return `${withoutTrailingSlash}/api`;
};

const validateIdentityExclusivity = (identity?: FastGptIdentity): void => {
  if (
    identity !== undefined &&
    identity.customUid !== undefined &&
    identity.authProxy !== undefined
  ) {
    throw new FastGptBadRequestError({
      message: '"customUid" and "authProxy" are mutually exclusive and cannot be set together'
    });
  }
};

const extractRequestId = (headers: Headers): string | null =>
  headers.get('x-request-id') ?? headers.get('x-fastgpt-request-id') ?? null;

const appendQueryParams = (url: URL, query: Record<string, unknown>): void => {
  for (const [key, val] of Object.entries(query)) {
    if (val === undefined || val === null) continue;
    if (Array.isArray(val)) {
      for (const item of val) {
        if (item !== undefined && item !== null) {
          url.searchParams.append(key, String(item));
        }
      }
    } else if (typeof val === 'object') {
      url.searchParams.set(key, JSON.stringify(val));
    } else {
      url.searchParams.set(key, String(val));
    }
  }
};

const toBinaryBodyInit = (input: BinaryInput): { body: BodyInit; isStream: boolean } => {
  if (input instanceof Blob || input instanceof ArrayBuffer) {
    return { body: input, isStream: false };
  }
  if (input instanceof Uint8Array) {
    return { body: new Uint8Array(input), isStream: false };
  }
  if (typeof ReadableStream !== 'undefined' && input instanceof ReadableStream) {
    return { body: input, isStream: true };
  }
  throw new FastGptBadRequestError({
    message: 'Binary upload requires a Blob, ArrayBuffer, Uint8Array, or ReadableStream<Uint8Array>'
  });
};

const parseRetryAfterMs = (headerVal: string | null): number | null => {
  if (headerVal === null) return null;
  const seconds = Number(headerVal);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.min(seconds * 1000, 30_000);
  }
  const dateMs = Date.parse(headerVal);
  if (!Number.isNaN(dateMs)) {
    return Math.min(Math.max(0, dateMs - Date.now()), 30_000);
  }
  return null;
};

const sleepWithSignal = (ms: number, signal?: AbortSignal): Promise<void> =>
  new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason ?? new DOMException('Aborted', 'AbortError'));
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal?.reason ?? new DOMException('Aborted', 'AbortError'));
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });

const hasHeaderIgnoreCase = (headers: Record<string, string>, targetName: string): boolean => {
  const lower = targetName.toLowerCase();
  return Object.keys(headers).some((key) => key.toLowerCase() === lower);
};

const readWithAbortSignal = async <R>({
  read,
  signal,
  onAbort
}: {
  read: () => Promise<R>;
  signal: AbortSignal;
  onAbort?: () => void;
}): Promise<R> => {
  if (signal.aborted) {
    onAbort?.();
    throw signal.reason ?? new DOMException('Aborted', 'AbortError');
  }

  const readPromise = read();
  // 若超时或外部信号先触发，防止底层响应体读取后续异步 reject 造成 unhandledRejection。
  readPromise.catch(() => {});

  return await new Promise<R>((resolve, reject) => {
    const onSignalAbort = () => {
      onAbort?.();
      reject(signal.reason ?? new DOMException('Aborted', 'AbortError'));
    };
    signal.addEventListener('abort', onSignalAbort, { once: true });

    readPromise.then(
      (value) => {
        signal.removeEventListener('abort', onSignalAbort);
        resolve(value);
      },
      (error) => {
        signal.removeEventListener('abort', onSignalAbort);
        reject(error);
      }
    );
  });
};

type FetchAttemptLease = {
  response: Response;
  controller: AbortController;
  attempt: number;
  timeoutMs: number;
  isTimedOut: () => boolean;
  isExternalAborted: () => boolean;
  clearTimeoutTimer: () => void;
  dispose: () => void;
};

type PreparedHttpCall = {
  url: string;
  headers: Record<string, string>;
  body?: BodyInit;
  isStreamBody: boolean;
};

/**
 * SDK 底层传输、鉴权注入、异常解包与流式管理核心底座。
 */
export class BaseClient {
  protected readonly _options: FastGptClientOptions;
  readonly apiBaseUrl: string;
  private readonly _fetchFn: typeof globalThis.fetch;
  private readonly _logger: FastGptLogger | null;
  // 记录客户端已配置/已解析的活跃凭据，确保任意自定义 site.openApiPrefix 密钥在错误与钩子日志中均可脱敏。
  private readonly _knownSecrets = new Set<string>();

  constructor(options: FastGptClientOptions = {}) {
    if (isBrowserEnvironment() && options.dangerouslyAllowBrowser !== true) {
      throw new FastGptError({
        message:
          'Instantiating FastGPT SDK in a browser environment is blocked by default to prevent exposing API Keys. Pass { dangerouslyAllowBrowser: true } only if you understand the risk.'
      });
    }

    validateIdentityExclusivity(options.identity);

    this._options = { ...options };
    this.apiBaseUrl = normalizeApiBaseUrl(options.baseUrl);
    this._fetchFn = options.fetch ?? globalThis.fetch.bind(globalThis);
    this._logger = resolveLogger(options.logger);
    if (typeof options.apiKey === 'string') {
      this._recordSecret(options.apiKey);
    }
  }

  private _recordSecret(rawSecret?: string): void {
    if (rawSecret === undefined) return;
    const normalized = rawSecret
      .trim()
      .replace(/^Bearer\s+/i, '')
      .trim();
    if (normalized.length >= 6) {
      // 上限保护：防止长期轮换密钥无限增长
      if (this._knownSecrets.size >= 32 && !this._knownSecrets.has(normalized)) {
        const oldest = this._knownSecrets.values().next().value;
        if (oldest !== undefined) {
          this._knownSecrets.delete(oldest);
        }
      }
      this._knownSecrets.add(normalized);
    }
  }

  private _getActiveSecrets(requestOptions?: RequestOptions): string[] {
    if (requestOptions?.apiKey !== undefined) {
      this._recordSecret(requestOptions.apiKey);
    }
    return [...this._knownSecrets];
  }

  /**
   * 内部辅助：将服务端返回的绝对或相对接口路径（如 /api/system/file/u/{token}）
   * 按当前 apiBaseUrl（含反向代理子路径）解析为完整可请求 URL。
   */
  _resolveEndpointUrl(targetUrl: string): string {
    if (/^https?:\/\//i.test(targetUrl)) {
      return targetUrl;
    }
    if (targetUrl.startsWith('/api/')) {
      return `${this.apiBaseUrl}${targetUrl.slice(4)}`;
    }
    if (targetUrl.startsWith('/')) {
      return new URL(targetUrl, this.apiBaseUrl).toString();
    }
    return `${this.apiBaseUrl}/${targetUrl}`;
  }

  /** 内部辅助：向高阶上传 Helper 共享客户端绑定的 fetch 实例。 */
  _getFetch(): typeof globalThis.fetch {
    return this._fetchFn;
  }

  /** 内部辅助：读取默认超时配置（毫秒）。 */
  _getDefaultTimeoutMs(): number {
    return this._options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  private async _resolveApiKey(requestOptions?: RequestOptions): Promise<string | undefined> {
    if (requestOptions?.apiKey !== undefined) {
      this._recordSecret(requestOptions.apiKey);
      return requestOptions.apiKey;
    }
    const configured = this._options.apiKey ?? readEnvVar('FASTGPT_API_KEY');
    if (configured === undefined) {
      return undefined;
    }
    if (typeof configured === 'function') {
      const resolved = await configured();
      this._recordSecret(resolved);
      return resolved;
    }
    this._recordSecret(configured);
    return configured;
  }

  private _resolveEffectiveIdentity(
    rawInput: Record<string, unknown> | undefined,
    requestOptions?: RequestOptions
  ): FastGptIdentity | undefined {
    if (requestOptions?.customUid !== undefined && requestOptions?.authProxy !== undefined) {
      throw new FastGptBadRequestError({
        message:
          'RequestOptions "customUid" and "authProxy" are mutually exclusive and cannot be set together'
      });
    }
    if (rawInput?.customUid !== undefined && rawInput?.authProxy !== undefined) {
      throw new FastGptBadRequestError({
        message:
          'Request payload "customUid" and "authProxy" are mutually exclusive and cannot be set together'
      });
    }

    if (requestOptions?.customUid !== undefined) {
      return { customUid: requestOptions.customUid };
    }
    if (requestOptions?.authProxy !== undefined) {
      return { authProxy: requestOptions.authProxy };
    }
    if (rawInput?.customUid !== undefined || rawInput?.authProxy !== undefined) {
      // 当调用方直接传入字符串形式的 authProxy（如 query JSON 字符串）时，保留原入参且不再叠加客户端级默认身份。
      if (typeof rawInput.authProxy === 'string') {
        return undefined;
      }
      return {
        ...(typeof rawInput.customUid === 'string' ? { customUid: rawInput.customUid } : {}),
        ...(isRecord(rawInput.authProxy)
          ? { authProxy: rawInput.authProxy as FastGptIdentity['authProxy'] }
          : {})
      };
    }

    return this._options.identity;
  }

  private _injectContextIntoTarget({
    target,
    spec,
    carrierType,
    effectiveIdentity
  }: {
    target: Record<string, unknown>;
    spec: OperationSpec;
    carrierType: 'query' | 'body' | 'multipartData';
    effectiveIdentity?: FastGptIdentity;
  }): void {
    if (
      spec.appIdCarrier === carrierType &&
      target.appId === undefined &&
      this._options.defaultAppId !== undefined
    ) {
      target.appId = this._options.defaultAppId;
    }

    if (spec.identityCarrier === carrierType && effectiveIdentity !== undefined) {
      if (effectiveIdentity.customUid !== undefined) {
        target.customUid = effectiveIdentity.customUid;
        delete target.authProxy;
      } else if (effectiveIdentity.authProxy !== undefined) {
        target.authProxy = effectiveIdentity.authProxy;
        delete target.customUid;
      }
    }
  }

  private _prepareHttpCall({
    spec,
    rawInput,
    requestOptions,
    acceptHeader
  }: {
    spec: OperationSpec;
    rawInput: Record<string, unknown> | undefined;
    requestOptions: RequestOptions | undefined;
    acceptHeader: string;
  }): {
    url: string;
    headers: Record<string, string>;
    body?: BodyInit;
    isStreamBody: boolean;
  } {
    const effectiveIdentity = this._resolveEffectiveIdentity(rawInput, requestOptions);
    const input = rawInput ?? {};

    // 1. 替换路径参数占位符（如 /system/file/u/{token}）
    const normalizedRoutePath = spec.path.startsWith('/api/')
      ? spec.path.slice(4)
      : spec.path.startsWith('/')
        ? spec.path
        : `/${spec.path}`;

    let resolvedPath = normalizedRoutePath;
    const consumedKeys = new Set<string>();

    for (const pathParam of spec.pathParams) {
      const rawVal = input[pathParam];
      if (rawVal === undefined || rawVal === null || String(rawVal).length === 0) {
        throw new FastGptBadRequestError({
          message: `Missing required path parameter "${pathParam}" for ${spec.httpMethod} ${spec.path}`
        });
      }
      resolvedPath = resolvedPath.replace(`{${pathParam}}`, encodeURIComponent(String(rawVal)));
      consumedKeys.add(pathParam);
    }

    // 2. 组装查询参数并按 IR 规则自动注入上下文
    const queryObj: Record<string, unknown> = {};
    for (const qKey of spec.queryParams) {
      if (input[qKey] !== undefined) {
        queryObj[qKey] = input[qKey];
      }
      consumedKeys.add(qKey);
    }
    this._injectContextIntoTarget({
      target: queryObj,
      spec,
      carrierType: 'query',
      effectiveIdentity
    });

    const fullUrl = new URL(`${this.apiBaseUrl}${resolvedPath}`);
    appendQueryParams(fullUrl, queryObj);

    const headers: Record<string, string> = {
      accept: acceptHeader,
      'x-fastgpt-client': `fastgpt-js-sdk/${SDK_VERSION}`,
      ...(this._options.defaultHeaders ?? {}),
      ...(requestOptions?.headers ?? {})
    };

    // 3. 组装请求体（JSON / Multipart / 二进制流）
    if (spec.requestContentType === 'none') {
      return { url: fullUrl.toString(), headers, isStreamBody: false };
    }

    if (spec.requestContentType === 'octet-stream') {
      const binField = spec.binaryBodyField ?? 'file';
      const rawBin = input[binField];
      if (rawBin === undefined || rawBin === null) {
        throw new FastGptBadRequestError({
          message: `Missing required binary field "${binField}" for ${spec.httpMethod} ${spec.path}`
        });
      }
      headers['content-type'] = headers['content-type'] ?? 'application/octet-stream';
      const { body, isStream } = toBinaryBodyInit(rawBin as BinaryInput);
      return { url: fullUrl.toString(), headers, body, isStreamBody: isStream };
    }

    const remainingPayload: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(input)) {
      if (!consumedKeys.has(key) && val !== undefined) {
        remainingPayload[key] = val;
      }
    }

    if (spec.requestContentType === 'multipart') {
      const mpMode = spec.multipartMode ?? 'flatFields';
      if (mpMode === 'fileAndJsonData') {
        this._injectContextIntoTarget({
          target: remainingPayload,
          spec,
          carrierType: 'multipartData',
          effectiveIdentity
        });
      }
      const formData = buildMultipartFormData({
        payload: remainingPayload,
        mode: mpMode
      });
      return {
        url: fullUrl.toString(),
        headers,
        body: formData,
        isStreamBody: false
      };
    }

    this._injectContextIntoTarget({
      target: remainingPayload,
      spec,
      carrierType: 'body',
      effectiveIdentity
    });
    headers['content-type'] = headers['content-type'] ?? 'application/json';
    return {
      url: fullUrl.toString(),
      headers,
      body: JSON.stringify(remainingPayload),
      isStreamBody: false
    };
  }

  private async _executeFetchWithRetry({
    spec,
    url,
    headers,
    body,
    isStreamBody,
    requestOptions
  }: {
    spec: OperationSpec;
    url: string;
    headers: Record<string, string>;
    body?: BodyInit;
    isStreamBody: boolean;
    requestOptions?: RequestOptions;
  }): Promise<FetchAttemptLease> {
    const apiKey = await this._resolveApiKey(requestOptions);
    const finalHeaders: Record<string, string> = { ...headers };
    const hasExplicitAuth = hasHeaderIgnoreCase(finalHeaders, 'authorization');

    if (!hasExplicitAuth && apiKey !== undefined && apiKey.length > 0) {
      finalHeaders.authorization = apiKey.startsWith('Bearer ') ? apiKey : `Bearer ${apiKey}`;
    } else if (
      !hasExplicitAuth &&
      spec.path !== '/core/ai/model/list' &&
      !spec.path.startsWith('/system/file/u/')
    ) {
      throw new FastGptAuthError({
        message:
          'Missing FastGPT API Key. Provide "apiKey" in new FastGPT({ apiKey }), RequestOptions, or FASTGPT_API_KEY env var.',
        url
      });
    }

    const timeoutMs = requestOptions?.timeoutMs ?? this._options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const defaultRetries =
      spec.httpMethod === 'GET' ? (this._options.maxRetries ?? DEFAULT_GET_MAX_RETRIES) : 0;
    const maxRetries = isStreamBody ? 0 : (requestOptions?.maxRetries ?? defaultRetries);

    let attempt = 0;
    while (true) {
      const controller = new AbortController();
      let timedOut = false;
      let disposed = false;
      const externalSignal = requestOptions?.signal;

      const onExternalAbort = () => {
        controller.abort(externalSignal?.reason);
      };
      if (externalSignal !== undefined) {
        if (externalSignal.aborted) {
          throw new FastGptError({
            message: 'Request was aborted before execution',
            url,
            cause: externalSignal.reason
          });
        }
        externalSignal.addEventListener('abort', onExternalAbort, { once: true });
      }

      let timeoutTimer: ReturnType<typeof setTimeout> | null =
        timeoutMs > 0
          ? setTimeout(() => {
              timedOut = true;
              controller.abort();
            }, timeoutMs)
          : null;

      const clearTimeoutTimer = (): void => {
        if (timeoutTimer !== null) {
          clearTimeout(timeoutTimer);
          timeoutTimer = null;
        }
      };

      const dispose = (): void => {
        if (disposed) return;
        disposed = true;
        clearTimeoutTimer();
        externalSignal?.removeEventListener('abort', onExternalAbort);
      };

      const attemptStartMs = Date.now();
      const extraSecrets = this._getActiveSecrets(requestOptions);

      try {
        await notifyRequestObservability({
          hooks: this._options.hooks,
          logger: this._logger,
          context: {
            operationId: spec.id,
            method: spec.httpMethod,
            url,
            headers: finalHeaders,
            attempt
          },
          extraSecrets
        });

        const init: RequestInit & { duplex?: 'half' } = {
          method: spec.httpMethod,
          headers: finalHeaders,
          signal: controller.signal,
          ...(body !== undefined ? { body } : {}),
          ...(isStreamBody ? { duplex: 'half' } : {})
        };

        const response = await this._fetchFn(url, init);

        await notifyResponseObservability({
          hooks: this._options.hooks,
          logger: this._logger,
          context: {
            operationId: spec.id,
            method: spec.httpMethod,
            url,
            status: response.status,
            requestId: extractRequestId(response.headers),
            durationMs: Date.now() - attemptStartMs,
            attempt
          },
          extraSecrets
        });

        if (RETRYABLE_HTTP_STATUSES.has(response.status) && attempt < maxRetries) {
          dispose();
          const retryAfterMs = parseRetryAfterMs(response.headers.get('retry-after'));
          const backoffMs =
            retryAfterMs ?? Math.min(300 * 2 ** attempt + Math.floor(Math.random() * 100), 5_000);
          await response.body?.cancel().catch(() => {});
          attempt++;
          await sleepWithSignal(backoffMs, externalSignal);
          continue;
        }

        // 不在拿到响应头时立即清理超时和外部 AbortSignal 监听：
        // - 普通请求由调用方在完整读取响应体后统一 dispose()；
        // - SSE 流式请求在确认流响应后先 clearTimeoutTimer()（仅作握手超时），并把 dispose() 移交给 ChatStream 在流关闭时清理。
        return {
          response,
          controller,
          attempt,
          timeoutMs,
          isTimedOut: () => timedOut,
          isExternalAborted: () => externalSignal?.aborted === true,
          clearTimeoutTimer,
          dispose
        };
      } catch (err) {
        dispose();

        if (timedOut) {
          throw new FastGptTimeoutError({
            message: `Request to ${spec.httpMethod} ${spec.path} timed out after ${timeoutMs}ms`,
            url,
            cause: err
          });
        }

        if (externalSignal?.aborted) {
          throw new FastGptError({
            message: `Request to ${spec.httpMethod} ${spec.path} was aborted`,
            url,
            cause: err
          });
        }

        if (attempt < maxRetries) {
          const backoffMs = Math.min(300 * 2 ** attempt + Math.floor(Math.random() * 100), 5_000);
          attempt++;
          await sleepWithSignal(backoffMs, externalSignal);
          continue;
        }

        throw new FastGptNetworkError({
          message:
            err instanceof Error
              ? `Network request failed: ${err.message}`
              : 'Network request failed',
          url,
          cause: err,
          extraSecrets
        });
      }
    }
  }

  private _wrapBodyAbortError({
    error,
    spec,
    url,
    lease,
    extraSecrets
  }: {
    error: unknown;
    spec: OperationSpec;
    url: string;
    lease: FetchAttemptLease;
    extraSecrets?: ReadonlyArray<string>;
  }): unknown {
    if (error instanceof FastGptError) {
      return error;
    }
    if (lease.isTimedOut()) {
      return new FastGptTimeoutError({
        message: `Request to ${spec.httpMethod} ${spec.path} timed out after ${lease.timeoutMs}ms`,
        url,
        cause: error,
        extraSecrets
      });
    }
    if (lease.isExternalAborted()) {
      return new FastGptError({
        message: `Request to ${spec.httpMethod} ${spec.path} was aborted`,
        url,
        cause: error,
        extraSecrets
      });
    }
    return error;
  }

  private async _throwResponseError({
    response,
    url,
    signal,
    extraSecrets
  }: {
    response: Response;
    url: string;
    signal: AbortSignal;
    extraSecrets?: ReadonlyArray<string>;
  }): Promise<never> {
    const requestId = extractRequestId(response.headers);
    const rawText = await readWithAbortSignal({
      read: () => response.text(),
      signal,
      onAbort: () => {
        void response.body?.cancel().catch(() => {});
      }
    }).catch((err) => {
      if (signal.aborted) {
        throw err;
      }
      return '';
    });

    if (rawText.trim().length > 0) {
      try {
        const parsed = JSON.parse(rawText) as unknown;
        if (isRecord(parsed)) {
          const serverCode = typeof parsed.code === 'number' ? parsed.code : undefined;
          const statusText = typeof parsed.statusText === 'string' ? parsed.statusText : undefined;
          const message = (() => {
            if (typeof parsed.message === 'string' && parsed.message.length > 0) {
              return parsed.message;
            }
            if (isRecord(parsed.error) && typeof parsed.error.message === 'string') {
              return parsed.error.message;
            }
            return statusText ?? `Request failed with HTTP ${response.status}`;
          })();

          throw createMappedApiError({
            message,
            httpStatus: response.status,
            serverCode,
            statusText,
            requestId,
            url,
            extraSecrets
          });
        }
      } catch (innerErr) {
        if (innerErr instanceof FastGptError) {
          throw innerErr;
        }
      }
    }

    throw createMappedApiError({
      message: rawText.slice(0, 300) || `Request failed with HTTP ${response.status}`,
      httpStatus: response.status,
      requestId,
      url,
      extraSecrets
    });
  }

  private _executePreparedRequest<T>({
    spec,
    prepare,
    requestOptions
  }: {
    spec: OperationSpec;
    prepare: (acceptHeader: string) => PreparedHttpCall;
    requestOptions?: RequestOptions;
  }): ApiPromise<T> {
    return new ApiPromise<T>(async (): Promise<WithRawResponseResult<T>> => {
      const startedAt = Date.now();
      let requestUrl = `${this.apiBaseUrl}${spec.path}`;
      let lastAttempt = 0;

      try {
        const acceptHeader = (() => {
          if (spec.responseMode === 'text') return 'text/csv, text/plain, application/json';
          if (spec.responseMode === 'binary') return '*/*';
          return 'application/json';
        })();

        const prepared = prepare(acceptHeader);
        requestUrl = prepared.url;

        const lease = await this._executeFetchWithRetry({
          spec,
          ...prepared,
          requestOptions
        });
        const { response, attempt, controller } = lease;
        lastAttempt = attempt;

        const responseInfo: RawResponseInfo = {
          status: response.status,
          headers: response.headers,
          requestId: extractRequestId(response.headers),
          url: prepared.url
        };

        try {
          if (response.status >= 400) {
            await this._throwResponseError({
              response,
              url: prepared.url,
              signal: controller.signal,
              extraSecrets: this._getActiveSecrets(requestOptions)
            });
          }

          if (spec.responseMode === 'binary') {
            const buffer = await readWithAbortSignal({
              read: () => response.arrayBuffer(),
              signal: controller.signal,
              onAbort: () => {
                void response.body?.cancel().catch(() => {});
              }
            });
            return { data: buffer as T, response: responseInfo };
          }

          if (spec.responseMode === 'text') {
            const text = await readWithAbortSignal({
              read: () => response.text(),
              signal: controller.signal,
              onAbort: () => {
                void response.body?.cancel().catch(() => {});
              }
            });
            return { data: text as T, response: responseInfo };
          }

          const rawText = await readWithAbortSignal({
            read: () => response.text(),
            signal: controller.signal,
            onAbort: () => {
              void response.body?.cancel().catch(() => {});
            }
          });
          if (rawText.trim().length === 0) {
            return { data: undefined as T, response: responseInfo };
          }

          let parsed: unknown;
          try {
            parsed = JSON.parse(rawText);
          } catch {
            if (spec.responseMode === 'void') {
              return { data: undefined as T, response: responseInfo };
            }
            return { data: rawText as T, response: responseInfo };
          }

          if (isRecord(parsed)) {
            const serverCode = typeof parsed.code === 'number' ? parsed.code : undefined;
            if (serverCode !== undefined && serverCode >= 400) {
              const statusText =
                typeof parsed.statusText === 'string' ? parsed.statusText : undefined;
              const message =
                typeof parsed.message === 'string' && parsed.message.length > 0
                  ? parsed.message
                  : (statusText ?? `FastGPT API error (code ${serverCode})`);
              throw createMappedApiError({
                message,
                httpStatus: response.status,
                serverCode,
                statusText,
                requestId: responseInfo.requestId,
                url: prepared.url,
                extraSecrets: this._getActiveSecrets(requestOptions)
              });
            }

            if (spec.responseMode === 'void') {
              return { data: undefined as T, response: responseInfo };
            }

            if (spec.responseMode === 'envelope' && 'code' in parsed && 'data' in parsed) {
              return { data: parsed.data as T, response: responseInfo };
            }
          }

          if (spec.responseMode === 'void') {
            return { data: undefined as T, response: responseInfo };
          }

          return { data: parsed as T, response: responseInfo };
        } catch (bodyErr) {
          throw this._wrapBodyAbortError({
            error: bodyErr,
            spec,
            url: prepared.url,
            lease,
            extraSecrets: this._getActiveSecrets(requestOptions)
          });
        } finally {
          lease.dispose();
        }
      } catch (err) {
        const errorObj =
          err instanceof Error ? err : new FastGptError({ message: String(err), url: requestUrl });
        await notifyErrorObservability({
          hooks: this._options.hooks,
          logger: this._logger,
          context: {
            operationId: spec.id,
            method: spec.httpMethod,
            url: requestUrl,
            durationMs: Date.now() - startedAt,
            attempt: lastAttempt,
            error: errorObj
          },
          extraSecrets: this._getActiveSecrets(requestOptions)
        });
        throw err;
      }
    });
  }

  /**
   * 供生成的 Resource 类调用的统一请求分发入口（返回支持 .withRawResponse() 的 ApiPromise）。
   */
  _request<T>({
    spec,
    rawInput,
    requestOptions
  }: {
    spec: OperationSpec;
    rawInput?: Record<string, unknown>;
    requestOptions?: RequestOptions;
  }): ApiPromise<T> {
    return this._executePreparedRequest<T>({
      spec,
      prepare: (acceptHeader) =>
        this._prepareHttpCall({
          spec,
          rawInput,
          requestOptions,
          acceptHeader
        }),
      requestOptions
    });
  }

  /**
   * 供生成的双模态流式方法（如 completionsV2Stream / resumeStream）调用的 SSE 请求入口。
   */
  async _requestStream({
    spec,
    rawInput,
    requestOptions
  }: {
    spec: OperationSpec;
    rawInput?: Record<string, unknown>;
    requestOptions?: RequestOptions;
  }): Promise<ChatStream> {
    const startedAt = Date.now();
    let requestUrl = `${this.apiBaseUrl}${spec.path}`;
    let lastAttempt = 0;

    try {
      const prepared = this._prepareHttpCall({
        spec,
        rawInput,
        requestOptions,
        acceptHeader: 'text/event-stream'
      });
      requestUrl = prepared.url;

      const lease = await this._executeFetchWithRetry({
        spec,
        ...prepared,
        requestOptions: {
          ...requestOptions,
          maxRetries: requestOptions?.maxRetries ?? 0
        }
      });
      const { response, controller, attempt } = lease;
      lastAttempt = attempt;

      const responseInfo: RawResponseInfo = {
        status: response.status,
        headers: response.headers,
        requestId: extractRequestId(response.headers),
        url: prepared.url
      };

      let handedOffToStream = false;
      try {
        if (response.status >= 400) {
          await this._throwResponseError({
            response,
            url: prepared.url,
            signal: controller.signal,
            extraSecrets: this._getActiveSecrets(requestOptions)
          });
        }

        const contentType = response.headers.get('content-type') ?? '';
        if (contentType.includes('application/json')) {
          // 某些前置校验错误仍可能以 HTTP 200 + { code: 5xx, message } JSON 返回
          const rawText = await readWithAbortSignal({
            read: () => response.text(),
            signal: controller.signal,
            onAbort: () => {
              void response.body?.cancel().catch(() => {});
            }
          });
          try {
            const parsed = JSON.parse(rawText) as unknown;
            if (isRecord(parsed) && typeof parsed.code === 'number' && parsed.code >= 400) {
              throw createMappedApiError({
                message:
                  typeof parsed.message === 'string' && parsed.message.length > 0
                    ? parsed.message
                    : `FastGPT stream error (code ${parsed.code})`,
                httpStatus: response.status,
                serverCode: parsed.code,
                statusText: typeof parsed.statusText === 'string' ? parsed.statusText : undefined,
                requestId: responseInfo.requestId,
                url: prepared.url,
                extraSecrets: this._getActiveSecrets(requestOptions)
              });
            }
          } catch (err) {
            if (err instanceof FastGptError) throw err;
          }
          throw new FastGptError({
            message: `Expected text/event-stream response for ${spec.path}, received ${contentType || 'unknown'}`,
            httpStatus: response.status,
            requestId: responseInfo.requestId,
            url: prepared.url
          });
        }

        if (response.body === null) {
          throw new FastGptError({
            message: `Empty stream body returned from ${spec.path}`,
            httpStatus: response.status,
            requestId: responseInfo.requestId,
            url: prepared.url
          });
        }

        // SSE 握手已完成：清理握手超时计时器，同时将外部 AbortSignal 清理权移交 ChatStream，
        // 使建连后的外部取消仍能直达底层流并在流关闭时释放监听。
        lease.clearTimeoutTimer();
        handedOffToStream = true;
        return new ChatStream({
          body: response.body,
          response: responseInfo,
          controller,
          onDispose: lease.dispose
        });
      } catch (bodyErr) {
        throw this._wrapBodyAbortError({
          error: bodyErr,
          spec,
          url: prepared.url,
          lease,
          extraSecrets: this._getActiveSecrets(requestOptions)
        });
      } finally {
        if (!handedOffToStream) {
          lease.dispose();
        }
      }
    } catch (err) {
      const errorObj =
        err instanceof Error ? err : new FastGptError({ message: String(err), url: requestUrl });
      await notifyErrorObservability({
        hooks: this._options.hooks,
        logger: this._logger,
        context: {
          operationId: spec.id,
          method: spec.httpMethod,
          url: requestUrl,
          durationMs: Date.now() - startedAt,
          attempt: lastAttempt,
          error: errorObj
        },
        extraSecrets: this._getActiveSecrets(requestOptions)
      });
      throw err;
    }
  }

  private _prepareRawHttpCall({
    params,
    requestOptions,
    acceptHeader
  }: {
    params: RawRequestParams;
    requestOptions: RequestOptions | undefined;
    acceptHeader: string;
  }): PreparedHttpCall {
    const normalizedRoutePath = params.path.startsWith('/api/')
      ? params.path.slice(4)
      : params.path.startsWith('/')
        ? params.path
        : `/${params.path}`;

    const fullUrl = new URL(`${this.apiBaseUrl}${normalizedRoutePath}`);
    if (params.query !== undefined) {
      appendQueryParams(fullUrl, params.query);
    }

    const headers: Record<string, string> = {
      accept: acceptHeader,
      'x-fastgpt-client': `fastgpt-js-sdk/${SDK_VERSION}`,
      ...(this._options.defaultHeaders ?? {}),
      ...(requestOptions?.headers ?? {})
    };

    if (params.body === undefined) {
      return { url: fullUrl.toString(), headers, isStreamBody: false };
    }

    if (typeof FormData !== 'undefined' && params.body instanceof FormData) {
      return { url: fullUrl.toString(), headers, body: params.body, isStreamBody: false };
    }

    if (
      params.body instanceof Blob ||
      params.body instanceof ArrayBuffer ||
      params.body instanceof Uint8Array ||
      (typeof ReadableStream !== 'undefined' && params.body instanceof ReadableStream)
    ) {
      const { body, isStream } = toBinaryBodyInit(params.body);
      return { url: fullUrl.toString(), headers, body, isStreamBody: isStream };
    }

    if (!hasHeaderIgnoreCase(headers, 'content-type')) {
      headers['content-type'] = 'application/json';
    }
    return {
      url: fullUrl.toString(),
      headers,
      body: JSON.stringify(params.body),
      isStreamBody: false
    };
  }

  /**
   * 泛化逃生口：在服务端新增接口尚未进入 SDK 生成层时，直接复用 SDK 鉴权、重试与解包能力发起请求；
   * 独立序列化 query 与 body，原样保留 JSON 数组、标量及 query/body 同名字段。
   */
  rawRequest<T = unknown>(params: RawRequestParams, options?: RequestOptions): ApiPromise<T> {
    const spec: OperationSpec = {
      id: `raw.${params.method.toLowerCase()}`,
      httpMethod: params.method,
      path: params.path,
      requestContentType: params.body !== undefined ? 'json' : 'none',
      responseMode: params.responseMode ?? 'envelope',
      appIdCarrier: null,
      identityCarrier: null,
      pathParams: [],
      queryParams: Object.keys(params.query ?? {}),
      bodyParams: []
    };

    return this._executePreparedRequest<T>({
      spec,
      prepare: (acceptHeader) =>
        this._prepareRawHttpCall({
          params,
          requestOptions: options,
          acceptHeader
        }),
      requestOptions: options
    });
  }
}

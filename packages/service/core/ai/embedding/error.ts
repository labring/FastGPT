import OpenAI from '@fastgpt/global/core/ai';
import { ModelErrEnum } from '@fastgpt/global/common/error/code/model';
import { isModelConfigError } from '@fastgpt/global/common/error/model';
import { getErrorMessage } from '@fastgpt/global/common/error/utils';
import { PRIVATE_URL_TEXT } from '../../../common/system/utils';
import { normalizeRelayNoChannelError } from '../../../thirdProvider/aiproxy/error';

export type EmbeddingErrorCategory =
  | 'aborted'
  | 'modelConfig'
  | 'emptyInput'
  | 'privateUrl'
  | 'noAvailableChannel'
  | 'authFailed'
  | 'quotaExceeded'
  | 'permissionDenied'
  | 'modelNotFound'
  | 'contentModeration'
  | 'inputTooLong'
  | 'invalidImage'
  | 'imageDownloadFailed'
  | 'invalidRequest'
  | 'rateLimited'
  | 'timeout'
  | 'upstreamUnavailable'
  | 'networkError'
  | 'invalidResponse'
  | 'unknown';

export type EmbeddingErrorClassification = {
  category: EmbeddingErrorCategory;
  /** 是否允许请求内退避重试及任务队列重试；确定性失败必须为 false。 */
  retryable: boolean;
  /** 上游响应头（Retry-After / retry-after-ms）建议的下次重试等待毫秒数，供队列层接续退避。 */
  retryAfterMs?: number;
  errorCode?: ModelErrEnum;
  upstreamStatus?: number;
  upstreamCode?: string;
  upstreamType?: string;
};

type EmbeddingRequestErrorOptions = EmbeddingErrorClassification & {
  cause?: unknown;
};

/**
 * 归一化后的向量化请求错误。
 * `message` 固定为已登记的 `ModelErrEnum` 机器码，供 `getErrText`、队列错误展示与
 * `processError` 统一映射为多语言用户提示；原始上游异常保存在 `cause` 中供服务端日志排查。
 */
export class EmbeddingRequestError extends Error {
  readonly category: EmbeddingErrorCategory;
  readonly retryable: boolean;
  readonly retryAfterMs?: number;
  readonly errorCode?: ModelErrEnum;
  readonly upstreamStatus?: number;
  readonly upstreamCode?: string;
  readonly upstreamType?: string;

  constructor(message: ModelErrEnum, options: EmbeddingRequestErrorOptions) {
    super(message, options.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = 'EmbeddingRequestError';
    this.category = options.category;
    this.retryable = options.retryable;
    this.retryAfterMs = options.retryAfterMs;
    this.errorCode = options.errorCode ?? message;
    this.upstreamStatus = options.upstreamStatus;
    this.upstreamCode = options.upstreamCode;
    this.upstreamType = options.upstreamType;
  }
}

/**
 * 兼容跨 Next/Turbopack bundle 实例化的 EmbeddingRequestError 识别。
 */
export const isEmbeddingRequestError = (error: unknown): error is EmbeddingRequestError => {
  if (error instanceof EmbeddingRequestError) return true;
  if (typeof error !== 'object' || error === null) return false;
  const record = error as Record<string, unknown>;
  return (
    record.name === 'EmbeddingRequestError' &&
    typeof record.category === 'string' &&
    typeof record.retryable === 'boolean'
  );
};

export const createEmptyInputEmbeddingError = (): EmbeddingRequestError =>
  new EmbeddingRequestError(ModelErrEnum.embeddingEmptyInput, {
    category: 'emptyInput',
    retryable: false,
    errorCode: ModelErrEnum.embeddingEmptyInput
  });

export const createInvalidResponseEmbeddingError = (cause?: unknown): EmbeddingRequestError =>
  new EmbeddingRequestError(ModelErrEnum.invalidResponse, {
    category: 'invalidResponse',
    retryable: true,
    errorCode: ModelErrEnum.invalidResponse,
    cause
  });

type ExtractedErrorSignals = {
  status?: number;
  name?: string;
  upstreamCode?: string;
  upstreamType?: string;
  rawMessage: string;
  /** 去除 OpenAI SDK 自动拼接的前导状态码（如 "400 "）后的错误正文，避免误判内嵌状态码。 */
  payloadText: string;
  combinedText: string;
  codes: Set<string>;
  types: Set<string>;
  names: Set<string>;
};

const TIMEOUT_CODES = new Set([
  'ETIMEDOUT',
  'ECONNABORTED',
  'UND_ERR_CONNECT_TIMEOUT',
  'UND_ERR_HEADERS_TIMEOUT',
  'UND_ERR_BODY_TIMEOUT',
  'ERR_TIMED_OUT'
]);

const TIMEOUT_ERROR_CODES = new Set([
  'timeout',
  'request_timeout',
  'gateway_timeout',
  'deadline_exceeded'
]);

const NETWORK_CODES = new Set([
  'ECONNRESET',
  'ECONNREFUSED',
  'ENOTFOUND',
  'EAI_AGAIN',
  'EHOSTUNREACH',
  'ENETUNREACH',
  'EPIPE',
  'ERR_NETWORK',
  'UND_ERR_SOCKET',
  'UND_ERR_CLOSED',
  'CERT_HAS_EXPIRED',
  'DEPTH_ZERO_SELF_SIGNED_CERT',
  'UNABLE_TO_VERIFY_LEAF_SIGNATURE'
]);

const QUOTA_CODES = new Set([
  'insufficient_quota',
  'insufficient_balance',
  'quota_exceeded',
  'billing_hard_limit_reached',
  'account_overdue',
  'arrears',
  'arrearage'
]);

const RATE_LIMIT_CODES = new Set([
  'rate_limit_exceeded',
  'rate_limit_error',
  'limit_requests',
  'too_many_requests',
  'requests_limit_exceeded',
  'tpm_limit_exceeded',
  'rpm_limit_exceeded'
]);

const AUTH_CODES = new Set([
  'invalid_api_key',
  'authentication_error',
  'unauthorized',
  'invalid_token',
  'expired_api_key'
]);

const CONTENT_BLOCK_CODES = new Set([
  'content_filter',
  'content_policy_violation',
  'data_inspection_failed',
  'moderation_blocked',
  'sensitive_content'
]);

const INPUT_TOO_LONG_CODES = new Set([
  'context_length_exceeded',
  'string_above_max_length',
  'max_tokens_exceeded',
  'input_too_long',
  'request_too_large'
]);

const PERMISSION_CODES = new Set(['permission_denied', 'access_denied', 'forbidden']);

const MODEL_NOT_FOUND_CODES = new Set(['model_not_found', 'not_found_error']);

const NO_AVAILABLE_CHANNEL_CODES = new Set(['no_available_channel', 'channel_not_found']);

// 明确表示请求参数 schema/枚举/类型校验失败的结构化错误码，不会由上游拉图等运行时动作触发。
const EXPLICIT_INVALID_PARAM_CODES = new Set([
  'invalid_value',
  'invalid_type',
  'missing_required_parameter',
  'unknown_parameter'
]);

const STRUCTURED_INVALID_PARAM_CODES = new Set([
  ...EXPLICIT_INVALID_PARAM_CODES,
  'invalid_parameter',
  'invalid_parameter_error',
  'invalid_request_error'
]);

const INVALID_REQUEST_CODES = new Set([
  'badrequest',
  'bad_request',
  ...STRUCTURED_INVALID_PARAM_CODES
]);

const UPSTREAM_UNAVAILABLE_CODES = new Set([
  'internal_error',
  'internal_server_error',
  'service_unavailable',
  'bad_gateway',
  'overloaded',
  'overloaded_error',
  'server_error',
  'temporarily_unavailable',
  'upstream_unavailable'
]);

const UPSTREAM_UNAVAILABLE_TYPES = new Set([
  'server_error',
  'service_unavailable',
  'overloaded_error'
]);

const UPSTREAM_UNAVAILABLE_PATTERN =
  /<!doctype html|<html\b|bad gateway|service unavailable|internal server error|temporarily unavailable|overloaded|no healthy upstream|无健康节点/i;

const recordOf = (value: unknown): Record<string, unknown> =>
  typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};

const readHeaderValue = (headers: unknown, name: string): string | undefined => {
  if (!headers || typeof headers !== 'object') return undefined;
  if ('get' in headers && typeof (headers as { get?: unknown }).get === 'function') {
    const value = (headers as { get: (key: string) => string | null }).get(name);
    return typeof value === 'string' && value.trim() ? value.trim() : undefined;
  }
  const target = name.toLowerCase();
  for (const [key, value] of Object.entries(headers as Record<string, unknown>)) {
    if (key.toLowerCase() === target && typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }
  return undefined;
};

const RETRY_DIRECTIVE_HEADERS = ['x-should-retry', 'retry-after-ms', 'retry-after'] as const;

/** 仅按白名单提取与退避决策相关的响应头，避免把上游 Set-Cookie 等无关或敏感头带入异常链与日志。 */
export const pickEmbeddingRetryHeaders = (headers: unknown): Record<string, string> | undefined => {
  if (!headers) return undefined;
  const picked: Record<string, string> = {};
  for (const name of RETRY_DIRECTIVE_HEADERS) {
    const value = readHeaderValue(headers, name);
    if (value !== undefined) {
      picked[name] = value;
    }
  }
  return Object.keys(picked).length > 0 ? picked : undefined;
};

/**
 * 解析上游响应头中的重试指令（`x-should-retry`、`retry-after-ms`、`Retry-After`）。
 * 上游的等待时间原样传给请求与队列，各自按自己的预算判断何时重试。
 */
export const getEmbeddingRetryDirective = (
  error: unknown
): { allowsRequestRetry: boolean; retryAfterMs?: number } => {
  const original = recordOf(error);
  const headers = original.headers ?? recordOf(original.response).headers;
  if (!headers) {
    return { allowsRequestRetry: true };
  }

  const shouldRetryHeader = readHeaderValue(headers, 'x-should-retry')?.toLowerCase();

  let retryAfterMs: number | undefined;
  const retryAfterMsHeader = readHeaderValue(headers, 'retry-after-ms');
  if (retryAfterMsHeader !== undefined) {
    const parsed = Number(retryAfterMsHeader);
    if (Number.isFinite(parsed) && parsed >= 0) {
      retryAfterMs = parsed;
    }
  }

  if (retryAfterMs === undefined) {
    const retryAfterHeader = readHeaderValue(headers, 'retry-after');
    if (retryAfterHeader !== undefined) {
      const parsedSeconds = Number(retryAfterHeader);
      if (Number.isFinite(parsedSeconds) && parsedSeconds >= 0) {
        retryAfterMs = parsedSeconds * 1000;
      } else {
        const parsedDate = Date.parse(retryAfterHeader);
        if (!Number.isNaN(parsedDate)) {
          retryAfterMs = Math.max(0, parsedDate - Date.now());
        }
      }
    }
  }

  // x-should-retry: false 仅阻止单次请求内继续重试；若同时携带 Retry-After 仍保留退避时长供训练队列接续。
  return { allowsRequestRetry: shouldRetryHeader !== 'false', retryAfterMs };
};

const readHttpStatus = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isInteger(value) && value >= 100 && value <= 599
    ? value
    : undefined;

const readStringField = (value: unknown): string | undefined => {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed ? trimmed : undefined;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }
  return undefined;
};

const stripLeadingStatusPrefix = (message: string, status?: number): string => {
  if (status === undefined) return message;
  const prefix = `${status} `;
  return message.startsWith(prefix) ? message.slice(prefix.length) : message;
};

const extractErrorSignals = (error: unknown): ExtractedErrorSignals => {
  const original = recordOf(error);
  const response = recordOf(original.response);
  const body = recordOf(response.data);
  const bodyError = recordOf(body.error);
  const nestedError = recordOf(original.error);

  const status = readHttpStatus(original.status) ?? readHttpStatus(response.status);
  const name = typeof original.name === 'string' ? original.name : undefined;

  const upstreamCode =
    readStringField(nestedError.code) ??
    readStringField(bodyError.code) ??
    readStringField(original.code) ??
    readStringField(body.code);

  const upstreamType =
    readStringField(nestedError.type) ??
    readStringField(bodyError.type) ??
    readStringField(original.type) ??
    readStringField(body.type);

  const rawMessage =
    typeof error === 'string'
      ? error
      : typeof original.message === 'string'
        ? original.message
        : '';

  const extractedMessage = getErrorMessage(error, rawMessage);
  const strippedMessage = stripLeadingStatusPrefix(extractedMessage, status);

  const codes = new Set<string>();
  const types = new Set<string>();
  const names = new Set<string>();
  const causeMessages: string[] = [];

  const addCode = (value: unknown) => {
    const str = readStringField(value);
    if (str) codes.add(str);
  };
  const addType = (value: unknown) => {
    if (typeof value === 'string' && value.trim()) {
      types.add(value.trim().toLowerCase());
    }
  };

  addCode(original.code);
  addCode(nestedError.code);
  addCode(bodyError.code);
  addCode(body.code);
  addType(original.type);
  addType(nestedError.type);
  addType(bodyError.type);
  addType(body.type);
  if (name) names.add(name);

  // 沿 cause 链向上采集底层网络/安全拦截信息（如 OpenAI SDK 包装的 safeLegacyFetch 异常）。
  const visited = new WeakSet<object>();
  let current: unknown = original.cause;
  let depth = 0;
  while (typeof current === 'object' && current !== null && depth < 5 && !visited.has(current)) {
    visited.add(current);
    const causeRecord = recordOf(current);
    addCode(causeRecord.code);
    addType(causeRecord.type);
    if (typeof causeRecord.name === 'string' && causeRecord.name) {
      names.add(causeRecord.name);
    }
    if (typeof causeRecord.message === 'string' && causeRecord.message.trim()) {
      causeMessages.push(causeRecord.message.trim());
    }
    current = causeRecord.cause;
    depth++;
  }

  const payloadParts = [strippedMessage, ...causeMessages].filter(Boolean);
  const combinedParts = [strippedMessage, rawMessage, ...causeMessages].filter(Boolean);

  return {
    status,
    name,
    upstreamCode,
    upstreamType,
    rawMessage,
    payloadText: payloadParts.join('\n'),
    combinedText: combinedParts.join('\n'),
    codes,
    types,
    names
  };
};

const normalizeCodeKey = (code: string): string =>
  code
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2')
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[-\s]+/g, '_')
    .toLowerCase();

const intersects = (values: Set<string>, targets: Set<string>): boolean => {
  for (const value of values) {
    if (targets.has(value)) return true;
  }
  return false;
};

const isAbortSignals = (signals: ExtractedErrorSignals): boolean =>
  signals.names.has('AbortError') ||
  signals.codes.has('ERR_CANCELED') ||
  signals.codes.has('ABORT_ERR') ||
  signals.rawMessage === 'Request was aborted.';

const timeoutClassification = {
  category: 'timeout',
  retryable: true,
  errorCode: ModelErrEnum.requestTimeout
} as const;
const unavailableClassification = {
  category: 'upstreamUnavailable',
  retryable: true,
  errorCode: ModelErrEnum.serviceUnavailable
} as const;
const invalidRequestClassification = {
  category: 'invalidRequest',
  retryable: false,
  errorCode: ModelErrEnum.invalidRequest
} as const;

/**
 * 对向量化请求异常进行统一分类，区分确定性失败与可重试瞬时故障，
 * 并映射稳定的用户可读错误码，减少上游原生错误直接暴露给终端用户。
 */
export const classifyEmbeddingError = (
  error: unknown,
  options?: { signal?: AbortSignal }
): EmbeddingErrorClassification => {
  if (isEmbeddingRequestError(error)) {
    return {
      category: error.category,
      retryable: error.retryable,
      retryAfterMs: error.retryAfterMs,
      errorCode: error.errorCode,
      upstreamStatus: error.upstreamStatus,
      upstreamCode: error.upstreamCode,
      upstreamType: error.upstreamType
    };
  }

  if (options?.signal?.aborted || error instanceof OpenAI.APIUserAbortError) {
    return {
      category: 'aborted',
      retryable: false
    };
  }

  if (isModelConfigError(error)) {
    return {
      category: 'modelConfig',
      retryable: false,
      errorCode: error.message as ModelErrEnum
    };
  }

  const signals = extractErrorSignals(error);
  if (isAbortSignals(signals)) {
    return {
      category: 'aborted',
      retryable: false
    };
  }

  const codeKeys = new Set(
    Array.from(signals.codes).flatMap((code) => [code.toLowerCase(), normalizeCodeKey(code)])
  );
  const classified = (
    result: Pick<EmbeddingErrorClassification, 'category' | 'retryable' | 'errorCode'>
  ) => ({
    ...result,
    upstreamStatus: signals.status,
    upstreamCode: signals.upstreamCode,
    upstreamType: signals.upstreamType
  });

  if (signals.combinedText.includes(PRIVATE_URL_TEXT)) {
    return classified({
      category: 'privateUrl',
      retryable: false,
      errorCode: ModelErrEnum.privateEndpointBlocked
    });
  }

  if (
    normalizeRelayNoChannelError(error) === ModelErrEnum.noAvailableChannel ||
    intersects(codeKeys, NO_AVAILABLE_CHANNEL_CODES) ||
    intersects(signals.types, NO_AVAILABLE_CHANNEL_CODES) ||
    (signals.status === 404 &&
      /no available channel|无可用渠道|channel not found|channel_not_found/i.test(
        signals.combinedText
      ))
  ) {
    return classified({
      category: 'noAvailableChannel',
      retryable: false,
      errorCode: ModelErrEnum.noAvailableChannel
    });
  }

  // 5xx 服务端异常优先按网关/超时归类，避免响应体内部报错文本（如数据库鉴权失败）被误判为客户端配置错误。
  if (signals.status !== undefined && signals.status >= 500 && signals.status < 600) {
    if (
      signals.status === 504 ||
      /\b(gateway\s+time-?out|request\s+timed?\s*out)\b/i.test(signals.payloadText)
    ) {
      return classified(timeoutClassification);
    }

    return classified(unavailableClassification);
  }

  // 参数校验状态（400/422）或无失败 HTTP 状态码的 2xx 错误体中声明参数错误类型，以及明确参数校验码时，
  // 提前识别参数校验上下文，避免后续超时/拉图/限流/鉴权等宽泛正文正则把回显的参数值误判为运行时故障，
  // 同时保留 HTTP 429/403 携带通用 invalid_request_error 时的欠费正文识别。
  const isParamValidationStatus =
    signals.status === undefined ||
    (signals.status >= 200 && signals.status < 300) ||
    signals.status === 400 ||
    signals.status === 422;
  const isExplicitInvalidParamError = intersects(codeKeys, EXPLICIT_INVALID_PARAM_CODES);
  const isStructuredInvalidRequest =
    isExplicitInvalidParamError ||
    (isParamValidationStatus &&
      (signals.types.has('invalid_request_error') ||
        intersects(codeKeys, STRUCTURED_INVALID_PARAM_CODES)));
  const isParamValidationMessage =
    isStructuredInvalidRequest &&
    /\b(?:unsupported|invalid)\s+(?:value|type|parameter|argument)\b|\bmissing\s+required\s+parameter\b|\bunknown\s+parameter\b|\bunrecognized\s+request\s+argument\b|\badditional\s+properties\s+are\s+not\s+allowed\b/i.test(
      signals.payloadText
    );

  if (
    error instanceof OpenAI.APIConnectionTimeoutError ||
    signals.status === 408 ||
    signals.names.has('TimeoutError') ||
    intersects(signals.codes, TIMEOUT_CODES) ||
    intersects(codeKeys, TIMEOUT_ERROR_CODES) ||
    intersects(signals.types, TIMEOUT_ERROR_CODES) ||
    (!isExplicitInvalidParamError &&
      !isParamValidationMessage &&
      (signals.rawMessage === 'Request timed out.' ||
        ((signals.status === undefined || signals.status >= 500) &&
          /\b(request\s+timed?\s*out|gateway\s+time-?out|connect\s+timeout|headers\s+timeout|body\s+timeout|deadline\s+exceeded)\b/i.test(
            signals.payloadText
          ))))
  ) {
    return classified(timeoutClassification);
  }

  // 上游拉取图片失败常以 HTTP 400 返回，且正文可能内嵌被拉取站点的 401/403/429/500 状态码，
  // 必须先于通用鉴权/限流规则识别，避免把图片地址不可访问误判为模型 API Key 错误。
  // 若已明确属于参数校验码或参数校验提示（如 Unsupported value: '...' for 'encoding_format'），
  // 则跳过拉图正文匹配，避免回显的参数值误触发拉图重试。
  if (
    !isExplicitInvalidParamError &&
    !isParamValidationMessage &&
    /failed to download image|error while downloading (file|image)|multimodal download failure|failed to fetch image|unable to download image|cannot download image|(image|url).*(download|fetch).*(fail|error|timeout|timed?\s*out)|image.*timed?\s*out.*download/i.test(
      signals.payloadText
    )
  ) {
    // 剥离图片 URL 中的路径/参数数字（如 /500/、?w=404），避免干扰真实拉图失败状态码的判断。
    const downloadDetailText = signals.payloadText.replace(/https?:\/\/[^\s'"<>]+/gi, '');
    const isTransientDownloadFailure =
      /\b(429|500|502|503|504)\b|internal server error|bad gateway|service unavailable|gateway timeout|too many requests|timed?\s*out|timeout|temporary|econnreset|connection reset|connection refused|socket/i.test(
        downloadDetailText
      );
    const isPermanentDownloadFailure =
      !isTransientDownloadFailure &&
      /\b(400|401|403|404|410|415|422)\b|not found|forbidden|unauthorized|invalid url|malformed url/i.test(
        downloadDetailText
      );
    const retryable = !isPermanentDownloadFailure;

    return classified({
      category: 'imageDownloadFailed',
      retryable,
      errorCode: ModelErrEnum.imageDownloadFailed
    });
  }

  // 上游额度/余额不足可能随 HTTP 402/403/429 返回，需先于限流与权限不足识别为不可重试。
  if (
    signals.status === 402 ||
    intersects(codeKeys, QUOTA_CODES) ||
    intersects(signals.types, QUOTA_CODES) ||
    (!isStructuredInvalidRequest &&
      /insufficient[_\s-]?quota|insufficient[_\s-]?balance|out of quota|credit balance is too low|exceeded your current quota|billing[_\s-]?(not[_\s-]?active|hard[_\s-]?limit)|account.*(overdue|arrears|suspended|frozen)|余额不足|额度不足|欠费|配额已用尽/i.test(
        signals.payloadText
      ))
  ) {
    return classified({
      category: 'quotaExceeded',
      retryable: false,
      errorCode: ModelErrEnum.upstreamQuotaExceeded
    });
  }

  if (
    signals.status === 429 ||
    intersects(codeKeys, RATE_LIMIT_CODES) ||
    intersects(signals.types, RATE_LIMIT_CODES) ||
    (!isStructuredInvalidRequest &&
      /rate[_\s-]?limit|too many requests|requests? per (min|sec|minute|second)|exceeded.*request limit|速率限制|请求过于频繁|触发限流/i.test(
        signals.payloadText
      ))
  ) {
    return classified({
      category: 'rateLimited',
      retryable: true,
      errorCode: ModelErrEnum.rateLimited
    });
  }

  if (
    signals.status === 401 ||
    intersects(codeKeys, AUTH_CODES) ||
    intersects(signals.types, AUTH_CODES) ||
    (!isStructuredInvalidRequest &&
      /incorrect api key|invalid api[_\s-]?key|invalid authentication|authentication failed|unauthorized|invalid[_\s-]?token|api[_\s-]?key.*(invalid|expired|missing)|鉴权失败|密钥无效/i.test(
        signals.payloadText
      ))
  ) {
    return classified({
      category: 'authFailed',
      retryable: false,
      errorCode: ModelErrEnum.authFailed
    });
  }

  if (
    signals.status === 451 ||
    intersects(codeKeys, CONTENT_BLOCK_CODES) ||
    intersects(signals.types, CONTENT_BLOCK_CODES) ||
    /content[_\s-]?filter|content[_\s-]?management[_\s-]?policy|data[_\s-]?inspection[_\s-]?failed|inappropriate content|violates?.*(safety|usage|content)\s+polic|sensitive content|safety\s+(check|system|policy)|内容安全|敏感内容|违规内容|审核未通过/i.test(
      signals.payloadText
    )
  ) {
    return classified({
      category: 'contentModeration',
      retryable: false,
      errorCode: ModelErrEnum.contentBlocked
    });
  }

  if (
    signals.status === 413 ||
    intersects(codeKeys, INPUT_TOO_LONG_CODES) ||
    intersects(signals.types, INPUT_TOO_LONG_CODES) ||
    /maximum context length|context[_\s-]?length[_\s-]?exceeded|too many tokens|exceeds? (the )?(max(imum)? )?(context|token|input|content|sequence|batch)[_\s-]?(length|size|limit)|range of input length|input (is )?too long|payload too large|request entity too large|token limit|长度超限|超过最大(长度|限制|token)/i.test(
      signals.payloadText
    )
  ) {
    return classified({
      category: 'inputTooLong',
      retryable: false,
      errorCode: ModelErrEnum.inputTooLong
    });
  }

  if (
    /unsupported image|invalid image|image format|corrupt(ed)? image|cannot decode image|decode image|image size|image resolution|image dimensions?|does not support image|multimodal.*not support|image_url.*not support|不支持图片|图片格式/i.test(
      signals.payloadText
    )
  ) {
    return classified({
      category: 'invalidImage',
      retryable: false,
      errorCode: ModelErrEnum.invalidImage
    });
  }

  if (
    signals.status === 403 ||
    intersects(codeKeys, PERMISSION_CODES) ||
    intersects(signals.types, PERMISSION_CODES)
  ) {
    return classified({
      category: 'permissionDenied',
      retryable: false,
      errorCode: ModelErrEnum.permissionDenied
    });
  }

  if (
    signals.status === 404 ||
    intersects(codeKeys, MODEL_NOT_FOUND_CODES) ||
    intersects(signals.types, MODEL_NOT_FOUND_CODES) ||
    (!isStructuredInvalidRequest &&
      /model.*(not found|does not exist|not exist)|no such model|unknown model|模型不存在/i.test(
        signals.payloadText
      ))
  ) {
    return classified({
      category: 'modelNotFound',
      retryable: false,
      errorCode: ModelErrEnum.modelNotFound
    });
  }

  // 明确的结构化服务端瞬时故障码/类型即使被代理包装为 HTTP 400，也先于参数错误与通用 4xx 识别，
  // 避免可恢复的上游波动误判为确定性失败而直接终止训练队列。
  if (
    signals.status === 409 ||
    intersects(codeKeys, UPSTREAM_UNAVAILABLE_CODES) ||
    intersects(signals.types, UPSTREAM_UNAVAILABLE_TYPES)
  ) {
    return classified(unavailableClassification);
  }

  // 明确的结构化参数错误先于宽泛正文匹配，避免参数值本身包含 `overloaded` 等字样时被误判为服务不可用。
  if (signals.types.has('invalid_request_error') || intersects(codeKeys, INVALID_REQUEST_CODES)) {
    return classified(invalidRequestClassification);
  }

  if (UPSTREAM_UNAVAILABLE_PATTERN.test(signals.payloadText)) {
    return classified(unavailableClassification);
  }

  if (signals.status !== undefined && signals.status >= 400 && signals.status < 500) {
    return classified(invalidRequestClassification);
  }

  if (signals.types.has('aiproxy_error') || signals.types.has('upstream_error')) {
    return classified(unavailableClassification);
  }

  if (
    error instanceof OpenAI.APIConnectionError ||
    signals.names.has('APIConnectionError') ||
    intersects(signals.codes, NETWORK_CODES) ||
    /^(connection error\.?|fetch failed)$/i.test(signals.rawMessage.trim()) ||
    /socket hang up|dial tcp|econnreset|econnrefused|enotfound|epipe|tls handshake/i.test(
      signals.combinedText
    )
  ) {
    return classified({
      category: 'networkError',
      retryable: true,
      errorCode: ModelErrEnum.networkError
    });
  }

  if (
    (error instanceof SyntaxError || signals.names.has('SyntaxError')) &&
    /json|unexpected (end|token)/i.test(signals.rawMessage)
  ) {
    return classified({
      category: 'invalidResponse',
      retryable: true,
      errorCode: ModelErrEnum.invalidResponse
    });
  }

  return classified({ category: 'unknown', retryable: true });
};

/** 每次失败只提取一次分类和退避信息，供重试决策、日志与最终错误共用。 */
export const inspectEmbeddingFailure = (error: unknown, signal?: AbortSignal) => {
  const classification = classifyEmbeddingError(error, { signal });
  return {
    error,
    classification,
    retryDirective: classification.retryable ? getEmbeddingRetryDirective(error) : undefined
  };
};

/**
 * 将同一次失败检查的原始异常、分类与退避信息转换为面向业务层的统一错误：
 * - 已识别的已知分类转为携带明确 `ModelErrEnum` 机器码的 `EmbeddingRequestError`；
 * - 主动取消与模型配置错误保留原异常语义；
 * - 无法归类的长尾异常原样兜底透出。
 */
export const normalizeEmbeddingFailure = ({
  error,
  classification,
  retryDirective
}: ReturnType<typeof inspectEmbeddingFailure>): unknown => {
  if (
    isEmbeddingRequestError(error) ||
    classification.category === 'aborted' ||
    classification.category === 'modelConfig' ||
    !classification.errorCode
  ) {
    return error;
  }

  return new EmbeddingRequestError(classification.errorCode, {
    ...classification,
    retryAfterMs: retryDirective?.retryAfterMs ?? classification.retryAfterMs,
    cause: error
  });
};

/** 原始异常入口，先完成一次失败检查再转换，已归一化的业务错误直接复用。 */
export const normalizeEmbeddingError = (
  error: unknown,
  options?: { signal?: AbortSignal }
): unknown =>
  isEmbeddingRequestError(error)
    ? error
    : normalizeEmbeddingFailure(inspectEmbeddingFailure(error, options?.signal));

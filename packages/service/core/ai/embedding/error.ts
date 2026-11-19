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
  /** 是否允许任务队列或上层调用方重试；确定性失败必须为 false。 */
  retryable: boolean;
  /**
   * 是否允许 getVectors 内部短间隔重试。
   * OpenAI SDK 默认已对 408/409/429/5xx/网络连接错误执行 2 次指数退避重试，
   * 对这类错误关闭内层 retryFn 可避免重试放大，仍由队列层按分钟级间隔重试。
   */
  retryInRequest: boolean;
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
  readonly retryInRequest: boolean;
  readonly errorCode?: ModelErrEnum;
  readonly upstreamStatus?: number;
  readonly upstreamCode?: string;
  readonly upstreamType?: string;

  constructor(message: ModelErrEnum, options: EmbeddingRequestErrorOptions) {
    super(message, options.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = 'EmbeddingRequestError';
    this.category = options.category;
    this.retryable = options.retryable;
    this.retryInRequest = options.retryInRequest;
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
    typeof record.retryable === 'boolean' &&
    typeof record.retryInRequest === 'boolean'
  );
};

export const createEmptyInputEmbeddingError = (): EmbeddingRequestError =>
  new EmbeddingRequestError(ModelErrEnum.embeddingEmptyInput, {
    category: 'emptyInput',
    retryable: false,
    retryInRequest: false,
    errorCode: ModelErrEnum.embeddingEmptyInput
  });

export const createInvalidResponseEmbeddingError = (cause?: unknown): EmbeddingRequestError =>
  new EmbeddingRequestError(ModelErrEnum.invalidResponse, {
    category: 'invalidResponse',
    retryable: true,
    retryInRequest: true,
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
  'arrears'
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

const INVALID_REQUEST_CODES = new Set([
  'badrequest',
  'bad_request',
  'invalid_parameter',
  'invalid_parameter_error',
  'invalid_request_error'
]);

const UPSTREAM_UNAVAILABLE_CODES = new Set(['internal_error', 'service_unavailable']);

const recordOf = (value: unknown): Record<string, unknown> =>
  typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};

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

const hasAnyLowercaseCode = (codes: Set<string>, targets: Set<string>): boolean => {
  for (const code of codes) {
    if (targets.has(code.toLowerCase())) return true;
  }
  return false;
};

const hasAnyExactCode = (codes: Set<string>, targets: Set<string>): boolean => {
  for (const code of codes) {
    if (targets.has(code)) return true;
  }
  return false;
};

const hasAnyType = (types: Set<string>, targets: Set<string>): boolean => {
  for (const type of types) {
    if (targets.has(type)) return true;
  }
  return false;
};

/**
 * 判断错误是否为请求被主动取消/中断（例如探活超时取消或调用方终止）。
 * OpenAI SDK 的 APIUserAbortError 未覆写 name，需要同时兜底固定文案与 AbortError。
 */
export const isEmbeddingAbortError = (error: unknown, signal?: AbortSignal): boolean => {
  if (signal?.aborted) return true;
  if (error instanceof OpenAI.APIUserAbortError) return true;
  const signals = extractErrorSignals(error);
  return (
    signals.names.has('AbortError') ||
    signals.codes.has('ERR_CANCELED') ||
    signals.codes.has('ABORT_ERR') ||
    signals.rawMessage === 'Request was aborted.'
  );
};

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
      retryInRequest: error.retryInRequest,
      errorCode: error.errorCode,
      upstreamStatus: error.upstreamStatus,
      upstreamCode: error.upstreamCode,
      upstreamType: error.upstreamType
    };
  }

  if (isEmbeddingAbortError(error, options?.signal)) {
    return {
      category: 'aborted',
      retryable: false,
      retryInRequest: false
    };
  }

  if (isModelConfigError(error)) {
    return {
      category: 'modelConfig',
      retryable: false,
      retryInRequest: false,
      errorCode: error.message as ModelErrEnum
    };
  }

  const signals = extractErrorSignals(error);
  const meta = {
    upstreamStatus: signals.status,
    upstreamCode: signals.upstreamCode,
    upstreamType: signals.upstreamType
  };

  if (signals.combinedText.includes(PRIVATE_URL_TEXT)) {
    return {
      category: 'privateUrl',
      retryable: false,
      retryInRequest: false,
      errorCode: ModelErrEnum.privateEndpointBlocked,
      ...meta
    };
  }

  if (
    error === ModelErrEnum.noAvailableChannel ||
    normalizeRelayNoChannelError(error) === ModelErrEnum.noAvailableChannel ||
    hasAnyLowercaseCode(signals.codes, NO_AVAILABLE_CHANNEL_CODES) ||
    (signals.status === 404 &&
      /no available channel|无可用渠道|channel not found|channel_not_found/i.test(
        signals.combinedText
      ))
  ) {
    return {
      category: 'noAvailableChannel',
      retryable: false,
      retryInRequest: false,
      errorCode: ModelErrEnum.noAvailableChannel,
      ...meta
    };
  }

  // 5xx 服务端异常优先按网关/超时归类，避免响应体内部报错文本（如数据库鉴权失败）被误判为客户端配置错误。
  if (signals.status !== undefined && signals.status >= 500 && signals.status < 600) {
    if (
      signals.status === 504 ||
      /\b(gateway\s+time-?out|request\s+timed?\s*out)\b/i.test(signals.payloadText)
    ) {
      return {
        category: 'timeout',
        retryable: true,
        retryInRequest: false,
        errorCode: ModelErrEnum.requestTimeout,
        ...meta
      };
    }

    return {
      category: 'upstreamUnavailable',
      retryable: true,
      retryInRequest: false,
      errorCode: ModelErrEnum.serviceUnavailable,
      ...meta
    };
  }

  if (
    error instanceof OpenAI.APIConnectionTimeoutError ||
    signals.status === 408 ||
    signals.names.has('TimeoutError') ||
    hasAnyExactCode(signals.codes, TIMEOUT_CODES) ||
    signals.rawMessage === 'Request timed out.' ||
    ((signals.status === undefined || signals.status >= 500) &&
      /\b(request\s+timed?\s*out|gateway\s+time-?out|connect\s+timeout|headers\s+timeout|body\s+timeout|deadline\s+exceeded)\b/i.test(
        signals.payloadText
      ))
  ) {
    return {
      category: 'timeout',
      retryable: true,
      retryInRequest: false,
      errorCode: ModelErrEnum.requestTimeout,
      ...meta
    };
  }

  // 上游拉取图片失败常以 HTTP 400 返回，且正文可能内嵌被拉取站点的 401/403/429/500 状态码，
  // 必须先于通用鉴权/限流规则识别，避免把图片地址不可访问误判为模型 API Key 错误。
  if (
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

    return {
      category: 'imageDownloadFailed',
      retryable,
      // OpenAI SDK 不重试 HTTP 400，瞬时拉图失败允许在 getVectors 内层短重试。
      retryInRequest: retryable,
      errorCode: ModelErrEnum.imageDownloadFailed,
      ...meta
    };
  }

  // 上游额度/余额不足可能随 HTTP 402/403/429 返回，需先于限流与权限不足识别为不可重试。
  if (
    signals.status === 402 ||
    hasAnyLowercaseCode(signals.codes, QUOTA_CODES) ||
    hasAnyType(signals.types, QUOTA_CODES) ||
    /insufficient[_\s-]?quota|insufficient[_\s-]?balance|out of quota|credit balance is too low|exceeded your current quota|billing[_\s-]?(not[_\s-]?active|hard[_\s-]?limit)|account.*(overdue|arrears|suspended|frozen)|余额不足|额度不足|欠费|配额已用尽/i.test(
      signals.payloadText
    )
  ) {
    return {
      category: 'quotaExceeded',
      retryable: false,
      retryInRequest: false,
      errorCode: ModelErrEnum.upstreamQuotaExceeded,
      ...meta
    };
  }

  if (
    signals.status === 429 ||
    hasAnyLowercaseCode(signals.codes, RATE_LIMIT_CODES) ||
    hasAnyType(signals.types, RATE_LIMIT_CODES) ||
    /rate[_\s-]?limit|too many requests|requests? per (min|sec|minute|second)|exceeded.*request limit|速率限制|请求过于频繁|触发限流/i.test(
      signals.payloadText
    )
  ) {
    return {
      category: 'rateLimited',
      retryable: true,
      retryInRequest: false,
      errorCode: ModelErrEnum.rateLimited,
      ...meta
    };
  }

  if (
    signals.status === 401 ||
    hasAnyLowercaseCode(signals.codes, AUTH_CODES) ||
    hasAnyType(signals.types, AUTH_CODES) ||
    /incorrect api key|invalid api[_\s-]?key|invalid authentication|authentication failed|unauthorized|invalid[_\s-]?token|api[_\s-]?key.*(invalid|expired|missing)|鉴权失败|密钥无效/i.test(
      signals.payloadText
    )
  ) {
    return {
      category: 'authFailed',
      retryable: false,
      retryInRequest: false,
      errorCode: ModelErrEnum.authFailed,
      ...meta
    };
  }

  if (
    signals.status === 451 ||
    hasAnyLowercaseCode(signals.codes, CONTENT_BLOCK_CODES) ||
    hasAnyType(signals.types, CONTENT_BLOCK_CODES) ||
    /content[_\s-]?filter|content[_\s-]?management[_\s-]?policy|data[_\s-]?inspection[_\s-]?failed|inappropriate content|violates?.*(safety|usage|content)\s+polic|sensitive content|safety\s+(check|system|policy)|内容安全|敏感内容|违规内容|审核未通过/i.test(
      signals.payloadText
    )
  ) {
    return {
      category: 'contentModeration',
      retryable: false,
      retryInRequest: false,
      errorCode: ModelErrEnum.contentBlocked,
      ...meta
    };
  }

  if (
    signals.status === 413 ||
    hasAnyLowercaseCode(signals.codes, INPUT_TOO_LONG_CODES) ||
    hasAnyType(signals.types, INPUT_TOO_LONG_CODES) ||
    /maximum context length|context[_\s-]?length[_\s-]?exceeded|too many tokens|exceeds? (the )?(max(imum)? )?(context|token|input|content|sequence|batch)[_\s-]?(length|size|limit)|range of input length|input (is )?too long|payload too large|request entity too large|token limit|长度超限|超过最大(长度|限制|token)/i.test(
      signals.payloadText
    )
  ) {
    return {
      category: 'inputTooLong',
      retryable: false,
      retryInRequest: false,
      errorCode: ModelErrEnum.inputTooLong,
      ...meta
    };
  }

  if (
    /unsupported image|invalid image|image format|corrupt(ed)? image|cannot decode image|decode image|image size|image resolution|image dimensions?|does not support image|multimodal.*not support|image_url.*not support|不支持图片|图片格式/i.test(
      signals.payloadText
    )
  ) {
    return {
      category: 'invalidImage',
      retryable: false,
      retryInRequest: false,
      errorCode: ModelErrEnum.invalidImage,
      ...meta
    };
  }

  if (
    signals.status === 403 ||
    hasAnyLowercaseCode(signals.codes, PERMISSION_CODES) ||
    hasAnyType(signals.types, PERMISSION_CODES)
  ) {
    return {
      category: 'permissionDenied',
      retryable: false,
      retryInRequest: false,
      errorCode: ModelErrEnum.permissionDenied,
      ...meta
    };
  }

  if (
    signals.status === 404 ||
    hasAnyLowercaseCode(signals.codes, MODEL_NOT_FOUND_CODES) ||
    hasAnyType(signals.types, MODEL_NOT_FOUND_CODES) ||
    /model.*(not found|does not exist|not exist)|no such model|unknown model|模型不存在/i.test(
      signals.payloadText
    )
  ) {
    return {
      category: 'modelNotFound',
      retryable: false,
      retryInRequest: false,
      errorCode: ModelErrEnum.modelNotFound,
      ...meta
    };
  }

  if (signals.status === 409) {
    return {
      category: 'upstreamUnavailable',
      retryable: true,
      retryInRequest: false,
      errorCode: ModelErrEnum.serviceUnavailable,
      ...meta
    };
  }

  if (
    (signals.status !== undefined && signals.status >= 400 && signals.status < 500) ||
    signals.types.has('invalid_request_error') ||
    hasAnyLowercaseCode(signals.codes, INVALID_REQUEST_CODES)
  ) {
    return {
      category: 'invalidRequest',
      retryable: false,
      retryInRequest: false,
      errorCode: ModelErrEnum.invalidRequest,
      ...meta
    };
  }

  if (
    signals.types.has('aiproxy_error') ||
    signals.types.has('server_error') ||
    signals.types.has('upstream_error') ||
    hasAnyLowercaseCode(signals.codes, UPSTREAM_UNAVAILABLE_CODES) ||
    /<!doctype html|<html\b|bad gateway|service unavailable|internal server error|overloaded|no healthy upstream|无健康节点/i.test(
      signals.payloadText
    )
  ) {
    return {
      category: 'upstreamUnavailable',
      retryable: true,
      retryInRequest: false,
      errorCode: ModelErrEnum.serviceUnavailable,
      ...meta
    };
  }

  if (
    error instanceof OpenAI.APIConnectionError ||
    signals.names.has('APIConnectionError') ||
    hasAnyExactCode(signals.codes, NETWORK_CODES) ||
    /^(connection error\.?|fetch failed)$/i.test(signals.rawMessage.trim()) ||
    /socket hang up|dial tcp|econnreset|econnrefused|enotfound|epipe|tls handshake/i.test(
      signals.combinedText
    )
  ) {
    return {
      category: 'networkError',
      retryable: true,
      retryInRequest: false,
      errorCode: ModelErrEnum.networkError,
      ...meta
    };
  }

  return {
    category: 'unknown',
    retryable: true,
    retryInRequest: true,
    ...meta
  };
};

/**
 * 将向量化原始异常转换为面向业务层的统一错误：
 * - 已识别的已知分类转为携带明确 `ModelErrEnum` 机器码的 `EmbeddingRequestError`；
 * - 主动取消与模型配置错误保留原异常语义；
 * - 无法归类的长尾异常原样兜底透出。
 */
export const normalizeEmbeddingError = (
  error: unknown,
  options?: { signal?: AbortSignal }
): unknown => {
  if (isEmbeddingRequestError(error)) return error;

  const classification = classifyEmbeddingError(error, options);
  if (
    classification.category === 'aborted' ||
    classification.category === 'modelConfig' ||
    !classification.errorCode
  ) {
    return error;
  }

  return new EmbeddingRequestError(classification.errorCode, {
    ...classification,
    cause: error
  });
};

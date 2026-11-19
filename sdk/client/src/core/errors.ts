/**
 * 结构化异常层级与敏感凭据自动脱敏工具。
 *
 * 统一抹平 HTTP 状态码错误、NextAPI 业务包体错误（code >= 400）及 SSE 流内错误帧，
 * 并确保任何异常栈与错误信息中均不泄漏明文 API Key 或一次性上传/下载令牌。
 */

const BEARER_SECRET_RE = /\b(Bearer\s+)([A-Za-z0-9._-]{8,})/gi;
const FASTGPT_KEY_RE = /\b(fastgpt-[A-Za-z0-9_-]{8,})/g;
const QUERY_SECRET_RE = /([?&](?:ticket|token|apiKey)=)([^&#\s]+)/gi;
const UPLOAD_SESSION_PATH_RE = /(\/system\/file\/u\/)([^/?#\s]{8,})/gi;

const maskToken = (secret: string): string => {
  if (secret.length <= 8) return '****';
  return `${secret.slice(0, 4)}****${secret.slice(-4)}`;
};

/**
 * 对错误消息与请求 URL 中的 Bearer 密钥、fastgpt-* Key、上传会话 Token 及敏感查询令牌执行掩码脱敏。
 */
export const redactSecrets = (text: string): string =>
  text
    .replace(
      BEARER_SECRET_RE,
      (_m, prefix: string, secret: string) => `${prefix}${maskToken(secret)}`
    )
    .replace(FASTGPT_KEY_RE, (secret: string) => maskToken(secret))
    .replace(QUERY_SECRET_RE, (_m, prefix: string) => `${prefix}****`)
    .replace(UPLOAD_SESSION_PATH_RE, (_m, prefix: string) => `${prefix}****`);

export type FastGptErrorDetails = {
  message: string;
  httpStatus?: number;
  serverCode?: number;
  statusText?: string;
  requestId?: string | null;
  url?: string;
  cause?: unknown;
};

export class FastGptError extends Error {
  readonly httpStatus?: number;
  readonly serverCode?: number;
  readonly statusText?: string;
  readonly requestId?: string | null;
  readonly url?: string;

  constructor(details: FastGptErrorDetails) {
    super(
      redactSecrets(details.message),
      details.cause !== undefined ? { cause: details.cause } : undefined
    );
    this.name = 'FastGptError';
    this.httpStatus = details.httpStatus;
    this.serverCode = details.serverCode;
    this.statusText = details.statusText;
    this.requestId = details.requestId ?? null;
    this.url = details.url !== undefined ? redactSecrets(details.url) : undefined;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class FastGptAuthError extends FastGptError {
  constructor(details: FastGptErrorDetails) {
    super(details);
    this.name = 'FastGptAuthError';
  }
}

export class FastGptBadRequestError extends FastGptError {
  constructor(details: FastGptErrorDetails) {
    super(details);
    this.name = 'FastGptBadRequestError';
  }
}

export class FastGptNotFoundError extends FastGptError {
  constructor(details: FastGptErrorDetails) {
    super(details);
    this.name = 'FastGptNotFoundError';
  }
}

export class FastGptConflictError extends FastGptError {
  constructor(details: FastGptErrorDetails) {
    super(details);
    this.name = 'FastGptConflictError';
  }
}

export class FastGptRateLimitError extends FastGptError {
  constructor(details: FastGptErrorDetails) {
    super(details);
    this.name = 'FastGptRateLimitError';
  }
}

export class FastGptServerError extends FastGptError {
  constructor(details: FastGptErrorDetails) {
    super(details);
    this.name = 'FastGptServerError';
  }
}

export class FastGptTimeoutError extends FastGptError {
  constructor(details: FastGptErrorDetails) {
    super(details);
    this.name = 'FastGptTimeoutError';
  }
}

export class FastGptNetworkError extends FastGptError {
  constructor(details: FastGptErrorDetails) {
    super(details);
    this.name = 'FastGptNetworkError';
  }
}

const AUTH_STATUS_TEXT_RE = /^unAuth/i;
const NOT_FOUND_STATUS_TEXT_RE = /(?:^unExist|NotFound|not_found)/i;

/**
 * 根据 HTTP 状态码、服务端业务 code 与 statusText 映射具体的异常子类。
 */
export const createMappedApiError = (details: FastGptErrorDetails): FastGptError => {
  const { httpStatus, serverCode, statusText } = details;
  const effectiveCode = serverCode ?? httpStatus ?? 500;

  if (
    httpStatus === 401 ||
    httpStatus === 403 ||
    serverCode === 514 ||
    (statusText !== undefined && AUTH_STATUS_TEXT_RE.test(statusText))
  ) {
    return new FastGptAuthError(details);
  }

  if (httpStatus === 409 || statusText === 'chatIsGenerating') {
    return new FastGptConflictError(details);
  }

  if (httpStatus === 429 || statusText === 'tooManyRequest') {
    return new FastGptRateLimitError(details);
  }

  if (
    httpStatus === 404 ||
    (statusText !== undefined && NOT_FOUND_STATUS_TEXT_RE.test(statusText))
  ) {
    return new FastGptNotFoundError(details);
  }

  if (
    httpStatus === 400 ||
    httpStatus === 406 ||
    httpStatus === 422 ||
    (effectiveCode >= 400 && effectiveCode < 500)
  ) {
    return new FastGptBadRequestError(details);
  }

  return new FastGptServerError(details);
};

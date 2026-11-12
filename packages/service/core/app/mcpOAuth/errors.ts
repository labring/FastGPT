import {
  McpOAuthErrorCodeEnum,
  type McpOAuthErrorCode
} from '@fastgpt/global/core/app/tool/mcpTool/oauth';

/**
 * OAuth 错误码 → HTTP 状态/可重试性（v2.4 §8.3）。
 *
 * 已废弃的旧错误码不得出现在这里；
 * 新增错误码必须先加入 `McpOAuthErrorCodeEnum`，本表用 `satisfies` 保证完整性。
 */
export type McpOAuthErrorMeta = {
  status: number;
  retryable: boolean;
};

export const MCP_OAUTH_ERROR_META = {
  [McpOAuthErrorCodeEnum.disabled]: { status: 403, retryable: false },
  [McpOAuthErrorCodeEnum.notToolset]: { status: 400, retryable: false },
  [McpOAuthErrorCodeEnum.appMissing]: { status: 404, retryable: false },
  [McpOAuthErrorCodeEnum.nodeNotFound]: { status: 400, retryable: false },
  [McpOAuthErrorCodeEnum.nodeAmbiguous]: { status: 400, retryable: false },
  [McpOAuthErrorCodeEnum.nodeTooLarge]: { status: 413, retryable: false },
  [McpOAuthErrorCodeEnum.notOAuthMode]: { status: 400, retryable: false },
  [McpOAuthErrorCodeEnum.urlMismatch]: { status: 400, retryable: false },
  [McpOAuthErrorCodeEnum.stateMissing]: { status: 400, retryable: false },
  [McpOAuthErrorCodeEnum.stateInvalid]: { status: 400, retryable: false },
  [McpOAuthErrorCodeEnum.stateExpired]: { status: 400, retryable: false },
  [McpOAuthErrorCodeEnum.stateReplayed]: { status: 409, retryable: false },
  [McpOAuthErrorCodeEnum.stateCookieMissing]: { status: 400, retryable: false },
  [McpOAuthErrorCodeEnum.stateBindingMismatch]: { status: 400, retryable: false },
  [McpOAuthErrorCodeEnum.stateContextChanged]: { status: 409, retryable: false },
  [McpOAuthErrorCodeEnum.stateStorageFailed]: { status: 503, retryable: true },
  [McpOAuthErrorCodeEnum.discoveryFailed]: { status: 502, retryable: true },
  [McpOAuthErrorCodeEnum.prmResourceMismatch]: { status: 400, retryable: false },
  [McpOAuthErrorCodeEnum.issuerMismatch]: { status: 400, retryable: false },
  [McpOAuthErrorCodeEnum.issuerChanged]: { status: 409, retryable: false },
  [McpOAuthErrorCodeEnum.endpointInsecure]: { status: 400, retryable: false },
  [McpOAuthErrorCodeEnum.privateUrl]: { status: 400, retryable: false },
  [McpOAuthErrorCodeEnum.proxyForbidden]: { status: 400, retryable: false },
  [McpOAuthErrorCodeEnum.responseTooLarge]: { status: 502, retryable: false },
  [McpOAuthErrorCodeEnum.unsupportedFlow]: { status: 400, retryable: false },
  [McpOAuthErrorCodeEnum.cimdUnsupported]: { status: 400, retryable: false },
  [McpOAuthErrorCodeEnum.cimdUnavailable]: { status: 502, retryable: true },
  [McpOAuthErrorCodeEnum.registrationUnsupported]: { status: 400, retryable: false },
  [McpOAuthErrorCodeEnum.registrationRejected]: { status: 400, retryable: false },
  [McpOAuthErrorCodeEnum.registrationFailed]: { status: 502, retryable: true },
  [McpOAuthErrorCodeEnum.clientMissing]: { status: 400, retryable: false },
  [McpOAuthErrorCodeEnum.clientRequired]: { status: 400, retryable: false },
  [McpOAuthErrorCodeEnum.clientRejected]: { status: 401, retryable: false },
  [McpOAuthErrorCodeEnum.pkceUnsupported]: { status: 400, retryable: false },
  [McpOAuthErrorCodeEnum.scopeInvalid]: { status: 400, retryable: false },
  [McpOAuthErrorCodeEnum.scopeWidened]: { status: 400, retryable: false },
  [McpOAuthErrorCodeEnum.accessDenied]: { status: 400, retryable: false },
  [McpOAuthErrorCodeEnum.exchangeFailed]: { status: 502, retryable: true },
  [McpOAuthErrorCodeEnum.tokenPersistFailed]: { status: 503, retryable: true },
  [McpOAuthErrorCodeEnum.reauthRequired]: { status: 401, retryable: false },
  [McpOAuthErrorCodeEnum.insufficientScope]: { status: 403, retryable: false },
  [McpOAuthErrorCodeEnum.refreshTransient]: { status: 503, retryable: true },
  [McpOAuthErrorCodeEnum.clientResetFailed]: { status: 502, retryable: true },
  [McpOAuthErrorCodeEnum.conflict]: { status: 409, retryable: true },
  [McpOAuthErrorCodeEnum.rateLimited]: { status: 429, retryable: true },
  [McpOAuthErrorCodeEnum.internalError]: { status: 500, retryable: true }
} as const satisfies Record<McpOAuthErrorCode, McpOAuthErrorMeta>;

export type McpOAuthApiErrorOptions = {
  message?: string;
  retryAfterMs?: number;
  cause?: unknown;
};

/** 业务错误：`oauthCode` 是稳定契约，`httpStatus` 与 `retryable` 来自错误码表。 */
export class McpOAuthApiError extends Error {
  readonly oauthCode: McpOAuthErrorCode;
  readonly httpStatus: number;
  readonly retryable: boolean;
  readonly retryAfterMs: number | null;

  constructor(code: McpOAuthErrorCode, options: McpOAuthApiErrorOptions = {}) {
    super(options.message ?? code);
    this.name = 'McpOAuthApiError';
    this.oauthCode = code;
    this.httpStatus = MCP_OAUTH_ERROR_META[code].status;
    this.retryable = MCP_OAUTH_ERROR_META[code].retryable;
    this.retryAfterMs = options.retryAfterMs ?? null;
    if (options.cause !== undefined) {
      this.cause = options.cause;
    }
  }
}

export const isMcpOAuthApiError = (error: unknown): error is McpOAuthApiError =>
  error instanceof McpOAuthApiError;

/** 将任意异常收敛为 `mcp_oauth_internal_error`，保留原始异常便于日志定位。 */
export const toMcpOAuthApiError = (error: unknown): McpOAuthApiError => {
  if (isMcpOAuthApiError(error)) return error;
  return new McpOAuthApiError(McpOAuthErrorCodeEnum.internalError, { cause: error });
};

/** 路由统一 envelope；`requestId` 由路由 wrapper 注入。 */
export const toApiError = (
  error: unknown,
  requestId: string
): {
  code: number;
  statusText: 'error';
  message: string;
  data: {
    oauthCode: McpOAuthErrorCode;
    requestId: string;
    retryable: boolean;
    retryAfterMs: number | null;
  };
} => {
  const apiError = toMcpOAuthApiError(error);

  return {
    code: apiError.httpStatus,
    statusText: 'error',
    message: apiError.message,
    data: {
      oauthCode: apiError.oauthCode,
      requestId,
      retryable: apiError.retryable,
      retryAfterMs: apiError.retryAfterMs
    }
  };
};

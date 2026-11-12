/**
 * MCP 鉴权错误与 `WWW-Authenticate` 挑战解析（v2.4 §6.3）。
 *
 * 该模块不依赖 MCP SDK 之外的运行时，供 `core/app/mcp.ts` 抛出、
 * `core/app/mcpOAuth/runtime.ts` 判定，避免两处重复实现 401/403 语义。
 */

export type McpOAuthChallenge = {
  scheme: string;
  /** RFC 6750 `error`，例如 `insufficient_scope`。 */
  error?: string;
  errorDescription?: string;
  scope?: string;
  /** RFC 9728 `resource_metadata`。 */
  resourceMetadata?: string;
  params: Record<string, string>;
};

const MCP_WWW_AUTHENTICATE_MAX_LENGTH = 4096;

/**
 * 解析 `Bearer realm="...", error="insufficient_scope", resource_metadata="..."`。
 * 多挑战场景只取第一个 scheme；非法/超长输入返回 undefined，绝不抛出。
 */
export const parseMcpWWWAuthenticate = (header?: string | null): McpOAuthChallenge | undefined => {
  if (typeof header !== 'string') return undefined;
  const value = header.trim().slice(0, MCP_WWW_AUTHENTICATE_MAX_LENGTH);
  if (!value) return undefined;

  const schemeMatch = /^([^\s,]+)(?:\s+|$)/.exec(value);
  if (!schemeMatch) return undefined;
  const scheme = schemeMatch[1].toLowerCase();

  const params: Record<string, string> = {};
  const paramSource = value.slice(schemeMatch[0].length);
  const paramPattern = /([A-Za-z0-9!#$%&'*+.^_`|~-]+)\s*=\s*("((?:[^"\\]|\\.)*)"|[^,\s]+)/g;
  let match: RegExpExecArray | null;
  while ((match = paramPattern.exec(paramSource))) {
    const key = match[1].toLowerCase();
    const rawValue = match[3] !== undefined ? match[3].replace(/\\(.)/g, '$1') : match[2];
    if (!(key in params)) params[key] = rawValue;
  }

  return {
    scheme,
    ...(params.error ? { error: params.error } : {}),
    ...(params.error_description ? { errorDescription: params.error_description } : {}),
    ...(params.scope ? { scope: params.scope } : {}),
    ...(params.resource_metadata ? { resourceMetadata: params.resource_metadata } : {}),
    params
  };
};

export type McpAuthRequiredErrorOptions = {
  message?: string;
  wwwAuthenticate?: string;
  cause?: unknown;
};

/**
 * 401/403 鉴权失败：保留 HTTP 状态码与 `WWW-Authenticate`，不进入 SSE 回退，
 * 也不包装成 `UserConfigError`（由 OAuth 运行时决定是否刷新重试）。
 */
export class McpAuthRequiredError extends Error {
  readonly code: 401 | 403;
  /** `code` 的别名，兼容按 `status` 读取的调用方。 */
  readonly status: 401 | 403;
  readonly wwwAuthenticate?: string;
  readonly challenge?: McpOAuthChallenge;
  readonly resourceMetadataUrl?: string;

  constructor(code: 401 | 403, options: McpAuthRequiredErrorOptions = {}) {
    super(options.message ?? `MCP server rejected the request with ${code}`);
    this.name = 'McpAuthRequiredError';
    this.code = code;
    this.status = code;
    if (options.wwwAuthenticate) {
      this.wwwAuthenticate = options.wwwAuthenticate.slice(0, MCP_WWW_AUTHENTICATE_MAX_LENGTH);
      this.challenge = parseMcpWWWAuthenticate(this.wwwAuthenticate);
      this.resourceMetadataUrl = this.challenge?.resourceMetadata;
    }
    if (options.cause !== undefined) {
      this.cause = options.cause;
    }
  }
}

/** 读取错误上暴露的 HTTP 状态码（`code`/`status`/`statusCode`），供鉴权判定共用。 */
export const getMcpErrorStatusCode = (error: unknown): number | undefined => {
  if (!error || typeof error !== 'object') return undefined;
  const candidate = error as { code?: unknown; status?: unknown; statusCode?: unknown };
  for (const value of [candidate.code, candidate.status, candidate.statusCode]) {
    if (typeof value === 'number') return value;
  }
  return undefined;
};

/** 是否为 401/403 鉴权错误（不限定错误类，兼容 transport/fetch 包装）。 */
export const isMcpAuthRequiredError = (error: unknown): boolean => {
  const status = getMcpErrorStatusCode(error);
  return status === 401 || status === 403;
};

/** 读取 401/403 错误上的 OAuth 挑战；无 `WWW-Authenticate` 时返回 undefined。 */
export const getMcpOAuthChallenge = (error: unknown): McpOAuthChallenge | undefined => {
  if (error instanceof McpAuthRequiredError) return error.challenge;
  if (!error || typeof error !== 'object') return undefined;
  const header = (error as { wwwAuthenticate?: unknown }).wwwAuthenticate;
  if (typeof header === 'string') return parseMcpWWWAuthenticate(header);
  const challenge = (error as { challenge?: unknown }).challenge;
  if (challenge && typeof challenge === 'object') return challenge as McpOAuthChallenge;
  return undefined;
};

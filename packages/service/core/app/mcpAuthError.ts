/**
 * MCP 鉴权错误与 `WWW-Authenticate` 挑战解析（v2.4 §6.3）。
 *
 * 该模块不依赖 MCP SDK 之外的运行时，供 `core/app/mcp.ts` 抛出、
 * `core/app/mcpOAuth/runtime.ts` 判定，避免两处重复实现 401/403 语义。
 */

import { SseError } from '@modelcontextprotocol/sdk/client/sse.js';
import { StreamableHTTPError } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

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

/** 单个 challenge 的解析上限；超长时只截断当前 challenge，不影响后续挑战。 */
const MCP_WWW_AUTHENTICATE_MAX_LENGTH = 4096;
/** 整条 header 的保留上限（Node 默认 header 上限 16KB，超出会被运行时拒绝）。 */
export const MCP_WWW_AUTHENTICATE_MAX_HEADER_LENGTH = 16 * 1024;

const WWW_AUTHENTICATE_PARAM_PATTERN =
  /([A-Za-z0-9!#$%&'*+.^_`|~-]+)\s*=\s*("((?:[^"\\]|\\.)*)"|[^,\s]+)/g;

/** 按 RFC 7235 拆分多个 challenge；逗号仅在引号外生效，保留 `error_description="a,b"`。 */
const splitWwwAuthenticateChallenges = (value: string): string[] => {
  const challenges: string[] = [];
  let current = '';
  let inQuotes = false;
  let escaped = false;

  for (const char of value) {
    if (escaped) {
      current += char;
      escaped = false;
      continue;
    }
    if (char === '\\' && inQuotes) {
      current += char;
      escaped = true;
      continue;
    }
    if (char === '"') {
      inQuotes = !inQuotes;
      current += char;
      continue;
    }
    if (char === ',' && !inQuotes) {
      challenges.push(current);
      current = '';
      continue;
    }
    current += char;
  }
  challenges.push(current);
  return challenges;
};

/** 以 `token=` 开头的片段属于上一个 challenge 的参数，否则是一个新的 scheme。 */
const isWwwAuthenticateParam = (segment: string) =>
  /^[A-Za-z0-9!#$%&'*+.^_`|~-]+\s*=/.test(segment.trim());

const parseWwwAuthenticateChallenge = (challenge: string): McpOAuthChallenge | undefined => {
  const value = challenge.trim();
  if (!value) return undefined;

  const schemeMatch = /^([^\s,]+)(?:\s+|$)/.exec(value);
  if (!schemeMatch) return undefined;
  const scheme = schemeMatch[1].toLowerCase();

  const params: Record<string, string> = {};
  const paramSource = value.slice(schemeMatch[0].length);
  let match: RegExpExecArray | null;
  WWW_AUTHENTICATE_PARAM_PATTERN.lastIndex = 0;
  while ((match = WWW_AUTHENTICATE_PARAM_PATTERN.exec(paramSource))) {
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

/**
 * 解析 `Bearer realm="...", error="insufficient_scope", resource_metadata="..."`。
 * 多挑战响应按 RFC 7235 拆分，优先返回 Bearer challenge（如
 * `Basic realm="x", Bearer error="insufficient_scope"`）；非法/超长输入返回 undefined，绝不抛出。
 */
export const parseMcpWWWAuthenticate = (header?: string | null): McpOAuthChallenge | undefined => {
  if (typeof header !== 'string') return undefined;
  const value = header.trim().slice(0, MCP_WWW_AUTHENTICATE_MAX_HEADER_LENGTH);
  if (!value) return undefined;

  const challenges: string[] = [];
  let current = '';
  for (const segment of splitWwwAuthenticateChallenges(value)) {
    if (!current) {
      current = segment;
    } else if (isWwwAuthenticateParam(segment)) {
      current += `,${segment}`;
    } else {
      challenges.push(current);
      current = segment;
    }
  }
  if (current) challenges.push(current);

  const parsed = challenges
    // 先拆分再逐个截断：超长的非 Bearer 挑战不能挤掉后面的 Bearer 参数。
    .map((challenge) =>
      parseWwwAuthenticateChallenge(challenge.slice(0, MCP_WWW_AUTHENTICATE_MAX_LENGTH))
    )
    .filter((challenge): challenge is McpOAuthChallenge => challenge !== undefined);
  return parsed.find((challenge) => challenge.scheme === 'bearer') ?? parsed[0];
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
      // 整条 header 先保留到 Node 的 header 上限；截断交给解析器按挑战逐个处理。
      this.wwwAuthenticate = options.wwwAuthenticate.slice(
        0,
        MCP_WWW_AUTHENTICATE_MAX_HEADER_LENGTH
      );
      this.challenge = parseMcpWWWAuthenticate(this.wwwAuthenticate);
      this.resourceMetadataUrl = this.challenge?.resourceMetadata;
    }
    if (options.cause !== undefined) {
      this.cause = options.cause;
    }
  }
}

/**
 * 保留 SSE transport 内部丢弃的 HTTP 状态码（POST 非 2xx 时由 fetch 包装层抛出）。
 * 与 `McpAuthRequiredError` 同属 transport 层，runtime 的鉴权判定只认这些错误类。
 */
export class McpHttpStatusError extends Error {
  constructor(
    readonly code: number,
    statusText?: string,
    readonly responseBody?: string
  ) {
    super(
      `MCP HTTP request failed: ${code}${statusText ? ` ${statusText}` : ''}${
        responseBody ? `: ${responseBody}` : ''
      }`
    );
    this.name = 'McpHttpStatusError';
  }
}

const MCP_TRANSPORT_ERROR_CLASSES = [
  McpAuthRequiredError,
  McpHttpStatusError,
  StreamableHTTPError,
  SseError
] as const;

/**
 * 仅提取 transport 层错误的 HTTP 状态码（含 cause 链）。
 *
 * 工具级错误即使恰好带 `code`/`status: 401` 也只是业务错误：顶层对象刻意不读取任意
 * 状态字段，保证 `mcp.ts` 的错误归一化与 `mcpOAuth/runtime.ts` 的刷新/重授权判定使用同一
 * 语义——只有 transport 的 401/403 才触发 OAuth 刷新。
 *
 * 命中的已知 transport 错误类若 `code` 不是数字（如 SDK 的 `SseError.code` 可为
 * `undefined`），不能立即放弃，而是继续沿 `cause` 链查找（保留原 `getMcpHttpStatus`
 * 语义）。`inTransportChain` 标记当前 cause 处于已知 transport 错误之下：此时读取下层
 * 包装对象的 `code`/`status`/`statusCode` 仍属于 transport 语义；顶层工具错误不受影响。
 */
export const getMcpTransportHttpStatus = (
  error: unknown,
  visited = new Set<unknown>(),
  inTransportChain = false
): number | undefined => {
  if (typeof error !== 'object' || error === null || visited.has(error)) return undefined;
  visited.add(error);

  for (const ErrorClass of MCP_TRANSPORT_ERROR_CLASSES) {
    if (error instanceof ErrorClass) {
      const code = (error as { code?: unknown }).code;
      if (typeof code === 'number') return code;
      // 已知 transport 错误但无数字 code：继续沿 cause 链查找，避免丢状态。
      if (!('cause' in error)) return undefined;
      return getMcpTransportHttpStatus((error as { cause?: unknown }).cause, visited, true);
    }
  }

  const nestedStatus = (candidate: unknown): number | undefined => {
    if (!inTransportChain || typeof candidate !== 'object' || candidate === null) return undefined;
    const status = candidate as { code?: unknown; status?: unknown; statusCode?: unknown };
    for (const value of [status.code, status.status, status.statusCode]) {
      if (typeof value === 'number') return value;
    }
    return undefined;
  };

  const nested = nestedStatus(error);
  if (nested !== undefined) return nested;

  if ('cause' in error) {
    return getMcpTransportHttpStatus(error.cause, visited, inTransportChain);
  }
  return undefined;
};

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

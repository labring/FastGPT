import { StoreSecretValueTypeApiInputSchema } from '@fastgpt/global/common/secret/utils';
import type { HttpToolConfigType } from '@fastgpt/global/core/app/tool/httpTool/type';
import { CliApiError, CliArgumentError, CliError, CliNetworkError } from '../../shared/errors';
import { isPlainObject } from '../../shared/input';

export type HeaderSecretInput = Record<string, { value?: string; secret?: string }>;

export type HeaderSummaryPreview = {
  configured: boolean;
  headerNames: string[];
};

/**
 * 将 `--header-secret` / `--header` JSON 规范化为 FastGPT `StoreSecretValueType`；
 * 同时兼容简洁 `{ "Authorization": "Bearer xxx" }` 与标准 `{ "Authorization": { "value": "Bearer xxx" } }`。
 */
export function normalizeHeaderSecretInput(
  raw: unknown
): ReturnType<typeof StoreSecretValueTypeApiInputSchema.parse> | undefined {
  if (raw === undefined) return undefined;
  if (!isPlainObject(raw)) {
    throw new CliArgumentError(
      'headerSecret must be a JSON object.',
      undefined,
      'Example: --header-secret \'{"Authorization":{"value":"Bearer xxx"}}\' or \'{"Authorization":"Bearer xxx"}\''
    );
  }

  const normalized: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(raw)) {
    const trimmedKey = key.trim();
    if (!trimmedKey) {
      throw new CliArgumentError('headerSecret cannot contain an empty header name.');
    }
    if (typeof val === 'string') {
      normalized[trimmedKey] = { value: val };
    } else {
      normalized[trimmedKey] = val;
    }
  }

  return StoreSecretValueTypeApiInputSchema.parse(normalized);
}

/**
 * 脱敏 `headerSecret` 预览：仅输出是否配置及 header 名称列表，不回显任何凭据值。
 */
export function redactHeaderSecretPreview(
  headerSecret?: Record<string, unknown> | null
): HeaderSummaryPreview | undefined {
  if (!headerSecret) return undefined;
  const headerNames = Object.keys(headerSecret);
  return {
    configured: headerNames.length > 0,
    headerNames
  };
}

/**
 * 脱敏 `customHeaders` 预览（支持 JSON 字符串或键值对象），仅输出是否配置与 header 名称，避免任意自定义认证头泄漏。
 */
export function redactCustomHeadersPreview(
  customHeaders?: string | Record<string, unknown>
): HeaderSummaryPreview | undefined {
  if (customHeaders === undefined) return undefined;
  if (typeof customHeaders === 'string') {
    const trimmed = customHeaders.trim();
    if (!trimmed) {
      return { configured: false, headerNames: [] };
    }
    try {
      const parsed = JSON.parse(trimmed);
      if (isPlainObject(parsed)) {
        const headerNames = Object.keys(parsed);
        return { configured: headerNames.length > 0, headerNames };
      }
    } catch {
      // 非 JSON 字符串时不回显原始内容
    }
    return { configured: true, headerNames: [] };
  }
  const headerNames = Object.keys(customHeaders);
  return {
    configured: headerNames.length > 0,
    headerNames
  };
}

/**
 * 脱敏 `staticHeaders` 预览，仅保留键名，不输出 header 值。
 */
export function redactStaticHeadersPreview(
  staticHeaders?: unknown
): HeaderSummaryPreview | undefined {
  if (!Array.isArray(staticHeaders)) return undefined;
  const headerNames = staticHeaders
    .map((item) => (isPlainObject(item) && typeof item.key === 'string' ? item.key : ''))
    .filter(Boolean);
  return {
    configured: headerNames.length > 0,
    headerNames
  };
}

/**
 * 脱敏 HTTP 子工具列表预览：剥离各子工具内嵌的 `headerSecret` 与 `staticHeaders` 值，仅保留结构摘要。
 */
export function sanitizeHttpToolListPreview(
  toolList: ReadonlyArray<
    Pick<HttpToolConfigType, 'name' | 'path' | 'method' | 'staticHeaders'> & {
      headerSecret?: Record<string, unknown> | null;
    }
  >
): Array<Record<string, unknown>> {
  return toolList.map((tool) => ({
    name: tool.name,
    path: tool.path,
    method: tool.method,
    ...(tool.headerSecret ? { headerSecret: redactHeaderSecretPreview(tool.headerSecret) } : {}),
    ...(tool.staticHeaders && tool.staticHeaders.length > 0
      ? { staticHeaders: redactStaticHeadersPreview(tool.staticHeaders) }
      : {})
  }));
}

/**
 * 判断对象或 JSON 字符串形式的请求头/凭据集合是否包含至少一个非空键。
 */
export function hasSavedCredentials(raw: unknown): boolean {
  if (!raw) return false;
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (!trimmed) return false;
    try {
      const parsed = JSON.parse(trimmed);
      return isPlainObject(parsed) && Object.keys(parsed).length > 0;
    } catch {
      return true;
    }
  }
  if (isPlainObject(raw)) {
    return Object.keys(raw).length > 0;
  }
  return false;
}

/**
 * 判断 `staticHeaders` 列表是否包含至少一个有效请求头项。
 */
export function hasStaticHeaders(raw: unknown): boolean {
  return (
    Array.isArray(raw) &&
    raw.some(
      (item) => isPlainObject(item) && typeof item.key === 'string' && item.key.trim() !== ''
    )
  );
}

/**
 * 判断地址字符串是否以 `http://` 或 `https://` 开头。
 */
export function isAbsoluteHttpUrl(raw: string): boolean {
  return /^https?:\/\//i.test(raw.trim());
}

/**
 * 校验外部工具的目标 HTTP/HTTPS 地址格式，禁止非 http/https 协议或空主机。
 */
export function validateToolEndpointUrl(rawUrl: string, label: string): string {
  const trimmed = rawUrl.trim();
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new CliArgumentError(
      `Invalid ${label}: "${trimmed}".`,
      undefined,
      'Provide a valid http:// or https:// URL.'
    );
  }
  if ((parsed.protocol !== 'http:' && parsed.protocol !== 'https:') || !parsed.hostname) {
    throw new CliArgumentError(
      `Invalid ${label}: "${trimmed}". Only http:// and https:// URLs with a hostname are allowed.`
    );
  }
  return trimmed;
}

/**
 * 校验相对 HTTP 子工具路径，防止通过绝对 URL、协议相对路径或换行字符劫持最终请求目标。
 */
export function validateHttpToolPath(rawPath: string): string {
  const trimmed = rawPath.trim();
  if (!trimmed) {
    throw new CliArgumentError('HTTP tool path is required.', undefined, 'Pass --tool-path.');
  }
  if (
    /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed) ||
    trimmed.startsWith('//') ||
    /[\r\n\\]/.test(trimmed)
  ) {
    throw new CliArgumentError(
      `Invalid HTTP tool path "${trimmed}".`,
      undefined,
      'Pass a relative endpoint path such as "/v1/search" instead of a full URL.'
    );
  }
  return trimmed;
}

/**
 * 计算 HTTP 子工具的实际目标 URL（兼容 OpenAPI 相对路径 + baseUrl，以及 Web 手动工具完整 URL）。
 */
export function resolveHttpToolEffectiveUrl({
  baseUrl,
  toolPath,
  allowAbsoluteWithBaseUrl = false
}: {
  baseUrl?: string;
  toolPath: string;
  allowAbsoluteWithBaseUrl?: boolean;
}): string {
  const trimmedPath = toolPath.trim();
  const trimmedBase = baseUrl?.trim() ?? '';

  if (!trimmedPath) {
    throw new CliArgumentError('HTTP tool path is required.', undefined, 'Pass --tool-path.');
  }
  if (trimmedPath.startsWith('//') || /[\r\n\\]/.test(trimmedPath)) {
    throw new CliArgumentError(`Invalid HTTP tool path "${trimmedPath}".`);
  }

  if (trimmedBase) {
    const validBase = validateToolEndpointUrl(trimmedBase, 'HTTP target URL');
    if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmedPath)) {
      if (!allowAbsoluteWithBaseUrl) {
        validateHttpToolPath(trimmedPath);
      }
      return new URL(validateToolEndpointUrl(trimmedPath, 'HTTP tool URL')).toString();
    }
    const validPath = validateHttpToolPath(trimmedPath);
    return new URL(validPath, validBase).toString();
  }

  return new URL(validateToolEndpointUrl(trimmedPath, 'HTTP tool URL')).toString();
}

/**
 * 比较两个工具端点 URL 是否指向同一授权目标（规范化 origin + pathname + search，忽略末尾斜线差异）。
 */
export function isSameToolEndpoint(urlA: string, urlB: string): boolean {
  try {
    const a = new URL(urlA.trim());
    const b = new URL(urlB.trim());
    const normPathA = a.pathname.replace(/\/+$/, '') || '/';
    const normPathB = b.pathname.replace(/\/+$/, '') || '/';
    return a.origin === b.origin && normPathA === normPathB && a.search === b.search;
  } catch {
    return urlA.trim() === urlB.trim();
  }
}

/**
 * 包装多步写操作中后置步骤异常：
 * - 网络超时/断连（`CliNetworkError`）保留网络错误类别并标记为 `outcome: "unknown"`（`uncertainStep`），避免把服务端可能已提交的写入误报为失败；
 * - 明确的业务/服务端拒绝标记为 `outcome: "failed"`（`failedStep`）。
 */
export function wrapPartialWriteError({
  error,
  operation,
  appId,
  completedSteps,
  step,
  failedHint,
  unknownHint
}: {
  error: unknown;
  operation: string;
  appId: string;
  completedSteps: string[];
  step: string;
  failedHint: string;
  unknownHint: string;
}): CliApiError | CliNetworkError {
  const baseMessage = error instanceof Error ? error.message : String(error);
  const causeDetails = error instanceof CliError ? error.details : undefined;

  if (error instanceof CliNetworkError) {
    return new CliNetworkError(
      `${operation} committed [${completedSteps.join(', ')}] for ${appId}, but step "${step}" lost its response and its outcome is unknown: ${baseMessage}`,
      unknownHint,
      {
        partialSuccess: true,
        outcome: 'unknown',
        appId,
        completedSteps,
        uncertainStep: step,
        ...(causeDetails !== undefined ? { cause: causeDetails } : {})
      }
    );
  }

  const httpStatus = error instanceof CliApiError ? error.httpStatus : undefined;
  const serverCode = error instanceof CliApiError ? error.serverCode : undefined;
  const statusText = error instanceof CliApiError ? error.statusText : undefined;

  return new CliApiError({
    message: `${operation} partially succeeded (${completedSteps.join(', ')} committed for ${appId}), but step "${step}" failed: ${baseMessage}`,
    hint: failedHint,
    httpStatus,
    serverCode,
    statusText,
    details: {
      partialSuccess: true,
      outcome: 'failed',
      appId,
      completedSteps,
      failedStep: step,
      ...(causeDetails !== undefined ? { cause: causeDetails } : {})
    }
  });
}

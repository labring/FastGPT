import { StoreSecretValueTypeApiInputSchema } from '@fastgpt/global/common/secret/utils';
import type { HttpToolConfigType } from '@fastgpt/global/core/app/tool/httpTool/type';
import {
  CliApiError,
  CliArgumentError,
  CliAuthError,
  CliError,
  CliNetworkError
} from '../../shared/errors';
import { isPlainObject } from '../../shared/input';

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
    normalized[trimmedKey] = typeof val === 'string' ? { value: val } : val;
  }

  return StoreSecretValueTypeApiInputSchema.parse(normalized);
}

/**
 * 统一脱敏各类请求头/凭据配置（`headerSecret` 对象、`customHeaders` JSON 字符串/对象、`staticHeaders` 键值数组），
 * 仅输出是否配置及键名列表，不回显任何值。
 */
export function summarizeHeaders(raw: unknown): HeaderSummaryPreview | undefined {
  if (raw === undefined || raw === null) return undefined;

  if (Array.isArray(raw)) {
    const headerNames = raw
      .map((item) => (isPlainObject(item) && typeof item.key === 'string' ? item.key.trim() : ''))
      .filter(Boolean);
    return { configured: headerNames.length > 0, headerNames };
  }

  if (typeof raw === 'string') {
    const trimmed = raw.trim();
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

  if (isPlainObject(raw)) {
    const headerNames = Object.keys(raw);
    return { configured: headerNames.length > 0, headerNames };
  }

  return undefined;
}

/**
 * 判断一个或多个请求头/凭据配置源中是否存在任意已配置项。
 */
export function hasConfiguredHeaders(...sources: unknown[]): boolean {
  return sources.some((source) => summarizeHeaders(source)?.configured === true);
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
    ...(tool.headerSecret ? { headerSecret: summarizeHeaders(tool.headerSecret) } : {}),
    ...(tool.staticHeaders && tool.staticHeaders.length > 0
      ? { staticHeaders: summarizeHeaders(tool.staticHeaders) }
      : {})
  }));
}

/**
 * 判断地址字符串是否以 `http://` 或 `https://` 开头。
 */
export function isAbsoluteHttpUrl(raw: string): boolean {
  return /^https?:\/\//i.test(raw.trim());
}

/**
 * 校验并规范化 HTTP/HTTPS 端点地址；`allowSchemeLess` 用于兼容服务端历史无协议基址（如 `api.example.com:8443/v1`）。
 */
export function parseHttpUrl(
  rawUrl: string,
  label: string,
  options?: { allowSchemeLess?: boolean }
): string {
  const trimmed = rawUrl.trim();
  const candidate =
    options?.allowSchemeLess && trimmed && !/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(trimmed)
      ? `https://${trimmed}`
      : trimmed;

  let parsed: URL;
  try {
    parsed = new URL(candidate);
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
  return candidate;
}

/**
 * 校验相对 HTTP 子工具路径，禁止传入绝对 URL、协议相对路径或换行字符。
 */
export function validateRelativeToolPath(rawPath: string): string {
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
 * 比较两个工具端点是否指向同一目标（规范化 origin + pathname + search，兼容历史无协议基址与末尾斜线差异）。
 */
export function isSameToolEndpoint(urlA: string, urlB: string): boolean {
  try {
    const a = new URL(parseHttpUrl(urlA, 'URL', { allowSchemeLess: true }));
    const b = new URL(parseHttpUrl(urlB, 'URL', { allowSchemeLess: true }));
    const normPathA = a.pathname.replace(/\/+$/, '') || '/';
    const normPathB = b.pathname.replace(/\/+$/, '') || '/';
    return a.origin === b.origin && normPathA === normPathB && a.search === b.search;
  } catch {
    return urlA.trim() === urlB.trim();
  }
}

/**
 * 统一的改址凭据隔离守卫：当调用方修改或覆盖已保存工具集目标地址时，禁止隐式携带旧目标的凭据或请求头。
 */
export function assertCredentialTargetUnchanged({
  fromUrl,
  toUrl,
  hasSavedCredentials,
  hasOverride,
  message,
  hint
}: {
  fromUrl?: string;
  toUrl: string;
  hasSavedCredentials: boolean;
  hasOverride: boolean;
  message: string;
  hint: string;
}): void {
  if (!hasSavedCredentials || hasOverride) return;
  const saved = fromUrl?.trim() ?? '';
  if (!saved || !isSameToolEndpoint(saved, toUrl)) {
    throw new CliArgumentError(message, undefined, hint);
  }
}

/**
 * 统一包装工具集写入步骤（兼容单步与多步写入）：
 * - 明确的前置拒绝且无已提交步骤时直接透传原错误；
 * - 一旦涉及已提交前置步骤，或出现网络/5xx/无效确认等未确认异常（`outcome: "unknown"`），
 *   统一保留 `appId`、已提交步骤（若有）与 `fastgpt <resourceCmd> get <appId>` 核查提示。
 */
export async function runToolWriteStep<T>({
  operation,
  appId,
  resourceCmd,
  completedSteps = [],
  step,
  run
}: {
  operation: string;
  appId: string;
  resourceCmd: string;
  completedSteps?: string[];
  step: string;
  run: () => Promise<T>;
}): Promise<T> {
  try {
    return await run();
  } catch (error) {
    const isClientRejection =
      error instanceof CliArgumentError ||
      error instanceof CliAuthError ||
      (error instanceof CliApiError &&
        error.details?.outcome !== 'unknown' &&
        error.httpStatus !== undefined &&
        error.httpStatus >= 400 &&
        error.httpStatus < 500 &&
        error.httpStatus !== 408);

    if (completedSteps.length === 0 && isClientRejection) {
      throw error;
    }

    const baseMessage = error instanceof Error ? error.message : String(error);
    const causeDetails = error instanceof CliError ? error.details : undefined;
    const outcome = isClientRejection ? 'failed' : 'unknown';
    const hasCompleted = completedSteps.length > 0;
    const hint = hasCompleted
      ? `Steps [${completedSteps.join(', ')}] committed for ${appId}. Run "fastgpt ${resourceCmd} get ${appId}" to inspect authoritative state before retrying.`
      : `Run "fastgpt ${resourceCmd} get ${appId}" to inspect authoritative state before retrying.`;
    const details = {
      ...(hasCompleted ? { partialSuccess: true, completedSteps } : {}),
      outcome,
      appId,
      failedStep: step,
      ...(causeDetails !== undefined ? { cause: causeDetails } : {})
    };
    const prefix = hasCompleted
      ? `${operation} committed [${completedSteps.join(', ')}] for ${appId}, but step "${step}"`
      : `${operation} step "${step}" for ${appId}`;
    const message =
      outcome === 'unknown'
        ? `${prefix} did not return confirmation (outcome unknown): ${baseMessage}`
        : `${prefix} failed: ${baseMessage}`;

    if (error instanceof CliApiError) {
      throw new CliApiError({
        message,
        hint,
        httpStatus: error.httpStatus,
        serverCode: error.serverCode,
        statusText: error.statusText,
        details
      });
    }
    if (!isClientRejection) {
      throw new CliNetworkError(message, hint, details);
    }
    throw new CliApiError({ message, hint, details });
  }
}

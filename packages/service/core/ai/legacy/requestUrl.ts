import { ModelScopeEnum } from '@fastgpt/global/core/ai/constants';
import type { AiproxyScopeModelInput } from '../config';

export type LegacyModelEndpoint = {
  baseUrl: string;
  apiKey?: string;
  authorization?: string;
};

/**
 * 判断模型是否属于系统作用域（兼容未显式设置 scope 的历史模型）。
 * 只有系统模型允许使用自定义的 requestUrl 与 requestAuth。
 */
export const isSystemModel = (modelData?: AiproxyScopeModelInput): boolean => {
  if (!modelData) return true;
  const isSystem = (modelData as { isSystem?: boolean })?.isSystem;
  const scope = (modelData as { scope?: string })?.scope;
  const tmbId = (modelData as { tmbId?: unknown })?.tmbId;

  return Boolean(isSystem || scope === ModelScopeEnum.system || (!tmbId && !scope));
};

/**
 * 提取系统模型配置的 requestUrl 与 requestAuth 直连端点配置（向前兼容）。
 *
 * 仅在满足以下条件时返回有效端点：
 * 1. 属于系统模型（团队模型严格隔离，不开放直接端点入口，必须走 AI Proxy 渠道）；
 * 2. 显式配置了非空的 requestUrl。
 */
export const getLegacyModelEndpoint = (
  modelData?: AiproxyScopeModelInput
): LegacyModelEndpoint | undefined => {
  if (!modelData) return undefined;
  if (!isSystemModel(modelData)) return undefined;

  const rawUrl = (modelData as { requestUrl?: string })?.requestUrl?.trim();
  if (!rawUrl) return undefined;

  const rawAuth = (modelData as { requestAuth?: string })?.requestAuth?.trim();

  return {
    baseUrl: rawUrl,
    apiKey: rawAuth || undefined,
    authorization: rawAuth ? `Bearer ${rawAuth}` : undefined
  };
};

/**
 * 判断模型是否自带独立的直连 requestUrl（自包含端点）。
 */
export const hasLegacyRequestUrl = (modelData?: AiproxyScopeModelInput): boolean =>
  Boolean(getLegacyModelEndpoint(modelData));

export type LegacyOpenAIRequestOptions = {
  path?: string;
  headers?: Record<string, string>;
};

/**
 * 为 OpenAI SDK 调用生成针对 requestUrl 的兼容选项。
 * 若模型配置了有效的 requestUrl 且未走用户 key，则注入 path 覆盖与对应的 Authorization，
 * 且不附带 AI Proxy 路由 Header；未命中时则保留传入的通用 headers。
 */
export const getLegacyOpenAIRequestOptions = ({
  model,
  usedUserOpenAIKey,
  headers,
  scopeHeaders,
  omitEmptyHeaders = false
}: {
  model?: AiproxyScopeModelInput;
  usedUserOpenAIKey?: boolean;
  headers?: Record<string, string>;
  scopeHeaders?: Record<string, string>;
  omitEmptyHeaders?: boolean;
}): LegacyOpenAIRequestOptions => {
  const baseHeaders = headers ?? {};

  // 用户 Key 请求优先于任何模型自带端点配置
  if (usedUserOpenAIKey) {
    return {
      headers: Object.keys(baseHeaders).length > 0 || !omitEmptyHeaders ? baseHeaders : undefined
    };
  }

  const legacyEndpoint = getLegacyModelEndpoint(model);
  if (legacyEndpoint) {
    return {
      path: legacyEndpoint.baseUrl,
      headers: {
        ...baseHeaders,
        ...(legacyEndpoint.authorization ? { Authorization: legacyEndpoint.authorization } : {})
      }
    };
  }

  const mergedHeaders = {
    ...baseHeaders,
    ...(scopeHeaders || {})
  };

  return {
    headers: Object.keys(mergedHeaders).length > 0 || !omitEmptyHeaders ? mergedHeaders : undefined
  };
};

export type LegacyAxiosRequestConfig = {
  url: string;
  headers: Record<string, string>;
};

/**
 * 为 Axios 请求（如 Rerank、STT）解析目标请求 URL 与请求标头（兼容旧 requestUrl）。
 */
export const getLegacyAxiosRequestConfig = ({
  model,
  defaultBaseUrl,
  defaultPath,
  defaultAuthorization,
  headers,
  scopeHeaders
}: {
  model?: AiproxyScopeModelInput;
  defaultBaseUrl: string;
  defaultPath: string;
  defaultAuthorization?: string;
  headers?: Record<string, string>;
  scopeHeaders?: Record<string, string>;
}): LegacyAxiosRequestConfig => {
  const baseHeaders = headers ?? {};
  const legacyEndpoint = getLegacyModelEndpoint(model);

  if (legacyEndpoint) {
    return {
      url: legacyEndpoint.baseUrl,
      headers: {
        ...baseHeaders,
        ...(legacyEndpoint.authorization ? { Authorization: legacyEndpoint.authorization } : {})
      }
    };
  }

  const cleanBase = defaultBaseUrl.replace(/\/+$/, '');
  const cleanPath = defaultPath.replace(/^\/+/, '');
  const url = defaultPath.startsWith('http') ? defaultPath : `${cleanBase}/${cleanPath}`;

  return {
    url,
    headers: {
      ...baseHeaders,
      ...(defaultAuthorization ? { Authorization: defaultAuthorization } : {}),
      ...(scopeHeaders || {})
    }
  };
};

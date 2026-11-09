import type { AiproxyScopeModelInput } from '../config';

export type LegacyModelEndpoint = {
  baseUrl: string;
  apiKey?: string;
  authorization?: string;
};

/**
 * 提取模型配置的 requestUrl 与 requestAuth 直连端点配置（向前兼容）。
 *
 * 系统模型与团队模型均可使用：团队模型的自定义端点属于升级过渡期能力，
 * 命中后直接请求该地址，不携带 AI Proxy 路由/渠道 Header。
 * 仅在显式配置了非空 requestUrl 时返回有效端点。
 */
export const getLegacyModelEndpoint = (
  modelData?: AiproxyScopeModelInput
): LegacyModelEndpoint | undefined => {
  if (!modelData) return undefined;

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
  headers?: Record<string, string | null>;
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
        // 命中自定义端点时显式覆盖 Authorization：
        // 未配置 requestAuth 也必须用 null 清除客户端默认的 AIPROXY_API_TOKEN，
        // 否则会把代理令牌发给用户指定的地址。
        Authorization: legacyEndpoint.authorization ?? null
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

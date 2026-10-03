import OpenAI from '@fastgpt/global/core/ai';
import { type OpenaiAccountType } from '@fastgpt/global/support/user/team/type';
import type { SystemModelDataType } from '@fastgpt/global/core/ai/model/schema';
import { serviceEnv } from '../../env';
import { getMemberGroupId } from './channel/utils';
import { getLegacyOpenAIRequestOptions, getLegacyAxiosRequestConfig } from './legacy/requestUrl';

const aiProxyBaseUrl = serviceEnv.AIPROXY_API_ENDPOINT
  ? `${serviceEnv.AIPROXY_API_ENDPOINT}/v1`
  : undefined;
export const openaiBaseUrl = aiProxyBaseUrl || 'https://api.openai.com/v1';
export const openaiBaseKey = serviceEnv.AIPROXY_API_TOKEN || '';
export const defaultUserOpenAIBaseUrl = 'https://api.openai.com/v1';

export type AIApiRequestMeta = {
  usedUserOpenAIKey: boolean;
  baseUrl?: string;
};

const getUserOpenAIAccount = (userKey?: OpenaiAccountType): OpenaiAccountType | undefined => {
  if (!userKey?.key) return;

  return {
    key: userKey.key,
    baseUrl: userKey.baseUrl || defaultUserOpenAIBaseUrl
  };
};

// 代理走 packages/service/common/proxy/index.ts 里的 EnvHttpProxyAgent + setGlobalDispatcher
export const getAIApi = (props?: {
  userKey?: OpenaiAccountType;
  timeout?: number;
  model?: AiproxyScopeModelInput;
}) => {
  const { userKey, timeout, model } = props || {};
  const userOpenAIAccount = getUserOpenAIAccount(userKey);

  const baseUrl = userOpenAIAccount?.baseUrl || openaiBaseUrl;
  const apiKey = userOpenAIAccount?.key || openaiBaseKey;

  const defaultHeaders = model ? getAiproxyScopeHeaders(model, baseUrl) : undefined;

  return {
    ai: new OpenAI({
      baseURL: baseUrl,
      apiKey,
      timeout,
      maxRetries: 2,
      defaultHeaders:
        defaultHeaders && Object.keys(defaultHeaders).length > 0 ? defaultHeaders : undefined
    }),
    requestMeta: {
      usedUserOpenAIKey: !!userOpenAIAccount,
      baseUrl
    } satisfies AIApiRequestMeta
  };
};

export const getAxiosConfig = (props?: { userKey?: OpenaiAccountType }) => {
  const { userKey } = props || {};
  const userOpenAIAccount = getUserOpenAIAccount(userKey);

  const baseUrl = userOpenAIAccount?.baseUrl || openaiBaseUrl;
  const apiKey = userOpenAIAccount?.key || openaiBaseKey;

  return {
    baseUrl,
    authorization: `Bearer ${apiKey}`
  };
};

/**
 * 为 AI Proxy relay 请求注入路由 scope 请求头：
 * global: 仅路由至系统渠道；own: 仅路由至当前团队成员私有渠道分组。
 */
export type AiproxyScopeModelInput =
  | SystemModelDataType
  | { isSystem?: boolean; tmbId?: string | unknown; scope?: string }
  | undefined;

export const getAiproxyScopeHeaders = (
  modelData: AiproxyScopeModelInput,
  baseUrl: string | undefined
): Record<string, string> => {
  if (!baseUrl || baseUrl !== aiProxyBaseUrl) return {};

  const scope = (modelData as { scope?: string })?.scope;
  const isSystem = (modelData as { isSystem?: boolean })?.isSystem;
  const tmbId = (modelData as { tmbId?: unknown })?.tmbId;

  // System models are served by system channels only (global scope).
  if (isSystem || scope === 'system' || (!tmbId && !scope)) {
    return { 'X-Aiproxy-Group-Channel-Mode': 'global' };
  }

  // Private models are served by their owner's own channels only (own scope).
  // A model without ownership info must not be scoped to any group.
  if (tmbId) {
    return {
      'X-Aiproxy-Group': getMemberGroupId(String(tmbId)),
      'X-Aiproxy-Group-Channel-Mode': 'own'
    };
  }

  return {};
};

/**
 * 统一生成传给 OpenAI SDK 方法的 options（path、Authorization 及 AI Proxy 路由标头）。
 * 内部自动通过 legacy 模块处理系统模型自带的 requestUrl/requestAuth 兼容逻辑。
 */
export const getModelOpenAIOptions = ({
  model,
  userKey,
  baseUrl,
  headers,
  signal,
  maxRetries,
  omitEmptyHeaders
}: {
  model?: AiproxyScopeModelInput;
  userKey?: OpenaiAccountType;
  baseUrl?: string;
  headers?: Record<string, string>;
  signal?: AbortSignal;
  maxRetries?: number;
  omitEmptyHeaders?: boolean;
}) => {
  const userOpenAIAccount = getUserOpenAIAccount(userKey);
  const scopeHeaders = getAiproxyScopeHeaders(model, baseUrl);

  const legacyOptions = getLegacyOpenAIRequestOptions({
    model,
    usedUserOpenAIKey: Boolean(userOpenAIAccount),
    headers,
    scopeHeaders,
    omitEmptyHeaders
  });

  return {
    ...legacyOptions,
    ...(signal ? { signal } : {}),
    ...(maxRetries !== undefined ? { maxRetries } : {})
  };
};

/**
 * 统一生成传给 Axios 方法的目标 URL 与标头（如 Rerank、STT）。
 * 内部自动通过 legacy 模块处理系统模型自带的 requestUrl/requestAuth 兼容逻辑。
 */
export const getModelAxiosConfig = ({
  model,
  defaultPath,
  userKey,
  headers
}: {
  model?: AiproxyScopeModelInput;
  defaultPath: string;
  userKey?: OpenaiAccountType;
  headers?: Record<string, string>;
}) => {
  const axiosConfig = getAxiosConfig({ userKey });
  const scopeHeaders = getAiproxyScopeHeaders(model, axiosConfig.baseUrl);

  return getLegacyAxiosRequestConfig({
    model,
    defaultBaseUrl: axiosConfig.baseUrl,
    defaultPath,
    defaultAuthorization: axiosConfig.authorization,
    headers,
    scopeHeaders
  });
};

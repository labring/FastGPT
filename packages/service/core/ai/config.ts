import OpenAI from '@fastgpt/global/core/ai';
import { stripUrlTrailingSlash } from '@fastgpt/global/common/string/url';
import { type OpenaiAccountType } from '@fastgpt/global/support/user/team/type';
import type { AIModelDataType } from '@fastgpt/global/core/ai/model/schema';
import { isSystemModel } from '@fastgpt/global/core/ai/model/utils';
import { getSystemInstanceConfig } from '../../common/system/systemInstanceConfig/runtime';
import { serviceEnv } from '../../env';
import { getMemberGroupId } from '../../thirdProvider/aiproxy/group';
import { getLegacyOpenAIRequestOptions, getLegacyAxiosRequestConfig } from './legacy/requestUrl';

/**
 * AI Proxy 请求基地址（`${endpoint}/v1`），地址和 Token 都由 ENV 提供。
 *
 * 地址与 Token 都由 ENV 提供；这里仍需保留两个归一化约定：
 *  - 去尾部斜杠：避免 `http://x/` 与 `/v1` 拼成 `http://x//v1`；
 *  - token 去首尾空白：避免粘贴 Key 时带入换行/空格导致鉴权静默失败。
 *  - 以实例配置的 `enabled` 作为准入门槛；迁移任务按 `AIPROXY_API_ENDPOINT` 是否配置写入
 *    `enabled`，因此未安装 AI Proxy 的部署仍会回落到 OpenAI 官方地址。
 */
export const getAiProxyBaseUrl = () => {
  const { enabled } = getSystemInstanceConfig().subservice.aiProxy;
  if (!enabled) return undefined;

  const normalizedEndpoint = stripUrlTrailingSlash(serviceEnv.AIPROXY_API_ENDPOINT ?? '');
  return normalizedEndpoint ? `${normalizedEndpoint}/v1` : undefined;
};

export const getOpenaiBaseUrl = () => {
  return getAiProxyBaseUrl() || 'https://api.openai.com/v1';
};
export const getOpenaiBaseKey = () => {
  const { enabled } = getSystemInstanceConfig().subservice.aiProxy;
  // 地址与凭据必须绑定同一连接配置：禁用或缺少有效代理地址时请求会回落到
  // api.openai.com，此时绝不能携带保留的私有代理 token。
  if (!enabled || !getAiProxyBaseUrl()) return '';
  return serviceEnv.AIPROXY_API_TOKEN?.trim() ?? '';
};
export const defaultUserOpenAIBaseUrl = 'https://api.openai.com/v1';

/** @deprecated 使用 getOpenaiBaseUrl() 动态读取实例配置 */
export const openaiBaseUrl = 'https://api.openai.com/v1';
/** @deprecated 使用 getOpenaiBaseKey() 动态读取实例配置 */
export const openaiBaseKey = '';

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

  const baseUrl = userOpenAIAccount?.baseUrl || getOpenaiBaseUrl();
  const apiKey = userOpenAIAccount?.key || getOpenaiBaseKey();

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

  const baseUrl = userOpenAIAccount?.baseUrl || getOpenaiBaseUrl();
  const apiKey = userOpenAIAccount?.key || getOpenaiBaseKey();

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
  | AIModelDataType
  | { isSystem?: boolean; tmbId?: string | null; scope?: string }
  | undefined;

export const getAiproxyScopeHeaders = (
  modelData: AiproxyScopeModelInput,
  baseUrl: string | undefined
): Record<string, string> => {
  const aiProxyBaseUrl = getAiProxyBaseUrl();
  if (!baseUrl || baseUrl !== aiProxyBaseUrl || !modelData) return {};

  // System models are served by system channels only (global scope).
  if (isSystemModel(modelData)) {
    return { 'X-Aiproxy-Group-Channel-Mode': 'global' };
  }

  // Private models are served by their owner's own channels only (own scope).
  // A model without ownership info must not be scoped to any group.
  if (modelData.tmbId) {
    return {
      'X-Aiproxy-Group': getMemberGroupId(modelData.tmbId),
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

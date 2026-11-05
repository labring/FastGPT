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
 * AI Proxy 请求基地址（`${endpoint}/v1`），来源只有实例配置 subservice.aiProxy.endpoint。
 *
 * 这里保留旧 ENV 链路（`AIPROXY_API_ENDPOINT: UrlSchema`）的两个归一化约定：
 *  - 去尾部斜杠：配置 Schema 的 `urlWithDefault()` 只做 z.url() 校验，不会去掉 `http://x/` 的尾斜杠，
 *    直接拼接会变成 `http://x//v1`，多数网关按不同路由处理，导致全部模型调用 404；
 *  - token 去首尾空白：Admin 粘贴 Key 时极易带上换行/空格，旧 ENV 用 `.trim()` 兜住，
 *    改为 DB 来源后必须在读取时归一，否则鉴权静默失败且难以排查。
 *  - 以 `enabled` 为准入门槛：endpoint 的 Schema 默认值是 `http://localhost:3000`（compose 便利值），
 *    只看 endpoint 会让没装 AI Proxy 的部署把系统模型流量发到本机 3000 端口并用空 Key 鉴权，
 *    永远拿不到 `https://api.openai.com/v1` 兜底。迁移任务按 `AIPROXY_API_ENDPOINT` 是否配置写入
 *    `enabled`，因此以 enabled 判定与旧 ENV 语义一致。
 */
export const getAiProxyBaseUrl = () => {
  const { enabled, endpoint } = getSystemInstanceConfig().subservice.aiProxy;
  if (!enabled) return undefined;

  const normalizedEndpoint = stripUrlTrailingSlash(endpoint);
  return normalizedEndpoint ? `${normalizedEndpoint}/v1` : undefined;
};

export const getOpenaiBaseUrl = () => {
  return getAiProxyBaseUrl() || 'https://api.openai.com/v1';
};
export const getOpenaiBaseKey = () => {
  const { enabled } = getSystemInstanceConfig().subservice.aiProxy;
  // 地址与凭据必须绑定同一启用状态：禁用代理时请求会回落到 api.openai.com，
  // 此时若仍返回保留的代理 token，就会把私有凭据发给外部服务。
  if (!enabled) return '';
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

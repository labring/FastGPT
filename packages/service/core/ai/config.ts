import OpenAI from '@fastgpt/global/core/ai';
import { type OpenaiAccountType } from '@fastgpt/global/support/user/team/type';
import { serviceEnv } from '../../env';
import { getSystemGroupId } from './channel/api';

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
export const getAIApi = (props?: { userKey?: OpenaiAccountType; timeout?: number }) => {
  const { userKey, timeout } = props || {};
  const userOpenAIAccount = getUserOpenAIAccount(userKey);

  const baseUrl = userOpenAIAccount?.baseUrl || openaiBaseUrl;
  const apiKey = userOpenAIAccount?.key || openaiBaseKey;

  return {
    ai: new OpenAI({
      baseURL: baseUrl,
      apiKey,
      timeout,
      maxRetries: 2
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
export const getAiproxyScopeHeaders = (
  modelData: { isSystem?: boolean; tmbId?: string; scope?: string } | undefined,
  baseUrl: string | undefined
): Record<string, string> => {
  if (!baseUrl || baseUrl !== aiProxyBaseUrl) return {};

  // System models are served by system channels only (global scope).
  if (
    modelData?.isSystem ||
    modelData?.scope === 'system' ||
    (!modelData?.tmbId && !modelData?.scope)
  ) {
    return { 'X-Aiproxy-Group-Channel-Mode': 'global' };
  }

  // Private models are served by their owner's own channels only (own scope).
  // A model without ownership info must not be scoped to any group.
  if (modelData?.tmbId) {
    return {
      'X-Aiproxy-Group': getSystemGroupId(String(modelData.tmbId)),
      'X-Aiproxy-Group-Channel-Mode': 'own'
    };
  }

  return {};
};

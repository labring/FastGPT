import OpenAI from '@fastgpt/global/core/ai';
import { type OpenaiAccountType } from '@fastgpt/global/support/user/team/type';
import { serviceEnv } from '../../env';
import { getSystemGroupId } from './channel/const';

const aiProxyBaseUrl = serviceEnv.AIPROXY_API_ENDPOINT
  ? `${serviceEnv.AIPROXY_API_ENDPOINT}/v1`
  : undefined;
export const openaiBaseUrl = aiProxyBaseUrl || serviceEnv.OPENAI_BASE_URL;
export const openaiBaseKey = aiProxyBaseUrl
  ? serviceEnv.AIPROXY_API_TOKEN || serviceEnv.CHAT_API_KEY
  : serviceEnv.CHAT_API_KEY;
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

  const baseUrl = userOpenAIAccount?.baseUrl || global?.systemEnv?.oneapiUrl || openaiBaseUrl;
  const apiKey = userOpenAIAccount?.key || global?.systemEnv?.chatApiKey || openaiBaseKey;

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

  const baseUrl = userOpenAIAccount?.baseUrl || global?.systemEnv?.oneapiUrl || openaiBaseUrl;
  const apiKey = userOpenAIAccount?.key || global?.systemEnv?.chatApiKey || openaiBaseKey;

  return {
    baseUrl,
    authorization: `Bearer ${apiKey}`
  };
};

/**
 * Relay scope headers (design §2.9): aiproxy routes by upstream model name within a
 * scope — `global` = system channels only; `own` = only the channels of the given
 * group (`fastgpt:tmb:<tmbId>`). Header names/values verified against aiproxy source
 * (core/middleware/auth.go: XAiproxyGroup / XAiproxyGroupChannelMode, values own|global).
 *
 * Injected ONLY when the request actually goes to the aiproxy relay (baseUrl matches the
 * configured relay); user-key, oneapi and OPENAI_BASE_URL requests never receive them —
 * those scopes must not be constrained (or are not aiproxy at all).
 */
export const getAiproxyScopeHeaders = (
  modelData: { isSystem?: boolean; tmbId?: string } | undefined,
  baseUrl: string | undefined
): Record<string, string> => {
  if (!baseUrl || baseUrl !== aiProxyBaseUrl) return {};

  // System models are served by system channels only (global scope).
  if (modelData?.isSystem) {
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

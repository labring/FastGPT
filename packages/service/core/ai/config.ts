import OpenAI from '@fastgpt/global/core/ai';
import { type OpenaiAccountType } from '@fastgpt/global/support/user/team/type';
import { serviceEnv } from '../../env';

const aiProxyBaseUrl = serviceEnv.AIPROXY_API_ENDPOINT
  ? `${serviceEnv.AIPROXY_API_ENDPOINT}/v1`
  : undefined;
export const openaiBaseUrl = aiProxyBaseUrl || serviceEnv.OPENAI_BASE_URL;
export const openaiBaseKey = aiProxyBaseUrl
  ? serviceEnv.AIPROXY_API_TOKEN || ''
  : serviceEnv.CHAT_API_KEY;

// 代理走 packages/service/common/proxy/index.ts 里的 EnvHttpProxyAgent + setGlobalDispatcher
export const getAIApi = (props?: { userKey?: OpenaiAccountType; timeout?: number }) => {
  const { userKey, timeout } = props || {};

  const baseUrl = userKey?.baseUrl || global?.systemEnv?.oneapiUrl || openaiBaseUrl;
  const apiKey = userKey?.key || global?.systemEnv?.chatApiKey || openaiBaseKey;
  return new OpenAI({
    baseURL: baseUrl,
    apiKey,
    timeout,
    maxRetries: 2
  });
};

export const getAxiosConfig = (props?: { userKey?: OpenaiAccountType }) => {
  const { userKey } = props || {};

  const baseUrl = userKey?.baseUrl || global?.systemEnv?.oneapiUrl || openaiBaseUrl;
  const apiKey = userKey?.key || global?.systemEnv?.chatApiKey || openaiBaseKey;

  return {
    baseUrl,
    authorization: `Bearer ${apiKey}`
  };
};

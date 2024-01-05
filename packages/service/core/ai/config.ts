import type { UserModelSchema } from '@fastgpt/global/support/user/type';
import OpenAI from '@fastgpt/global/core/ai';

export const openaiBaseUrl = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';
export const baseUrl = process.env.ONEAPI_URL || openaiBaseUrl;

export const systemAIChatKey = process.env.CHAT_API_KEY || '';

export const getAIApi = (props?: UserModelSchema['openaiAccount'], timeout = 60000) => {
  return new OpenAI({
    apiKey: props?.key || systemAIChatKey,
    baseURL: props?.baseUrl || baseUrl,
    httpAgent: global.httpsAgent,
    timeout,
    maxRetries: 2
  });
};

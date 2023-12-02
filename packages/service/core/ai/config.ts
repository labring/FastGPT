import type { UserModelSchema } from '@fastgpt/global/support/user/type';
import OpenAI from '@fastgpt/global/core/ai';

export const openaiBaseUrl = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';
export const baseUrl = process.env.ONEAPI_URL || openaiBaseUrl;

// export const systemAIChatKey = process.env.CHAT_API_KEY || '';
export const systemAIChatKey = process.env.CHAT_API_KEY || process.env.OPENAI_API_KEY || '';

export const getAIApi = (props?: UserModelSchema['openaiAccount'], timeout = 60000) => {
  console.debug('getAIApi> props:%o', props);
  let openaiOption: any = {
    baseURL: props?.baseUrl || baseUrl,
    apiKey: props?.key || systemAIChatKey,
    httpAgent: global.httpsAgent,
    timeout,
    maxRetries: 2
  };
  if (props?.location === 'azure') {
    const apiKey = process.env.AZURE_OPENAI_API_KEY;
    const apiVersion = '2023-07-01-preview';
    const extOpt = {
      defaultQuery: { 'api-version': apiVersion },
      defaultHeaders: { 'api-key': apiKey }
    };
    openaiOption = { ...openaiOption, ...extOpt };
    openaiOption.apiKey = apiKey;
    // delete openaiOption.apiKey;
  }

  console.debug('getAIApi> openaiOption:%o', openaiOption);
  return new OpenAI(openaiOption);
};

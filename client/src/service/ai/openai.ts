import { Configuration, OpenAIApi } from 'openai';

const baseUrl =
  process.env.ONEAPI_URL || process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';

export const getSystemOpenAiKey = () => {
  return process.env.ONEAPI_KEY || process.env.OPENAIKEY || '';
};

export const getOpenAIApi = () => {
  return new OpenAIApi(
    new Configuration({
      basePath: baseUrl
    })
  );
};

/* openai axios config */
export const axiosConfig = () => {
  return {
    baseURL: baseUrl, // 此处仅对非 npm 模块有效
    httpsAgent: global.httpsAgent,
    headers: {
      Authorization: `Bearer ${getSystemOpenAiKey()}`,
      auth: process.env.OPENAI_BASE_URL_AUTH || ''
    }
  };
};

import { serviceEnv } from '../../env';

export const getAIProxyAdminConfig = () => {
  const endpoint = serviceEnv.AIPROXY_API_ENDPOINT;
  const token = serviceEnv.AIPROXY_API_TOKEN?.trim();
  if (!endpoint || !token) {
    throw new Error('AI Proxy endpoint or token is not set');
  }

  return {
    baseUrl: endpoint,
    token
  };
};

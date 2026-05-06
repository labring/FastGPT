import { serviceEnv } from '../../env';

export const aiProxyApiEndpoint = serviceEnv.AIPROXY_API_ENDPOINT;
export const aiProxyApiToken = serviceEnv.AIPROXY_API_TOKEN;

export const hasAIProxyApiEndpoint = () => !!aiProxyApiEndpoint;

export const getAIProxyAdminConfig = () => {
  if (!aiProxyApiEndpoint || !aiProxyApiToken) {
    throw new Error('AI Proxy endpoint or token is not set');
  }

  return {
    baseUrl: aiProxyApiEndpoint,
    token: aiProxyApiToken
  };
};

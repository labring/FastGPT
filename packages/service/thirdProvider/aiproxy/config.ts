import { serviceEnv } from '../../env';

export const aiProxyApiEndpoint = serviceEnv.AIPROXY_API_ENDPOINT;
export const aiProxyApiToken = serviceEnv.AIPROXY_API_TOKEN;

/** AI Proxy 是启动必填依赖；保留布尔查询供现有前端配置契约使用。 */
export const hasAIProxyApiEndpoint = () => true;

export const getAIProxyAdminConfig = () => {
  if (!aiProxyApiEndpoint || !aiProxyApiToken) {
    throw new Error('AI Proxy endpoint or token is not set');
  }

  return {
    baseUrl: aiProxyApiEndpoint,
    token: aiProxyApiToken
  };
};

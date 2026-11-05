import { getSystemInstanceConfig } from '../../common/system/systemInstanceConfig/runtime';
import { serviceEnv } from '../../env';

export const getAIProxyAdminConfig = () => {
  const { endpoint } = getSystemInstanceConfig().subservice.aiProxy;
  const token = serviceEnv.AIPROXY_API_TOKEN?.trim();
  if (!endpoint || !token) {
    throw new Error('AI Proxy endpoint or token is not set');
  }

  return {
    baseUrl: endpoint,
    token
  };
};

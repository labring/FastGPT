import { getSystemInstanceConfig } from '../../common/system/systemInstanceConfig/runtime';

export const getAIProxyAdminConfig = () => {
  const { endpoint, token } = getSystemInstanceConfig().subservice.aiProxy;
  if (!endpoint || !token) {
    throw new Error('AI Proxy endpoint or token is not set');
  }

  return {
    baseUrl: endpoint,
    token
  };
};

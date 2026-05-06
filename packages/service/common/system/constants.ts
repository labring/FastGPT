import { serviceEnv } from '../../env';

export const FastGPTProUrl = serviceEnv.PRO_URL ? `${serviceEnv.PRO_URL}/api` : '';
export const FastGPTPluginUrl = serviceEnv.PLUGIN_BASE_URL ?? '';
// @ts-ignore
export const isFastGPTProService = () => !!global.systemConfig;

export const isProVersion = () => {
  return !!global.feConfigs?.isPlus;
};

export const serviceRequestMaxContentLength =
  serviceEnv.SERVICE_REQUEST_MAX_CONTENT_LENGTH * 1024 * 1024;

export const InitialErrorEnum = {
  S3_ERROR: 's3_error',
  MONGO_ERROR: 'mongo_error',
  REDIS_ERROR: 'redis_error',
  VECTORDB_ERROR: 'vectordb_error',
  PLUGIN_ERROR: 'plugin_error',
  PRO_ERROR: 'pro_error',
  SANDBOX_ERROR: 'code_sandbox_error',
  MCP_SERVER_ERROR: 'mcp_server_error'
};

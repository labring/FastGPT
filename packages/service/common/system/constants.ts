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

/**
 * 共享 axios 实例的默认响应体上限（解压后字节数），仅作用于缓冲型响应。
 *
 * axios 默认不限制响应大小，且会自动解压并完整缓冲响应体；请求攻击者控制的
 * URL 时，gzip 炸弹可以按约 1000 倍放大占用内存。流式下载不受该默认值影响，
 * 由调用方或业务层配额限制；调用方也可以按请求显式覆盖 maxContentLength。
 */
export const serviceAxiosMaxContentLength =
  serviceEnv.SERVICE_AXIOS_MAX_CONTENT_LENGTH * 1024 * 1024;

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

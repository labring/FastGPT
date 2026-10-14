import { getSystemInstanceConfig } from './systemInstanceConfig/controller';
import { serviceEnv } from '../../env';

export const FastGPTProUrl = serviceEnv.PRO_URL ? `${serviceEnv.PRO_URL}/api` : '';
export const FastGPTPluginUrl = serviceEnv.PLUGIN_BASE_URL ?? '';
// @ts-ignore
export const isFastGPTProService = () => !!global.systemConfig;

export const isProVersion = () => {
  return !!global.feConfigs?.isPlus;
};

export const getServiceRequestMaxContentLength = () =>
  (getSystemInstanceConfig().resource.serviceRequestMaxContentLength ??
    serviceEnv.SERVICE_REQUEST_MAX_CONTENT_LENGTH) *
  1024 *
  1024;

/**
 * 媒体是否需要在服务端转 base64（兼容不支持远程 URL 的模型）。
 * 实例配置 feature.multipleDataToBase64 为权威来源；快照叶子缺省时回落 env
 * （仅测试种子快照场景）。统一 helper 防止各消费点写法漂移。
 */
export const getMultipleDataToBase64 = () =>
  getSystemInstanceConfig().feature.multipleDataToBase64 ?? serviceEnv.MULTIPLE_DATA_TO_BASE64;

/**
 * 密码登录/验证短信的每分钟限流次数。
 * 实例配置 security.passwordLoginMinuteLimitCount 为权威来源；快照叶子缺省时回落 env。
 * create/consume 两处限流与改密接口共用本 helper，避免同一配置多处读取漂移。
 */
export const getPasswordLoginMinuteLimitCount = () =>
  getSystemInstanceConfig().security.passwordLoginMinuteLimitCount ??
  serviceEnv.PASSWORD_LOGIN_MINUTE_LIMIT_COUNT;

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

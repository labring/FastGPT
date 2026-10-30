import { getSystemInstanceConfig } from './systemInstanceConfig/controller';
import { logInstanceConfigRead } from './migrationCoverageLog';
import { serviceEnv } from '../../env';

export const FastGPTProUrl = serviceEnv.PRO_URL ? `${serviceEnv.PRO_URL}/api` : '';
export const FastGPTPluginUrl = serviceEnv.PLUGIN_BASE_URL ?? '';
// @ts-ignore
export const isFastGPTProService = () => !!global.systemConfig;

export const isProVersion = () => {
  return !!global.feConfigs?.isPlus;
};

export const getServiceRequestMaxContentLength = () => {
  const configured = getSystemInstanceConfig().resource.serviceRequestMaxContentLength;
  const value = configured ?? serviceEnv.SERVICE_REQUEST_MAX_CONTENT_LENGTH;
  logInstanceConfigRead({
    callsite: 'runtime.common.system.constants.getServiceRequestMaxContentLength',
    source: configured === undefined ? 'env-fallback' : 'instance-config',
    fields: [{ path: 'resource.serviceRequestMaxContentLength', value: configured ?? value }]
  });
  return value * 1024 * 1024;
};

/**
 * 媒体是否需要在服务端转 base64（兼容不支持远程 URL 的模型）。
 * 实例配置 feature.multipleDataToBase64 为权威来源；快照叶子缺省时回落 env
 * （仅测试种子快照场景）。统一 helper 防止各消费点写法漂移。
 */
export const getMultipleDataToBase64 = () => {
  const configured = getSystemInstanceConfig().feature.multipleDataToBase64;
  const value = configured ?? serviceEnv.MULTIPLE_DATA_TO_BASE64;
  logInstanceConfigRead({
    callsite: 'runtime.common.system.constants.getMultipleDataToBase64',
    source: configured === undefined ? 'env-fallback' : 'instance-config',
    fields: [{ path: 'feature.multipleDataToBase64', value: configured ?? value }]
  });
  return value;
};

/**
 * 密码登录/验证短信的每分钟限流次数。
 * 实例配置 security.passwordLoginMinuteLimitCount 为权威来源；快照叶子缺省时回落 env。
 * create/consume 两处限流与改密接口共用本 helper，避免同一配置多处读取漂移。
 */
export const getPasswordLoginMinuteLimitCount = () => {
  const configured = getSystemInstanceConfig().security.passwordLoginMinuteLimitCount;
  const value = configured ?? serviceEnv.PASSWORD_LOGIN_MINUTE_LIMIT_COUNT;
  logInstanceConfigRead({
    callsite: 'runtime.common.system.constants.getPasswordLoginMinuteLimitCount',
    source: configured === undefined ? 'env-fallback' : 'instance-config',
    fields: [{ path: 'security.passwordLoginMinuteLimitCount', value: configured ?? value }]
  });
  return value;
};

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

import { getSystemInstanceConfig } from './systemInstanceConfig/runtime';
import { logInstanceConfigRead } from './migrationCoverageLog';
import { serviceEnv } from '../../env';

export const FastGPTProUrl = serviceEnv.PRO_URL ? `${serviceEnv.PRO_URL}/api` : '';
/** @deprecated 插件地址已由实例配置 subservice.plugin 管理 */
export const FastGPTPluginUrl = '';
// @ts-ignore
export const isFastGPTProService = () => !!global.systemConfig;

export const isProVersion = () => {
  return !!global.feConfigs?.isPlus;
};

/**
 * 工作流 HTTP 节点的响应体大小上限（MB → 字节），按解压后的大小计算。
 * 不限制服务端接收的请求体或节点发出的请求体。
 * 实例配置 resource.serviceRequestMaxContentLength 是唯一运行时来源；ENV 只在启动迁移时 seed。
 */
export const getServiceRequestMaxContentLength = () => {
  const value = getSystemInstanceConfig().resource.serviceRequestMaxContentLength;
  logInstanceConfigRead({
    callsite: 'runtime.common.system.constants.getServiceRequestMaxContentLength',
    fields: [{ path: 'resource.serviceRequestMaxContentLength', value }]
  });
  return value * 1024 * 1024;
};

/**
 * 媒体是否需要在服务端转 base64（兼容不支持远程 URL 的模型）。
 * 统一 helper 防止各消费点写法漂移；来源只有实例配置。
 */
export const getMultipleDataToBase64 = () => {
  const value = getSystemInstanceConfig().feature.multipleDataToBase64;
  logInstanceConfigRead({
    callsite: 'runtime.common.system.constants.getMultipleDataToBase64',
    fields: [{ path: 'feature.multipleDataToBase64', value }]
  });
  return value;
};

/**
 * 密码登录/验证短信的每分钟限流次数。
 * create/consume 两处限流与改密接口共用本 helper，避免同一配置多处读取漂移。
 */
export const getPasswordLoginMinuteLimitCount = () => {
  const value = getSystemInstanceConfig().security.passwordLoginMinuteLimitCount;
  logInstanceConfigRead({
    callsite: 'runtime.common.system.constants.getPasswordLoginMinuteLimitCount',
    fields: [{ path: 'security.passwordLoginMinuteLimitCount', value }]
  });
  return value;
};

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

import { serviceEnv } from '../../env';
import { getSystemInstanceConfig } from '../system/systemInstanceConfig/controller';

export const MIN_BACKEND_FILE_OPERATION_TIMEOUT_SECONDS = 600;

/**
 * 获取后端文件读取和解析使用的有效总 timeout。
 *
 * 实例配置 performance.parse.fileTimeoutSeconds 是权威来源；快照叶子缺省时
 * （启动早期/测试种子）回落环境变量。HTTP provider 和外部文件流至少保留
 * 10 分钟等待时间，避免较小的配置反向缩短已有行为。
 */
export const getBackendFileOperationTimeoutMs = () => {
  const configuredTimeoutSeconds =
    getSystemInstanceConfig().performance.parse.fileTimeoutSeconds ??
    serviceEnv.PARSE_FILE_TIMEOUT_SECONDS;

  return Math.max(MIN_BACKEND_FILE_OPERATION_TIMEOUT_SECONDS, configuredTimeoutSeconds) * 1000;
};

import { getSystemInstanceConfig } from '../system/systemInstanceConfig/runtime';

export const MIN_BACKEND_FILE_OPERATION_TIMEOUT_SECONDS = 600;

/**
 * 获取后端文件读取和解析使用的有效总 timeout。
 *
 * 实例配置 performance.parse.fileTimeoutSeconds 是唯一运行时来源（ENV 只在启动
 * 迁移时 seed）。HTTP provider 和外部文件流至少保留 10 分钟等待时间，避免较小
 * 的配置反向缩短已有行为。
 */
export const getBackendFileOperationTimeoutMs = () => {
  const configuredTimeoutSeconds =
    getSystemInstanceConfig().performance.parse.fileTimeoutSeconds ??
    MIN_BACKEND_FILE_OPERATION_TIMEOUT_SECONDS;

  return Math.max(MIN_BACKEND_FILE_OPERATION_TIMEOUT_SECONDS, configuredTimeoutSeconds) * 1000;
};

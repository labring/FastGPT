import { serviceEnv } from '../../env';

export const MIN_BACKEND_FILE_OPERATION_TIMEOUT_SECONDS = 600;

/**
 * 获取后端文件读取和解析使用的有效总 timeout。
 *
 * 文件解析 worker 继续使用原始环境变量值；HTTP provider 和外部文件流
 * 至少保留 10 分钟的等待时间，避免较小的 worker 配置反向缩短已有行为。
 */
export const getBackendFileOperationTimeoutMs = () =>
  Math.max(MIN_BACKEND_FILE_OPERATION_TIMEOUT_SECONDS, serviceEnv.PARSE_FILE_TIMEOUT_SECONDS) *
  1000;

import { ModelErrEnum } from '@fastgpt/global/common/error/code/model';
import { getErrText } from '@fastgpt/global/common/error/utils';

/** 判断是否为 AI Proxy 404 / 资源不存在错误 */
export const isAiproxyNotFoundError = (error: unknown): boolean => {
  const status =
    (error as { status?: number })?.status ??
    (error as { response?: { status?: number } })?.response?.status;
  if (status === 404) return true;
  if (status === 500) {
    const msg =
      (error as { message?: string })?.message ??
      (error as { response?: { data?: { message?: string } } })?.response?.data?.message ??
      '';
    if (/record not found/i.test(msg)) return true;
  }
  return false;
};

/**
 * 执行 AI Proxy 请求，资源不存在（404）时返回 fallback，其余错误原样抛出。
 * 用于「桶尚未创建 / 渠道已被删除」这类应按空结果处理的读取场景。
 */
export const tolerateNotFound = async <T, F = undefined>(
  fetch: () => Promise<T>,
  fallback?: F
): Promise<T | F | undefined> => {
  try {
    return await fetch();
  } catch (error) {
    if (isAiproxyNotFoundError(error)) return fallback;
    throw error;
  }
};

/** 将 relay 的“无可用渠道”响应转换为统一模型错误。 */
export const normalizeRelayNoChannelError = <T>(error: T): T | ModelErrEnum => {
  const status =
    (error as { status?: number; response?: { status?: number } })?.status ??
    (error as { status?: number; response?: { status?: number } })?.response?.status;
  if (
    status === 404 &&
    /no available channel|无可用渠道|channel not found|channel_not_found/i.test(getErrText(error))
  ) {
    return ModelErrEnum.noAvailableChannel;
  }
  return error;
};

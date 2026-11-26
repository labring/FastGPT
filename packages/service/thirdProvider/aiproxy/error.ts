import { ModelErrEnum } from '@fastgpt/global/common/error/code/model';
import { getErrText } from '@fastgpt/global/common/error/utils';
import { isAxiosError } from 'axios';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

/** 判断是否为 AI Proxy 404 / 资源不存在错误 */
export const isAiproxyNotFoundError = (error: unknown): boolean => {
  if (!isRecord(error)) return false;

  const response = isRecord(error.response) ? error.response : undefined;
  const status = error.status ?? response?.status;
  if (status !== 500) return status === 404;

  // 分组渠道详情在响应体中返回具体原因，优先读取该字段。
  const data = response?.data;
  const message = (isRecord(data) ? data.message : undefined) ?? error.message;
  return typeof message === 'string' && /record not found/i.test(message);
};

/** 识别 AIProxy 未实现接口的 HTTP 响应，保留传输层原始异常。 */
export const isAiproxyNotImplementedError = (error: unknown): boolean =>
  isAxiosError(error) && (error.response?.status ?? error.status) === 501;

/**
 * 执行 AI Proxy 请求，资源不存在时返回 fallback，其余错误原样抛出。
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

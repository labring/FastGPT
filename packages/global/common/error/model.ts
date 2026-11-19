import { ModelErrEnum } from './code/model';
import { UserError } from './utils';

export const NON_RETRYABLE_MODEL_ERROR_CODES: ReadonlySet<string> = new Set<ModelErrEnum>([
  ModelErrEnum.unExist,
  ModelErrEnum.unConfigured,
  ModelErrEnum.noAvailableChannel,
  ModelErrEnum.teamModelDisabled,
  ModelErrEnum.embeddingEmptyInput,
  ModelErrEnum.privateEndpointBlocked,
  ModelErrEnum.authFailed,
  ModelErrEnum.upstreamQuotaExceeded,
  ModelErrEnum.permissionDenied,
  ModelErrEnum.modelNotFound,
  ModelErrEnum.contentBlocked,
  ModelErrEnum.inputTooLong,
  ModelErrEnum.invalidImage,
  ModelErrEnum.invalidRequest
]);

/**
 * 判断模型未配置、下架、停用或类型不匹配等配置错误。
 * 只识别业务 UserError 的稳定机器码，不匹配展示文案，也不把普通请求异常作为配置错误。
 */
export const isModelConfigError = (error: unknown): error is UserError =>
  error instanceof UserError &&
  (error.message === ModelErrEnum.unExist || error.message === ModelErrEnum.unConfigured);

/**
 * 判断模型或向量化调用错误是否属于确定性失败（重试无法恢复）。
 * 优先尊重分类错误对象上显式携带的 retryable 标记（兼容跨 bundle 序列化与动态可重试场景），
 * 再按稳定机器码识别配置错误与永久性模型错误。
 */
export const isNonRetryableModelError = (error: unknown): boolean => {
  if (typeof error === 'object' && error !== null) {
    const record = error as { name?: unknown; retryable?: unknown; message?: unknown };
    if (record.name === 'EmbeddingRequestError' && typeof record.retryable === 'boolean') {
      return !record.retryable;
    }
    if (isModelConfigError(error)) {
      return true;
    }
    return (
      typeof record.message === 'string' && NON_RETRYABLE_MODEL_ERROR_CODES.has(record.message)
    );
  }

  return typeof error === 'string' && NON_RETRYABLE_MODEL_ERROR_CODES.has(error);
};

/**
 * 读取模型错误上附带的上游建议重试等待毫秒数（兼容跨 bundle 序列化）。
 * 仅对可重试错误返回有限非负数值，确定性失败始终返回 undefined。
 */
export const getModelErrorRetryDelayMs = (error: unknown): number | undefined => {
  if (typeof error !== 'object' || error === null || isNonRetryableModelError(error)) {
    return undefined;
  }
  const retryAfterMs = (error as { retryAfterMs?: unknown }).retryAfterMs;
  return typeof retryAfterMs === 'number' && Number.isFinite(retryAfterMs) && retryAfterMs >= 0
    ? retryAfterMs
    : undefined;
};

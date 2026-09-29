import { ModelErrEnum } from '@fastgpt/global/common/error/code/model';
import { getErrText } from '@fastgpt/global/common/error/utils';

/** 将 AI Proxy HTTP 错误转换为 FastGPT 渠道领域错误。 */
export const normalizeAiproxyError = (error: unknown): ModelErrEnum | string => {
  const status = (error as { response?: { status?: number } })?.response?.status;
  if (status === 404) return ModelErrEnum.channelNotExist;
  if (status === 401 || status === 403) return ModelErrEnum.unAuthChannel;
  if (
    status === 500 &&
    /record not found/i.test(
      (error as { response?: { data?: { message?: string } } })?.response?.data?.message ?? ''
    )
  ) {
    return ModelErrEnum.channelNotExist;
  }
  return getErrText(error, ModelErrEnum.unExist);
};

/** 以 Promise rejection 形式抛出统一转换后的 AI Proxy 错误。 */
export const rejectNormalizedAiproxyError = (error: unknown): Promise<never> =>
  Promise.reject(normalizeAiproxyError(error));

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

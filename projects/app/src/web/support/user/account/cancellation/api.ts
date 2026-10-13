import { DELETE, GET, POST } from '@/web/common/api/request';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import type {
  AccountCancellationStatusResponse,
  CreateAccountCancellationVerificationBody,
  CreateAccountCancellationVerificationResponse,
  SubmitAccountCancellationBody,
  SubmitAccountCancellationResponse
} from '@fastgpt/global/openapi/support/user/account/cancellation/api';

/**
 * 查询商业版账号注销状态。社区版没有对应路由，在客户端边界直接返回不可申请状态，
 * 避免请求落到未配置的 proApi 代理并产生无意义报错。
 */
export const getAccountCancellationStatus = () => {
  if (!useSystemStore.getState().feConfigs.isPlus) {
    return Promise.resolve<AccountCancellationStatusResponse>({
      status: 'none',
      canRequestCancellation: false,
      maskedAccount: ''
    });
  }

  return GET<AccountCancellationStatusResponse>(
    '/proApi/support/user/account/cancellation/status',
    {},
    { maxQuantity: 1 }
  );
};

export const createAccountCancellationVerification = (
  body: CreateAccountCancellationVerificationBody
) =>
  POST<CreateAccountCancellationVerificationResponse>(
    '/proApi/support/user/account/cancellation/verification/create',
    body
  );

export const submitAccountCancellation = (body: SubmitAccountCancellationBody) =>
  POST<SubmitAccountCancellationResponse>('/proApi/support/user/account/cancellation/submit', body);

export const cancelAccountCancellation = () =>
  DELETE('/proApi/support/user/account/cancellation/cancel');

import { DELETE, GET, POST } from '@/web/common/api/request';
import type {
  AccountCancellationStatusResponse,
  CreateAccountCancellationVerificationBody,
  CreateAccountCancellationVerificationResponse,
  SubmitAccountCancellationBody,
  SubmitAccountCancellationResponse
} from '@fastgpt/global/openapi/support/user/account/cancellation/api';

export const getAccountCancellationStatus = () =>
  GET<AccountCancellationStatusResponse>(
    '/proApi/support/user/account/cancellation/status',
    {},
    { maxQuantity: 1 }
  );

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

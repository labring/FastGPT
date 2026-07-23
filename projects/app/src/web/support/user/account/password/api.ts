import { POST } from '@/web/common/api/request';
import { hashStr } from '@fastgpt/global/common/string/tools';
import type {
  CreatePasswordVerificationBody,
  CreatePasswordVerificationResponse,
  PasswordAuthorizationBody,
  PasswordAuthorizationResponse,
  UpdatePasswordResponse
} from '@fastgpt/global/openapi/support/user/account/password/api';

export const createPasswordVerification = (body: CreatePasswordVerificationBody) =>
  POST<CreatePasswordVerificationResponse>(
    '/proApi/support/user/account/password/verification/create',
    body
  );

export const authorizePasswordChange = (body: PasswordAuthorizationBody) =>
  POST<PasswordAuthorizationResponse>('/proApi/support/user/account/password/authorization', body);

/** 沿用现有登录协议，只向服务端提交新密码的 SHA-256 摘要。 */
export const updatePassword = ({
  newPassword,
  passwordChangeToken
}: {
  newPassword: string;
  passwordChangeToken: string;
}) =>
  POST<UpdatePasswordResponse>('/support/user/account/password/update', {
    newPsw: hashStr(newPassword),
    passwordChangeToken
  });

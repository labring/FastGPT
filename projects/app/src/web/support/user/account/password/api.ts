import { POST } from '@/web/common/api/request';
import { hashStr } from '@fastgpt/global/common/string/tools';
import type {
  CreatePasswordVerificationBody,
  CreatePasswordVerificationResponse,
  PasswordAuthorizationBody,
  PasswordAuthorizationResponse
} from '@fastgpt/global/openapi/support/user/account/password/api';

export const createPasswordVerification = (body: CreatePasswordVerificationBody) =>
  POST<CreatePasswordVerificationResponse>(
    '/proApi/support/user/account/password/verification/create',
    body
  );

export const authorizePasswordChange = (body: PasswordAuthorizationBody) =>
  POST<PasswordAuthorizationResponse>('/proApi/support/user/account/password/authorization', body);

/**
 * 沿用现有登录协议，只向服务端提交密码摘要。
 * 商业版提交认证后签发的一次性改密 Session；开源版没有认证服务，改为提交旧密码摘要。
 */
export const updatePassword = ({
  oldPassword,
  newPassword,
  passwordChangeSession
}: {
  /** 开源版改密必传；商业版由一次性改密 Session 承担身份验证。 */
  oldPassword?: string;
  newPassword: string;
  passwordChangeSession?: string;
}) =>
  POST<void>('/support/user/account/password/update', {
    ...(oldPassword ? { oldPsw: hashStr(oldPassword) } : {}),
    newPsw: hashStr(newPassword),
    ...(passwordChangeSession ? { passwordChangeSession } : {})
  });

export const activateAccount = ({ newPassword }: { newPassword: string }) =>
  POST<void>('/support/user/account/password/activate', {
    newPsw: hashStr(newPassword)
  });

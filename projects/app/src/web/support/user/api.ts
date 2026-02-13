import { GET, POST, PUT } from '@/web/common/api/request';
import { hashStr } from '@fastgpt/global/common/string/tools';
import type { LoginSuccessResponse } from '@/global/support/api/userRes.d';
import type { UserAuthTypeEnum } from '@fastgpt/global/support/user/auth/constants';
import type { UserUpdateParams } from '@/types/user';
import type { UserType } from '@fastgpt/global/support/user/type';
import type {
  FastLoginProps,
  OauthLoginProps,
  PostLoginProps,
  SearchResult
} from '@fastgpt/global/support/user/api.d';
import type {
  AccountRegisterBody,
  GetWXLoginQRResponse
} from '@fastgpt/global/support/user/login/api.d';
import type { preLoginResponse } from '@/pages/api/support/user/account/preLogin';
import type { WxLoginProps } from '@fastgpt/global/support/user/api.d';
import type { LangEnum } from '@fastgpt/global/common/i18n/type';

export const sendAuthCode = (data: {
  username: string;
  type: `${UserAuthTypeEnum}`;
  googleToken: string;
  captcha: string;
  lang: `${LangEnum}`;
}) => POST(`/proApi/support/user/inform/sendAuthCode`, data);

export const getTokenLogin = () =>
  GET<UserType>('/support/user/account/tokenLogin', {}, { maxQuantity: 1 });
export const oauthLogin = (params: OauthLoginProps) =>
  POST<LoginSuccessResponse>('/proApi/support/user/account/login/oauth', params);
export const postFastLogin = (params: FastLoginProps) =>
  POST<LoginSuccessResponse>('/proApi/support/user/account/login/fastLogin', params);
export const ssoLogin = (params: any) =>
  GET<LoginSuccessResponse>('/proApi/support/user/account/sso', params);

export const postRegister = ({
  username,
  password,
  code,
  inviterId,
  bd_vid,
  msclkid,
  fastgpt_sem
}: AccountRegisterBody) =>
  POST<LoginSuccessResponse>(`/proApi/support/user/account/register/emailAndPhone`, {
    username,
    code,
    inviterId,
    bd_vid,
    msclkid,
    fastgpt_sem,
    password: hashStr(password)
  });

export const postFindPassword = ({
  username,
  code,
  password
}: {
  username: string;
  code: string;
  password: string;
}) =>
  POST<LoginSuccessResponse>(`/proApi/support/user/account/password/updateByCode`, {
    username,
    code,
    password: hashStr(password)
  });

export const updatePasswordByOld = ({ oldPsw, newPsw }: { oldPsw: string; newPsw: string }) =>
  POST('/support/user/account/updatePasswordByOld', {
    oldPsw: hashStr(oldPsw),
    newPsw: hashStr(newPsw)
  });

export const resetPassword = (newPsw: string) =>
  POST('/support/user/account/resetExpiredPsw', {
    newPsw: hashStr(newPsw)
  });

/* Check the whether password has expired */
export const getCheckPswExpired = () => GET<boolean>('/support/user/account/checkPswExpired');

export const updateNotificationAccount = (data: { account: string; verifyCode: string }) =>
  PUT('/proApi/support/user/team/updateNotificationAccount', data);

export const updateContact = (data: { contact: string; verifyCode: string }) => {
  return PUT('/proApi/support/user/account/updateContact', data);
};

export const postLogin = ({ password, ...props }: PostLoginProps) =>
  POST<LoginSuccessResponse>('/support/user/account/loginByPassword', {
    ...props,
    password: hashStr(password)
  });

export const loginOut = () => GET('/support/user/account/loginout');

export const putUserInfo = (data: UserUpdateParams) => PUT('/support/user/account/update', data);

export const getWXLoginQR = () =>
  GET<GetWXLoginQRResponse>('/proApi/support/user/account/login/wx/getQR');

export const getWXLoginResult = (params: WxLoginProps) =>
  POST<LoginSuccessResponse>(`/proApi/support/user/account/login/wx/getResult`, params);

export const getCaptchaPic = (username: string) =>
  GET<{
    captchaImage: string;
  }>('/proApi/support/user/account/captcha/getImgCaptcha', { username });

export const getPreLogin = (username: string) =>
  GET<preLoginResponse>('/support/user/account/preLogin', { username });

export const postSyncMembers = () => POST('/proApi/support/user/sync');

export const GetSearchUserGroupOrg = (
  searchKey: string,
  options?: {
    members?: boolean;
    orgs?: boolean;
    groups?: boolean;
  }
) =>
  GET<SearchResult>('/proApi/support/user/search', { searchKey, ...options }, { maxQuantity: 1 });

export const ExportMembers = () => GET<{ csv: string }>('/proApi/support/user/team/member/export');

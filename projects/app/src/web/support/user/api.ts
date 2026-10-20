import { GET, POST, PUT } from '@/web/common/api/request';
import { hashStr } from '@fastgpt/global/common/string/tools';
import type { UserUpdateParams } from '@/types/user';
import type { UserType } from '@fastgpt/global/support/user/type';
import type { SearchMembersOrgsGroupsResponseType } from '@fastgpt/global/openapi/support/user/team/api';
import type {
  PreLoginResponseType,
  LoginByPasswordBodyType,
  OauthLoginBodyType,
  SsoGetAuthorizationURLBodyType,
  WecomGetRedirectURLBodyType,
  FastLoginBodyType,
  WxLoginBodyType,
  GetWXLoginQRResponseType,
  LoginSuccessResponseType,
  LoginByPasswordResponseType,
  LoginVerificationCaptchaResponseType,
  LoginVerificationSendCodeResponseType,
  WxLoginResultResponseType
} from '@fastgpt/global/openapi/support/user/account/login/api';
import type {
  SendAuthCodeBodyType,
  SendAuthCodeResponseType
} from '@fastgpt/global/openapi/support/user/inform/api';
import type { UpdatePasswordByCodeBodyType } from '@fastgpt/global/openapi/support/user/account/password/api';
import type { UpdateContactBodyType } from '@fastgpt/global/openapi/support/user/account/update/api';
import type { AccountRegisterBodyType } from '@fastgpt/global/openapi/support/user/account/register/api';
import type { CaptchaVerificationPurpose } from '@fastgpt/global/support/user/account/verification/type';
import type { GetImgCaptchaResponse } from '@fastgpt/global/openapi/support/user/account/captcha/api';

export type UserVerificationPurpose = CaptchaVerificationPurpose;

/* ===== Auth code ===== */
export const sendAuthCode = (data: SendAuthCodeBodyType) =>
  POST<SendAuthCodeResponseType>('/proApi/support/user/inform/sendAuthCode', data);
export const getCaptchaPic = (username: string, purpose: UserVerificationPurpose) =>
  GET<GetImgCaptchaResponse>('/proApi/support/user/account/captcha/getImgCaptcha', {
    username,
    purpose
  });

/* ===== login ===== */
export const getPreLogin = (username: string) =>
  GET<PreLoginResponseType>('/support/user/account/preLogin', { username });

export const getTokenLogin = () =>
  GET<UserType>('/support/user/account/tokenLogin', {}, { maxQuantity: 1 });
export const oauthLogin = (params: OauthLoginBodyType) =>
  POST<LoginSuccessResponseType>('/proApi/support/user/account/login/oauth', params);
export const getSsoAuthURL = (params: SsoGetAuthorizationURLBodyType) =>
  POST<string>('/proApi/support/user/account/login/getAuthURL', params);
export const getWecomRedirectURL = (params: WecomGetRedirectURLBodyType) =>
  POST<string>('/proApi/support/user/account/login/wecom/getRedirectUrl', params);
export const postFastLogin = (params: FastLoginBodyType) =>
  POST<LoginSuccessResponseType>('/proApi/support/user/account/login/fastLogin', params);
export const postLogin = ({ password, ...props }: LoginByPasswordBodyType) =>
  POST<LoginByPasswordResponseType>('/support/user/account/loginByPassword', {
    ...props,
    password: hashStr(password)
  });
export const getLoginVerificationCaptcha = (challenge: string) =>
  POST<LoginVerificationCaptchaResponseType>('/support/user/account/login/verification/captcha', {
    challenge
  });
export const sendLoginVerificationCode = (params: { challenge: string; captcha: string }) =>
  POST<LoginVerificationSendCodeResponseType>(
    '/support/user/account/login/verification/sendCode',
    params
  );
export const verifyLoginVerificationCode = (params: { challenge: string; code: string }) =>
  POST<LoginSuccessResponseType>('/support/user/account/login/verification/verify', params);
// wx login
export const getWXLoginQR = () =>
  GET<GetWXLoginQRResponseType>('/proApi/support/user/account/login/wx/getQR');

export const getWXLoginResult = (params: WxLoginBodyType) =>
  POST<WxLoginResultResponseType>(`/proApi/support/user/account/login/wx/getResult`, params, {
    maxQuantity: 1
  });
export const loginOut = () => GET('/support/user/account/loginout');

/* ===== register ===== */
export const postRegister = ({
  username,
  password,
  code,
  bd_vid,
  msclkid,
  fastgpt_sem,
  language
}: AccountRegisterBodyType) =>
  POST<LoginSuccessResponseType>(`/proApi/support/user/account/register/emailAndPhone`, {
    username,
    code,
    bd_vid,
    msclkid,
    fastgpt_sem,
    language,
    password: hashStr(password)
  });

/* =====  password ===== */
export const postFindPassword = ({
  username,
  code,
  password,
  ...props
}: UpdatePasswordByCodeBodyType) =>
  POST<LoginSuccessResponseType>(`/proApi/support/user/account/password/updateByCode`, {
    username,
    code,
    ...props,
    password: hashStr(password)
  });
// Check the whether password has expired
export const getCheckPswExpired = () =>
  GET<boolean>('/support/user/account/password/checkPswExpired');

/* ===== notification account ===== */
export const updateNotificationAccount = (data: { account: string; verifyCode: string }) =>
  PUT('/proApi/support/user/team/updateNotificationAccount', data);
export const updateContact = (data: UpdateContactBodyType) => {
  return PUT('/proApi/support/user/account/updateContact', data);
};

/* ===== user info ===== */
export const putUserInfo = (data: UserUpdateParams) => PUT('/support/user/account/update', data);

export const postSyncMembers = () => POST('/proApi/support/user/team/sync');

export const getSearchMembersOrgsGroups = (
  searchKey: string,
  options?: {
    members?: boolean;
    orgs?: boolean;
    groups?: boolean;
  }
) =>
  GET<SearchMembersOrgsGroupsResponseType>(
    '/proApi/support/user/team/searchMembersOrgsGroups',
    { searchKey, ...options },
    { maxQuantity: 1 }
  );

export const ExportMembers = () => GET<{ csv: string }>('/proApi/support/user/team/member/export');

/** 邮件和短信验证码的业务模板类型。 */
export enum VerificationCodeTypeEnum {
  register = 'register',
  findPassword = 'findPassword',
  passwordChange = 'passwordChange',
  unsubscribe = 'unsubscribe',
  bindNotification = 'bindNotification'
}

/** 账号身份验证支持的 OAuth provider，微信扫码在验证 method 中单独处理。 */
export const oauthAccountVerificationProviders = [
  'github',
  'google',
  'microsoft',
  'wecom',
  'sso'
] as const;

export const oauthAccountVerificationMethods = [
  'oauth/github',
  'oauth/google',
  'oauth/microsoft',
  'oauth/wecom',
  'oauth/sso'
] as const;

export const accountExternalVerificationMethods = [
  'code',
  'wechat',
  ...oauthAccountVerificationMethods
] as const;

export const accountVerificationMethods = [
  ...accountExternalVerificationMethods,
  'oldPassword'
] as const;

export const recognizedAccountKinds = [
  'email',
  'phone',
  'local',
  'wechat',
  'github',
  'google',
  'microsoft',
  'wecom',
  'sso'
] as const;

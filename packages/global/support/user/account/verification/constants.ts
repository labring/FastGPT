/** 邮件和短信验证码的业务模板类型。 */
export enum VerificationCodeTypeEnum {
  register = 'register',
  findPassword = 'findPassword',
  unsubscribe = 'unsubscribe',
  bindNotification = 'bindNotification'
}

export const accountVerificationMethods = [
  'code',
  'oldPassword',
  'wechat',
  'oauth/github',
  'oauth/google',
  'oauth/microsoft',
  'oauth/wecom',
  'oauth/sso'
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

export enum AccountVerificationMaterialTypeEnum {
  register = 'register',
  findPassword = 'findPassword',
  wxLogin = 'wxLogin',
  bindNotification = 'bindNotification',
  captcha = 'captcha',
  login = 'login',
  oauthLogin = 'oauthLogin'
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

export const oauthAccountVerificationProviders = [
  'github',
  'google',
  'microsoft',
  'wecom',
  'sso'
] as const;

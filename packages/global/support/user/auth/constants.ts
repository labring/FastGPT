export enum UserAuthTypeEnum {
  register = 'register',
  findPassword = 'findPassword',
  wxLogin = 'wxLogin',
  bindNotification = 'bindNotification',
  captcha = 'captcha',
  login = 'login'
}

export const userAuthTypeMap = {
  [UserAuthTypeEnum.register]: 'register',
  [UserAuthTypeEnum.findPassword]: 'findPassword',
  [UserAuthTypeEnum.wxLogin]: 'wxLogin',
  [UserAuthTypeEnum.bindNotification]: 'bindNotification',
  [UserAuthTypeEnum.captcha]: 'captcha',
  [UserAuthTypeEnum.login]: 'login'
};

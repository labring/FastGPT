export enum UserAuthTypeEnum {
  register = 'register',
  findPassword = 'findPassword',
  wxLogin = 'wxLogin',
  bindNotification = 'bindNotification',
  captcha = 'captcha'
}

export const userAuthTypeMap = {
  [UserAuthTypeEnum.register]: 'register',
  [UserAuthTypeEnum.findPassword]: 'findPassword',
  [UserAuthTypeEnum.wxLogin]: 'wxLogin',
  [UserAuthTypeEnum.bindNotification]: 'bindNotification',
  [UserAuthTypeEnum.captcha]: 'captcha'
};

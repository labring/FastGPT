export enum UserAuthTypeEnum {
  register = 'register',
  findPassword = 'findPassword',
  wxLogin = 'wxLogin'
}

export const userAuthTypeMap = {
  [UserAuthTypeEnum.register]: 'register',
  [UserAuthTypeEnum.findPassword]: 'findPassword',
  [UserAuthTypeEnum.wxLogin]: 'wxLogin'
};

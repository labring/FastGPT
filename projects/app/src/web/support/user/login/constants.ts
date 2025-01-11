export enum LoginPageTypeEnum {
  passwordLogin = 'passwordLogin',
  register = 'register',
  forgetPassword = 'forgetPassword',
  wechat = 'wechat'
}

export const PasswordRule =
  /^(?:(?=.*\d)(?=.*[a-z])|(?=.*\d)(?=.*[A-Z])|(?=.*\d)(?=.*[!@#$%^&*_])|(?=.*[a-z])(?=.*[A-Z])|(?=.*[a-z])(?=.*[!@#$%^&*_])|(?=.*[A-Z])(?=.*[!@#$%^&*_]))[\dA-Za-z!@#$%^&*_]{6,}$/;

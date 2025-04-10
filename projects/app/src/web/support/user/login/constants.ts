export enum LoginPageTypeEnum {
  passwordLogin = 'passwordLogin',
  register = 'register',
  forgetPassword = 'forgetPassword',
  wechat = 'wechat'
}

export const checkPasswordRule = (password: string) => {
  const patterns = [
    /\d/, // Contains digits
    /[a-z]/, // Contains lowercase letters
    /[A-Z]/, // Contains uppercase letters
    /[!@#$%^&*()_+=-]/ // Contains special characters
  ];
  const validChars = /^[\dA-Za-z!@#$%^&*()_+=-]{6,100}$/;

  // Check length and valid characters
  if (!validChars.test(password)) return false;

  // Count how many patterns are satisfied
  const matchCount = patterns.filter((pattern) => pattern.test(password)).length;

  // Must satisfy at least 2 patterns
  return matchCount >= 2;
};

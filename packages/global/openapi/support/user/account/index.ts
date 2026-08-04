import type { OpenAPIPath } from '../../../type';
import { LoginPath } from './login';
import { RegisterPath } from './register';
import { PasswordPath } from './password';
import { CaptchaPath } from './captcha';

export const UserAccountPath: OpenAPIPath = {
  ...LoginPath,
  ...RegisterPath,
  ...PasswordPath,
  ...CaptchaPath
};

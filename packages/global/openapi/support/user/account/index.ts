import type { OpenAPIPath } from '../../../type';
import { LoginPath } from './login';
import { RegisterPath } from './register';
import { PasswordPath } from './password';
import { CaptchaPath } from './captcha';
import { AccountCancellationPath } from './cancellation';
import { UpdateUserAccountPath } from './update';

export const UserAccountPath: OpenAPIPath = {
  ...LoginPath,
  ...RegisterPath,
  ...PasswordPath,
  ...CaptchaPath,
  ...AccountCancellationPath,
  ...UpdateUserAccountPath
};

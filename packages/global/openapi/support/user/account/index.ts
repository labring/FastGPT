import type { OpenAPIPath } from '../../../type';
import { LoginPath } from './login';
import { PasswordPath } from './password';
import { CaptchaPath } from './captcha';
import { AccountCancellationPath } from './cancellation';
import { UpdateUserAccountPath } from './update';
import { WhoamiPath } from './whoami';

export const UserAccountPath: OpenAPIPath = {
  ...LoginPath,
  ...PasswordPath,
  ...CaptchaPath,
  ...AccountCancellationPath,
  ...UpdateUserAccountPath,
  ...WhoamiPath
};

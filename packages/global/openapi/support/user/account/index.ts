import type { OpenAPIPath } from '../../../type';
import { LoginPath } from './login';
import { RegisterPath } from './register';
import { PasswordPath } from './password';
import { AccountVerificationPath } from './verification';
import { AccountCancellationPath } from './cancellation';

export const UserAccountPath: OpenAPIPath = {
  ...LoginPath,
  ...RegisterPath,
  ...PasswordPath,
  ...AccountVerificationPath,
  ...AccountCancellationPath
};

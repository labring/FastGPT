import type { OpenAPIPath } from '../../../type';
import { LoginPath } from './login';
import { RegisterPath } from './register';
import { PasswordPath } from './password';

export const UserAccountPath: OpenAPIPath = {
  ...LoginPath,
  ...RegisterPath,
  ...PasswordPath
};

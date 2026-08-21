import { AdminLoginPath } from './login';
import { AdminInformPath } from './inform';
import { AdminAuthPath } from './auth';
import type { OpenAPIPath } from '../../../type';

export const AdminUserPath: OpenAPIPath = {
  ...AdminInformPath,
  ...AdminLoginPath,
  ...AdminAuthPath
};

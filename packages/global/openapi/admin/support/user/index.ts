import { AdminInformPath } from './inform';
import { AdminLoginPath } from './login';
import type { OpenAPIPath } from '../../../type';

export const AdminUserPath: OpenAPIPath = {
  ...AdminInformPath,
  ...AdminLoginPath
};

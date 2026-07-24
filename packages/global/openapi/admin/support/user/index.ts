import { AdminLoginPath } from './login';
import { AdminInformPath } from './inform';
import { AdminAuthPath } from './auth';
import type { OpenAPIPath } from '../../../type';
import { AdminAuditPath } from './audit';

export const AdminUserPath: OpenAPIPath = {
  ...AdminInformPath,
  ...AdminLoginPath,
  ...AdminAuthPath,
  ...AdminAuditPath
};

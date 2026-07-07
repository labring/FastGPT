import { AdminUserPath } from './user';
import { AdminWalletPath } from './wallet';
import type { OpenAPIPath } from '../../type';

export const AdminSupportPath: OpenAPIPath = {
  ...AdminUserPath,
  ...AdminWalletPath
};

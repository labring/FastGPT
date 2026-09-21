import { AdminLicensePath } from './license';
import { AdminSystemMigrationsPath } from './system/migrations';
import type { OpenAPIPath } from '../../type';

export const AdminCommonPath: OpenAPIPath = {
  ...AdminLicensePath,
  ...AdminSystemMigrationsPath
};

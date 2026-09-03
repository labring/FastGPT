import { AdminLicensePath } from './license';
import { AdminLogsPath } from './log';
import { AdminSystemMigrationsPath } from './system/migrations';
import type { OpenAPIPath } from '../../type';

export const AdminCommonPath: OpenAPIPath = {
  ...AdminLicensePath,
  ...AdminLogsPath,
  ...AdminSystemMigrationsPath
};

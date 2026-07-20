import { DashboardPath } from './dashboard';
import { AdminAppPath } from './app';
import { AdminModelPath } from './model';
import { AdminRoutesPath } from '../routes';
import { AdminCommonPath } from '../common';
import { AdminMigrationPath } from './migration';
import type { OpenAPIPath } from '../../type';

export const AdminCorePath: OpenAPIPath = {
  ...DashboardPath,
  ...AdminAppPath,
  ...AdminModelPath,
  ...AdminRoutesPath,
  ...AdminCommonPath,
  ...AdminMigrationPath
};

import { DashboardPath } from './dashboard';
import { AdminAppPath } from './app';
import { AdminRoutesPath } from '../routes';
import { AdminCommonPath } from '../common';
import type { OpenAPIPath } from '../../type';

export const AdminCorePath: OpenAPIPath = {
  ...DashboardPath,
  ...AdminAppPath,
  ...AdminRoutesPath,
  ...AdminCommonPath
};

import { DashboardPath } from './dashboard';
import { AdminAppPath } from './app';
import { AdminRoutesPath } from '../routes';
import { AdminCommonPath } from '../common';
import { StatusPath } from './status';
import type { OpenAPIPath } from '../../type';

export const AdminCorePath: OpenAPIPath = {
  ...DashboardPath,
  ...AdminAppPath,
  ...AdminRoutesPath,
  ...AdminCommonPath,
  ...StatusPath
};

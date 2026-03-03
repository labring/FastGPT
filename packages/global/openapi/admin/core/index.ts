import { DashboardPath } from './dashboard';
import { AdminAppPath } from './app';
import type { OpenAPIPath } from '../../type';

export const AdminCorePath: OpenAPIPath = {
  ...DashboardPath,
  ...AdminAppPath
};

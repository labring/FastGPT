import { DashboardPath } from './dashboard';
import { AdminAppPath } from './app';
import { AdminRoutesPath } from '../routes';
import { AdminCommonPath } from '../common';
import type { OpenAPIPath } from '../../type';
import { AdminSystemModelPath } from './ai/model';
import { AdminDatasetPath } from './dataset';

export const AdminCorePath: OpenAPIPath = {
  ...DashboardPath,
  ...AdminAppPath,
  ...AdminRoutesPath,
  ...AdminCommonPath,
  ...AdminSystemModelPath,
  ...AdminDatasetPath
};

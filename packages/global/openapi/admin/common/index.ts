import { AdminLicensePath } from './license';
import { AdminLogsPath } from './log';
import type { OpenAPIPath } from '../../type';

export const AdminCommonPath: OpenAPIPath = {
  ...AdminLicensePath,
  ...AdminLogsPath
};

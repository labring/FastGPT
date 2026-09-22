import type { OpenAPIPath } from '../type';
import { AdminAppsPath } from './app';
import { DashboardPath } from './dashboard';
import { AdminDatasetsPath } from './dataset';
import { AdminLicensePath } from './license';
import { AdminSystemPath } from './system';
import { AdminSystemChannelPath } from './system/model/channel';
import { AdminSystemModelPath } from './system/model';
import { AdminTeamsPath } from './team';
import { AdminUsersPath } from './user';
import { AdminWalletPath } from './wallet';

/** 管理员接口总路由，统一作为 DevAPI 的管理员接口入口。 */
export const AdminPath: NonNullable<OpenAPIPath> = {
  ...AdminAppsPath,
  ...DashboardPath,
  ...AdminDatasetsPath,
  ...AdminLicensePath,
  ...AdminSystemPath,
  ...AdminSystemModelPath,
  ...AdminSystemChannelPath,
  ...AdminTeamsPath,
  ...AdminUsersPath,
  ...AdminWalletPath
};

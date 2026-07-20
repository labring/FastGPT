import { AdminUsersPath } from './users';
import { AdminTeamsPath } from './teams';
import { AdminDatasetsPath } from './datasets';
import { AdminRoutesAppsPath } from './apps';
import { AdminPaysPath } from './pays';
import { AdminPlansPath } from './plans';
import { AdminSettingsPath } from './settings';
import type { OpenAPIPath } from '../../type';

export const AdminRoutesPath: OpenAPIPath = {
  ...AdminUsersPath,
  ...AdminTeamsPath,
  ...AdminDatasetsPath,
  ...AdminRoutesAppsPath,
  ...AdminPaysPath,
  ...AdminPlansPath,
  ...AdminSettingsPath
};

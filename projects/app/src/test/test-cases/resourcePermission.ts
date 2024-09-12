import { ResourcePermissionType } from '@fastgpt/global/support/permission/type';
import { team_root } from './team';
import { tmb_root_root } from './tmb';
import { app_root_root } from './testApp';

const rp_app_root: ResourcePermissionType = {
  teamId: team_root._id,
  tmbId: tmb_root_root._id,
  resourceType: 'app',
  permission: 7,
  resourceId: app_root_root._id
};

const TestResourcePermissionList = [rp_app_root];

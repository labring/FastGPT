import { team_root } from './team';
import { tmb_root_root, tmb_user1_root } from './tmb';

// name pattern: app_team_user

export const app_root_root = {
  _id: 'test-app-id',
  name: 'test-app-name',
  avatar: 'test-app-avatar',
  ownerId: tmb_root_root._id,
  teamId: team_root._id
};

export const app_root_test1 = {
  _id: 'test-app-id-test1',
  name: 'test-app-name-test1',
  avatar: 'test-app-avatar-test1',
  ownerId: tmb_root_root._id,
  teamId: team_root._id
};

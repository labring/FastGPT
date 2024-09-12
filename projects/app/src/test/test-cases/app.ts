import { tmb_root_root } from './tmb';
import { team_root } from './team';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';

export type TestAppType = {
  _id: string;
  name: string;
  avatar: string;
  ownerId: string;
  teamId: string;
  parentId: string | null;
  type: AppTypeEnum;
};

export const testApp_root_root_simple_1: TestAppType = {
  _id: 'test-app-id',
  name: 'test-app-name',
  avatar: 'test-app-avatar',
  ownerId: tmb_root_root._id,
  teamId: team_root._id,
  parentId: null,
  type: AppTypeEnum.simple
};

export const testApp_root_user1_simple1: TestAppType = {
  _id: 'test-app-id-user1',
  name: 'test-app-name-user1',
  avatar: 'test-app-avatar-user1',
  ownerId: tmb_root_root._id,
  teamId: team_root._id,
  parentId: null,
  type: AppTypeEnum.simple
};

export const TestAppList: TestAppType[] = [testApp_root_root_simple_1, testApp_root_user1_simple1];

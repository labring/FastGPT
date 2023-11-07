import { ModuleItemType } from '../module/type';
import { AppTypeEnum } from './constants';
import { PermissionTypeEnum } from '../../support/permission/constant';

export interface AppSchema {
  _id: string;
  userId: string;
  teamId: string;
  tmbId: string;
  name: string;
  type: `${AppTypeEnum}`;
  avatar: string;
  intro: string;
  updateTime: number;
  modules: ModuleItemType[];
  permission: `${PermissionTypeEnum}`;
}

export type AppListItemType = {
  _id: string;
  name: string;
  avatar: string;
  intro: string;
  isOwner: boolean;
  permission: `${PermissionTypeEnum}`;
};

export type AppDetailType = AppSchema & {
  isOwner: boolean;
  canWrite: boolean;
};

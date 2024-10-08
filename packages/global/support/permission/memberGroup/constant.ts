import { i18nT } from '../../../../web/i18n/utils';
import { PermissionKeyEnum } from '../constant';
import { PermissionListType } from '../type';

export enum GroupMemberRole {
  owner = 'owner',
  admin = 'admin',
  member = 'member'
}

export const PermissionList: PermissionListType = {
  [PermissionKeyEnum.read]: {
    name: i18nT('common:permission.read'),
    description: '',
    value: 0b100,
    checkBoxType: 'single'
  },
  [PermissionKeyEnum.write]: {
    name: i18nT('common:permission.write'),
    description: '',
    value: 0b010,
    checkBoxType: 'single'
  },
  [PermissionKeyEnum.manage]: {
    name: i18nT('common:permission.manager'),
    description: '',
    value: 0b001,
    checkBoxType: 'single'
  }
};

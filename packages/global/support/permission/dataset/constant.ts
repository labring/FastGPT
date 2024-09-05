import { i18nT } from '../../../../web/i18n/utils';
import { NullPermission, PermissionKeyEnum, PermissionList } from '../constant';

export enum DatasetPermissionKeyEnum {}

export const DatasetPermissionList = {
  [PermissionKeyEnum.read]: {
    ...PermissionList[PermissionKeyEnum.read],
    description: i18nT('dataset:permission.des.read')
  },
  [PermissionKeyEnum.write]: {
    ...PermissionList[PermissionKeyEnum.write],
    description: i18nT('dataset:permission.des.write')
  },
  [PermissionKeyEnum.manage]: {
    ...PermissionList[PermissionKeyEnum.manage],
    description: i18nT('dataset:permission.des.manage')
  }
};

export const DatasetDefaultPermissionVal = NullPermission;

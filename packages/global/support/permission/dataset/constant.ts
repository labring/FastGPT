import { i18nT } from '../../../../web/i18n/utils';
import { NullRole, CommonPerKeyEnum, CommonRoleList } from '../constant';

export enum DatasetPermissionKeyEnum {}

export const DatasetPermissionList = {
  [CommonPerKeyEnum.read]: {
    ...CommonRoleList[CommonPerKeyEnum.read],
    description: i18nT('dataset:permission.des.read')
  },
  [CommonPerKeyEnum.write]: {
    ...CommonRoleList[CommonPerKeyEnum.write],
    description: i18nT('dataset:permission.des.write')
  },
  [CommonPerKeyEnum.manage]: {
    ...CommonRoleList[CommonPerKeyEnum.manage],
    description: i18nT('dataset:permission.des.manage')
  }
};

export const DatasetDefaultPermissionVal = NullRole;

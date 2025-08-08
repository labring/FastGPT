import { CommonPerKeyEnum } from '../constant';
import { type RoleListType } from '../type';
import { CommonRoleList } from '../constant';
import { i18nT } from '../../../../web/i18n/utils';
export enum TeamPermissionKeyEnum {
  appCreate = 'appCreate',
  datasetCreate = 'datasetCreate',
  apikeyCreate = 'apikeyCreate'
}

export const TeamPermissionList: RoleListType<TeamPermissionKeyEnum> = {
  [CommonPerKeyEnum.read]: {
    ...CommonRoleList[CommonPerKeyEnum.read],
    value: 0b000100
  },
  [CommonPerKeyEnum.write]: {
    ...CommonRoleList[CommonPerKeyEnum.write],
    value: 0b000010
  },
  [CommonPerKeyEnum.manage]: {
    ...CommonRoleList[CommonPerKeyEnum.manage],
    value: 0b000001
  },
  [TeamPermissionKeyEnum.appCreate]: {
    checkBoxType: 'multiple',
    description: '',
    name: i18nT('account_team:permission_appCreate'),
    value: 0b001000
  },
  [TeamPermissionKeyEnum.datasetCreate]: {
    checkBoxType: 'multiple',
    description: '',
    name: i18nT('account_team:permission_datasetCreate'),
    value: 0b010000
  },
  [TeamPermissionKeyEnum.apikeyCreate]: {
    checkBoxType: 'multiple',
    description: '',
    name: i18nT('account_team:permission_apikeyCreate'),
    value: 0b100000
  }
};

export const TeamReadPermissionVal = TeamPermissionList['read'].value;
export const TeamWritePermissionVal = TeamPermissionList['write'].value;
export const TeamManagePermissionVal = TeamPermissionList['manage'].value;
export const TeamAppCreatePermissionVal = TeamPermissionList['appCreate'].value;
export const TeamDatasetCreatePermissionVal = TeamPermissionList['datasetCreate'].value;
export const TeamApikeyCreatePermissionVal = TeamPermissionList['apikeyCreate'].value;
export const TeamDefaultPermissionVal = TeamReadPermissionVal;

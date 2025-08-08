import { i18nT } from '../../../../web/i18n/utils';
import {
  NullRoleVal,
  CommonPerKeyEnum,
  CommonRoleList,
  CommonRolePerMap,
  CommonPerList
} from '../constant';
import type { RolePerMapType } from '../type';

export const DatasetRoleList = {
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

export const DatasetRolePerMap: RolePerMapType = CommonRolePerMap;

export const DatasetPerList = CommonPerList;

export const DataSetDefaultRoleVal = NullRoleVal;

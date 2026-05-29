import { i18nT } from '../../../common/i18n/utils';
import {
  NullRoleVal,
  CommonPerKeyEnum,
  CommonRoleList,
  CommonRolePerMap,
  CommonPerList
} from '../constant';
import type { RolePerMapType } from '../type';

export const ModelRoleList = {
  [CommonPerKeyEnum.read]: {
    ...CommonRoleList[CommonPerKeyEnum.read],
    description: i18nT('model:permission.des.read')
  },
  [CommonPerKeyEnum.write]: {
    ...CommonRoleList[CommonPerKeyEnum.write],
    description: i18nT('model:permission.des.write')
  },
  [CommonPerKeyEnum.manage]: {
    ...CommonRoleList[CommonPerKeyEnum.manage],
    description: i18nT('model:permission.des.manage')
  }
};

export const ModelRolePerMap: RolePerMapType = CommonRolePerMap;

export const ModelPerList = CommonPerList;

export const ModelDefaultRoleVal = NullRoleVal;

import { i18nT } from '../../../common/i18n/utils';
import {
  NullRoleVal,
  CommonPerKeyEnum,
  CommonRoleList,
  CommonRolePerMap,
  CommonPerList
} from '../constant';
import type { RolePerMapType } from '../type';

export const CollectionRoleList = {
  [CommonPerKeyEnum.read]: {
    ...CommonRoleList[CommonPerKeyEnum.read],
    description: i18nT('dataset:collection.permission.des.read')
  },
  [CommonPerKeyEnum.write]: {
    ...CommonRoleList[CommonPerKeyEnum.write],
    description: i18nT('dataset:collection.permission.des.write')
  },
  [CommonPerKeyEnum.manage]: {
    ...CommonRoleList[CommonPerKeyEnum.manage],
    description: i18nT('dataset:collection.permission.des.manage')
  }
};

export const CollectionRolePerMap: RolePerMapType = CommonRolePerMap;

export const CollectionPerList = CommonPerList;

export const CollectionDefaultRoleVal = NullRoleVal;

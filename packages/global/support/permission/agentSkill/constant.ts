import { i18nT } from '../../../../web/i18n/utils';
import {
  NullRoleVal,
  CommonPerKeyEnum,
  CommonRoleList,
  CommonRolePerMap,
  CommonPerList
} from '../constant';
import type { RolePerMapType } from '../type';
import type { RoleListType } from '../type';

export const SkillRoleList: RoleListType = {
  [CommonPerKeyEnum.read]: {
    ...CommonRoleList[CommonPerKeyEnum.read],
    description: i18nT('skill:permission.des.read')
  },
  [CommonPerKeyEnum.write]: {
    ...CommonRoleList[CommonPerKeyEnum.write],
    description: i18nT('skill:permission.des.write')
  },
  [CommonPerKeyEnum.manage]: {
    ...CommonRoleList[CommonPerKeyEnum.manage],
    description: i18nT('skill:permission.des.manage')
  }
};

export const SkillRolePerMap: RolePerMapType = CommonRolePerMap;

export const SkillPerList = CommonPerList;

export const SkillDefaultRoleVal = NullRoleVal;

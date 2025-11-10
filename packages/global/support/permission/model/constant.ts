import {
  NullRoleVal,
  CommonPerKeyEnum,
  CommonRoleList,
  CommonPerList,
  CommonRoleKeyEnum
} from '../constant';

export const ModelDefaultRole = NullRoleVal;
export const ModelReadPerVal = CommonPerList[CommonPerKeyEnum.read];
export const ModelReadRolVal = CommonRoleList[CommonRoleKeyEnum.read];

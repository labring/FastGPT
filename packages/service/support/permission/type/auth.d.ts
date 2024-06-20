import { AuthUserTypeEnum } from '@fastgpt/global/support/permission/constant';
import { Permission } from '@fastgpt/global/support/permission/controller';
import { ApiRequestProps } from '../../../type/next';
import { PermissionValueType } from '@fastgpt/global/support/permission/type';

export type AuthPropsType = {
  req: ApiRequestProps;
  authToken?: boolean;
  authRoot?: boolean;
  authApiKey?: boolean;
  per: PermissionValueType;
};

export type AuthResponseType<T = Permission> = {
  teamId: string;
  tmbId: string;
  authType?: `${AuthUserTypeEnum}`;
  appId?: string;
  apikey?: string;
  permission: T;
};

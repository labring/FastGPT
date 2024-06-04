import { ApiRequestProps } from '../../type/next';
import type { PermissionValueType } from '@fastgpt/global/support/permission/type';

export type ReqHeaderAuthType = {
  cookie?: string;
  token?: string;
  apikey?: string; // abandon
  rootkey?: string;
  userid?: string;
  authorization?: string;
};

export type AuthModeType = {
  req: ApiRequestProps;
  authToken?: boolean;
  authRoot?: boolean;
  authApiKey?: boolean;
  per?: PermissionValueType | 'r' | 'w' | 'owner'; // this is for compatibility
};

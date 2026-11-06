import type { Permission } from '@fastgpt/global/support/permission/controller';
import type { PermissionValueType } from '@fastgpt/global/support/permission/type';
import type { RequireAtLeastOne } from '@fastgpt/global/common/type/utils';
import type { AuthUserTypeEnum } from '@fastgpt/global/support/permission/constant';
import type { NodeHttpRequest } from '../../types/http';
import type { ApiKeyTypeEnum } from '@fastgpt/global/support/openapi/constants';

export type ReqHeaderAuthType = {
  cookie?: string;
  token?: string;
  apikey?: string; // abandon
  rootkey?: string;
  userid?: string;
  authorization?: string;
};

type authModeType = {
  req: NodeHttpRequest;
  authToken?: boolean;
  authRoot?: boolean;
  authApiKey?: boolean;
  /** 仅应用对话及对话管理接口显式开启；不会授予归属成员任何应用角色。 */
  authAppApiKey?: boolean;
  per?: PermissionValueType;
  allowAccountCancellation?: boolean;
};

export type AuthModeType = RequireAtLeastOne<
  authModeType,
  'authApiKey' | 'authAppApiKey' | 'authRoot' | 'authToken'
>;

export type AuthResponseType<T extends Permission = Permission> = {
  userId: string;
  teamId: string;
  tmbId: string;
  authType?: `${AuthUserTypeEnum}`;
  appId?: string;
  legacyAppId?: string;
  parsedAppId?: string;
  apikey?: string;
  apiKeyAuthProxy?: boolean;
  apiKeyType?: ApiKeyTypeEnum;
  boundAppId?: string;
  sourceName?: string;
  sessionId?: string;
  isRoot: boolean;
  permission: T;
};

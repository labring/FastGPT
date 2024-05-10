import { AuthUserTypeEnum } from './constant';

export type AuthResponseType = {
  teamId: string;
  tmbId: string;
  isOwner: boolean;
  canWrite: boolean;
  authType?: `${AuthUserTypeEnum}`;
  appId?: string;
  apikey?: string;
};

export type MetaDataType = {
  owner: string; // user id, objectId
  defaultPermission: number;
  ownerPermission: number; // the permission of owner, which should be always the hihhest permission
};

export type ResourcePermissionType = {
  metaData: MetaDataType;
  userPermissionTable: Array<{
    user: UserModelSchema;
    permission: number;
  }>;
};

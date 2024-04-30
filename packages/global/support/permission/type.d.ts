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
};

export type ResourcePermissionType = {
  metaData: MetaDataType;
  userPermissionTable: Array<{
    user: string;
    permission: number;
  }>;
};

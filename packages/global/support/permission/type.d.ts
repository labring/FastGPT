import { AuthUserTypeEnum } from './constant';

export type AuthResponseType = {
  userId: string;
  teamId: string;
  tmbId: string;
  isOwner: boolean;
  canWrite: boolean;
  authType?: `${AuthUserTypeEnum}`;
  appId?: string;
  apikey?: string;
};

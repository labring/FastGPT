import { AuthUserTypeEnum } from '../constant';
import { Permission } from '../controller';

export type AuthResponseType = {
  teamId: string;
  tmbId: string;
  authType?: `${AuthUserTypeEnum}`;
  appId?: string;
  apikey?: string;
  permission: Permission;
};

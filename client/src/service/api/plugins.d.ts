import { UserAuthTypeEnum } from '../../constants/common';

export type SendCodeBody = {
  username: string;
  type: `${UserAuthTypeEnum}`;
};
export type AuthCodeBody = {
  username: string;
  type: `${UserAuthTypeEnum}`;
  code: string;
};

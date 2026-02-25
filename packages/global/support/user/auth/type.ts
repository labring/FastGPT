import type { UserAuthTypeEnum } from './constants';

export type UserAuthSchemaType = {
  key: string;
  type: `${UserAuthTypeEnum}`;
  code?: string;
  openid?: string;
  createTime: Date;
  expiredTime: Date;
};

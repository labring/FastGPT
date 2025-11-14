import type { UserAuthTypeEnum } from '@fastgpt/global/support/user/auth/constants';

export type UserAuthSchemaType = {
  key: string;
  type: `${UserAuthTypeEnum}`;
  code?: string;
  openid?: string;
  createTime: Date;
  expiredTime: Date;
};

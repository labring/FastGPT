import { MongoImageTypeEnum } from './constants';

export type MongoImageSchemaType = {
  teamId: string;
  binary: Buffer;
  createTime: Date;
  expiredTime?: Date;
  type: `${MongoImageTypeEnum}`;

  metadata?: { fileId?: string };
};

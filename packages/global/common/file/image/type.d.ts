import { MongoImageTypeEnum } from './constants';

export type MongoImageSchemaType = {
  _id: string;
  teamId: string;
  binary: Buffer;
  createTime: Date;
  expiredTime?: Date;
  type: `${MongoImageTypeEnum}`;

  metadata?: {
    relatedId?: string; // This id is associated with a set of images
  };
};

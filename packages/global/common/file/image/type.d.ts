import { MongoImageTypeEnum } from './constants';

export type MongoImageSchemaType = {
  _id: string;
  teamId: string;
  binary: Buffer;
  createTime: Date;
  expiredTime?: Date;
  type: `${MongoImageTypeEnum}`;

  metadata?: {
    mime?: string; // image mime type.
    relatedId?: string; // This id is associated with a set of images
  };
};

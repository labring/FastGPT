import type { TeamCollectionName } from '../../../support/user/team/constant';

export type MinioTtlSchemaType = {
  _id: string;
  bucketName: string;
  minioKey: string;
  expiredTime?: Date;
};

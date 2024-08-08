import { BucketNameEnum } from './constants';

export type FileTokenQuery = {
  bucketName: `${BucketNameEnum}`;
  teamId: string;
  tmbId: string;
  fileId: string;
};

import { BucketNameEnum } from './constants';

export type FileTokenQuery = {
  bucketName: `${BucketNameEnum}`;
  teamId: string;
  uid: string; // tmbId/ share uid/ teamChat uid
  fileId: string;
  customExpireMinutes?: number;
};

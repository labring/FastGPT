import { NextAPI } from '@/service/middleware/entry';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import { type NextApiRequest, type NextApiResponse } from 'next';
import { S3Buckets } from '@fastgpt/service/common/s3/constants';
import { MinioStorageAdapter } from '@fastgpt-sdk/storage';

// 将 S3 原先的 circleLife 策略全部去掉
async function handler(req: NextApiRequest, _res: NextApiResponse) {
  await authCert({ req, authRoot: true });

  if (!global.s3BucketMap[S3Buckets.public]) {
    return Promise.reject('S3 not initialized');
  }

  const publicClient = global.s3BucketMap[S3Buckets.public].client;
  const privateClient = global.s3BucketMap[S3Buckets.private].client;

  if (publicClient instanceof MinioStorageAdapter) {
    await publicClient.removeBucketLifecycle();
  }
  if (privateClient instanceof MinioStorageAdapter) {
    await privateClient.removeBucketLifecycle();
  }

  return {};
}

export default NextAPI(handler);

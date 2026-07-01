import { NextAPI } from '@/service/middleware/entry';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import { type NextApiRequest, type NextApiResponse } from 'next';
import { S3Buckets } from '@fastgpt/service/common/s3/config/constants';

type BucketLifecycleRemovableClient = {
  removeBucketLifecycle: () => Promise<void>;
};

const hasRemoveBucketLifecycle = (client: unknown): client is BucketLifecycleRemovableClient =>
  typeof (client as Partial<BucketLifecycleRemovableClient> | undefined)?.removeBucketLifecycle ===
  'function';

// 将 S3 原先的 circleLife 策略全部去掉
async function handler(req: NextApiRequest, _res: NextApiResponse) {
  await authCert({ req, authRoot: true });

  if (!global.s3BucketMap[S3Buckets.public]) {
    return Promise.reject('S3 not initialized');
  }

  const publicClient = global.s3BucketMap[S3Buckets.public].client;
  const privateClient = global.s3BucketMap[S3Buckets.private].client;

  // Next dev / bundle 场景下 workspace package 可能被加载为不同模块实例，instanceof 会误判。
  if (hasRemoveBucketLifecycle(publicClient)) {
    await publicClient.removeBucketLifecycle();
  }
  if (hasRemoveBucketLifecycle(privateClient)) {
    await privateClient.removeBucketLifecycle();
  }

  return;
}

export default NextAPI(handler);

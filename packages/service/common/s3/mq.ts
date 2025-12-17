import { getQueue, getWorker, QueueNames } from '../bullmq';
import pLimit from 'p-limit';
import { retryFn } from '@fastgpt/global/common/system/utils';
import { addLog } from '../system/log';

export type S3MQJobData = {
  key?: string;
  keys?: string[];
  prefix?: string;
  bucketName: string;
};

export const addS3DelJob = async (data: S3MQJobData): Promise<void> => {
  const queue = getQueue<S3MQJobData>(QueueNames.s3FileDelete);

  await queue.add(
    'delete-s3-files',
    { ...data },
    {
      attempts: 3,
      removeOnFail: false,
      removeOnComplete: true,
      backoff: {
        delay: 2000,
        type: 'exponential'
      }
    }
  );
};

export const startS3DelWorker = async () => {
  const limit = pLimit(50);

  return getWorker<S3MQJobData>(
    QueueNames.s3FileDelete,
    async (job) => {
      const { prefix, bucketName, key, keys } = job.data;

      const bucket = s3BucketMap[bucketName];
      if (!bucket) {
        return Promise.reject(`Bucket not found: ${bucketName}`);
      }

      if (key) {
        addLog.info(`[S3 delete] delete key: ${key}`);
        await bucket.delete(key);
        addLog.info(`[S3 delete] delete key: ${key} success`);
      }
      if (keys) {
        addLog.info(`[S3 delete] delete keys: ${keys.length}`);
        const tasks = [];
        const p = limit(() => retryFn(() => bucket.client.deleteObjectsByMultiKeys({ keys })));
        tasks.push(p);
        await Promise.all(tasks);
        addLog.info(`[S3 delete] delete keys: ${keys.length} success`);
      }
      if (prefix) {
        addLog.info(`[S3 delete] delete prefix: ${prefix}`);
        const tasks = [];
        const p = limit(() => retryFn(() => bucket.client.deleteObjectsByPrefix({ prefix })));
        tasks.push(p);
        await Promise.all(tasks);
      }
    },
    {
      concurrency: 1
    }
  );
};

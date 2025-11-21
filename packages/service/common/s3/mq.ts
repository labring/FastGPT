import { getQueue, getWorker, QueueNames } from '../bullmq';
import pLimit from 'p-limit';
import { retryFn } from '@fastgpt/global/common/system/utils';

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
  return getWorker<S3MQJobData>(
    QueueNames.s3FileDelete,
    async (job) => {
      const { prefix, bucketName, key, keys } = job.data;
      const limit = pLimit(10);
      const bucket = s3BucketMap[bucketName];
      if (!bucket) {
        return Promise.reject(`Bucket not found: ${bucketName}`);
      }

      if (key) {
        await bucket.delete(key);
      }
      if (keys) {
        const tasks: Promise<void>[] = [];
        for (const key of keys) {
          const p = limit(() => retryFn(() => bucket.delete(key)));
          tasks.push(p);
        }
        await Promise.all(tasks);
      }
      if (prefix) {
        const tasks: Promise<void>[] = [];
        return new Promise<void>(async (resolve, reject) => {
          const stream = bucket.listObjectsV2(prefix, true);
          stream.on('data', async (file) => {
            if (!file.name) return;

            const p = limit(() =>
              // 因为封装的 delete 方法里，包含前缀删除，这里不能再使用，避免循环。
              retryFn(() => bucket.client.removeObject(bucket.name, file.name))
            );
            tasks.push(p);
          });

          stream.on('end', async () => {
            try {
              const results = await Promise.allSettled(tasks);
              const failed = results.filter((r) => r.status === 'rejected');
              if (failed.length > 0) {
                reject('Some deletes failed');
              }
              resolve();
            } catch (err) {
              reject(err);
            }
          });

          stream.on('error', (err) => {
            console.error('listObjects stream error', err);
            reject(err);
          });
        });
      }
    },
    {
      concurrency: 1
    }
  );
};

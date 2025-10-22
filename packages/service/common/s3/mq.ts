import { getQueue, getWorker, QueueNames } from '../bullmq';
import pLimit from 'p-limit';
import { retryFn } from '@fastgpt/global/common/system/utils';

export type S3MQJobData = {
  key?: string;
  prefix?: string;
  bucketName: string;
};

export async function addS3Job(data: S3MQJobData): Promise<void> {
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
}

export async function startS3Worker() {
  return getWorker<S3MQJobData>(
    QueueNames.s3FileDelete,
    async (job) => {
      const { prefix, bucketName, key } = job.data;
      const limit = pLimit(10);
      const tasks: Promise<void>[] = [];

      return new Promise<void>((resolve, reject) => {
        const bucket = s3BucketMap[bucketName];
        if (!bucket) {
          reject(`Bucket not found: ${bucketName}`);
        }

        if (prefix) {
          const stream = bucket.listObjectsV2(prefix, true);
          stream.on('data', async (file) => {
            if (!file.name) return;

            const p = limit(() => retryFn(() => bucket.delete(file.name)));
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
        }

        if (key) {
          const p = limit(() => retryFn(() => bucket.delete(key)));
          tasks.push(p);
        }
      });
    },
    {
      concurrency: 1
    }
  );
}

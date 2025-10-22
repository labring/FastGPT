import type { RemoveOptions } from 'minio';
import { getQueue, getWorker, QueueNames } from '../bullmq';
import pLimit from 'p-limit';
import retry from 'async-retry';

export type S3MQJobData = {
  prefix: string;
  bucketName: string;
  deleteOptions?: RemoveOptions;
};

export class S3MQ {
  private static instance: S3MQ;

  static getInstance(): S3MQ {
    return (this.instance ??= new S3MQ());
  }

  async addJob(data: S3MQJobData): Promise<void> {
    const queue = getQueue<S3MQJobData>(QueueNames.s3FileDelete);

    await queue.add(
      'delete-s3-files',
      { ...data },
      {
        attempts: 3,
        removeOnFail: true,
        removeOnComplete: true,
        backoff: {
          delay: 2000,
          type: 'exponential'
        }
      }
    );
  }

  startWorker() {
    return getWorker<S3MQJobData>(
      QueueNames.s3FileDelete,
      async (job) => {
        const { prefix, bucketName, deleteOptions } = job.data;
        const limit = pLimit(10);
        const tasks: Promise<void>[] = [];

        return new Promise<void>((resolve, reject) => {
          const bucket = s3BucketMap[bucketName];
          if (!bucket) {
            reject(new Error(`Bucket not found: ${bucketName}`));
          }

          const stream = bucket.listObjectsV2(prefix, true);
          stream.on('data', async (file) => {
            if (!file.name) return;

            const p = limit(() =>
              retry(() => bucket.delete(file.name, deleteOptions), {
                retries: 3,
                minTimeout: 200
              })
            );
            tasks.push(p);
          });

          stream.on('end', async () => {
            try {
              const results = await Promise.allSettled(tasks);
              const failed = results.filter((r) => r.status === 'rejected');
              if (failed.length > 0) {
                reject(new Error('Some deletes failed'));
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
      },
      {
        concurrency: 1
      }
    );
  }
}

export const s3MQ = S3MQ.getInstance();

import { getQueue, getWorker, QueueNames } from '../bullmq';
import { addLog } from '../system/log';
import path from 'path';
import { batchRun } from '@fastgpt/global/common/system/utils';
import { isFileNotFoundError, type S3BaseBucket } from './buckets/base';

export type S3MQJobData = {
  key?: string;
  keys?: string[];
  prefix?: string;
  bucketName: string;
};

const jobOption = {
  attempts: 10,
  removeOnFail: {
    count: 10000, // 保留10000个失败任务
    age: 14 * 24 * 60 * 60 // 14 days
  },
  removeOnComplete: true,
  backoff: {
    delay: 2000,
    type: 'exponential'
  }
};
export const addS3DelJob = async (data: S3MQJobData): Promise<void> => {
  const queue = getQueue<S3MQJobData>(QueueNames.s3FileDelete);
  const jobId = (() => {
    if (data.key) {
      return data.key;
    }
    if (data.keys) {
      return undefined;
    }
    if (data.prefix) {
      return data.prefix;
    }
    throw new Error('Invalid s3 delete job data');
  })();
  await queue.add('delete-s3-files', data, { jobId, ...jobOption });
};

const prefixDel = async (bucket: S3BaseBucket, prefix: string) => {
  addLog.debug(`[S3 delete] delete prefix: ${prefix}`);
  let tasks: Promise<any>[] = [];
  return new Promise<void>(async (resolve, reject) => {
    const stream = bucket.listObjectsV2(prefix, true);
    stream.on('data', (file) => {
      if (!file.name) return;
      tasks.push(bucket.removeObject(file.name));
    });

    stream.on('end', async () => {
      if (tasks.length === 0) {
        return resolve();
      }

      const results = await Promise.allSettled(tasks);
      const failed = results.some((r) => r.status === 'rejected');
      if (failed) {
        addLog.error(`[S3 delete] delete prefix failed: ${prefix}`);
        reject('Some deletes failed');
      }
      resolve();
    });

    stream.on('error', (err) => {
      if (isFileNotFoundError(err)) {
        return resolve();
      }
      addLog.error(`[S3 delete] delete prefix: ${prefix} error`, err);
      reject(err);
    });
  });
};
export const startS3DelWorker = async () => {
  return getWorker<S3MQJobData>(
    QueueNames.s3FileDelete,
    async (job) => {
      let { prefix, bucketName, key, keys } = job.data;
      const bucket = global.s3BucketMap[bucketName];
      if (!bucket) {
        addLog.error(`Bucket not found: ${bucketName}`);
        return;
      }

      if (key) {
        keys = [key];
      }
      if (keys) {
        addLog.debug(`[S3 delete] delete keys: ${keys.length}`);
        await batchRun(keys, async (key) => {
          await bucket.removeObject(key);
          // Delete parsed
          if (!key.includes('-parsed/')) {
            const fileParsedPrefix = `${path.dirname(key)}/${path.basename(key, path.extname(key))}-parsed`;
            await prefixDel(bucket, fileParsedPrefix);
          }
        });
      }
      if (prefix) {
        await prefixDel(bucket, prefix);
      }
    },
    {
      concurrency: 3
    }
  );
};

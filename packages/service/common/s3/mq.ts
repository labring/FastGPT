import { getQueue, getWorker, QueueNames } from '../bullmq';
import { addLog } from '../system/log';
import path from 'path';
import { batchRun } from '@fastgpt/global/common/system/utils';

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
      return `${data.bucketName}:${data.prefix}`;
    }
    throw new Error('Invalid s3 delete job data');
  })();
  await queue.add('delete-s3-files', data, { jobId, ...jobOption });
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
        await bucket.client.deleteObjectsByMultiKeys({ keys });

        await batchRun(keys, async (key) => {
          if (key.includes('-parsed/')) return;
          const fileParsedPrefix = `${path.dirname(key)}/${path.basename(key, path.extname(key))}-parsed`;
          await bucket.client.deleteObjectsByPrefix({ prefix: fileParsedPrefix });
        });
      }
      if (prefix) {
        addLog.info(`[S3 delete] delete prefix: ${prefix}`);
        bucket.client.deleteObjectsByPrefix({ prefix });
        addLog.info(`[S3 delete] delete prefix: ${prefix} success`);
      }
    },
    {
      concurrency: 6
    }
  );
};

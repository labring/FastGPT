import { getQueue, getWorker, QueueNames } from '../bullmq';
import { getLogger, LogCategories } from '../logger';
import path from 'path';
import { batchRun } from '@fastgpt/global/common/system/utils';

const logger = getLogger(LogCategories.INFRA.S3);

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
        logger.error('S3 bucket not found for delete job', { bucketName });
        return;
      }

      if (key) {
        keys = [key];
      }
      if (keys) {
        logger.debug('S3 delete by keys', { bucketName, count: keys.length });
        await bucket.client.deleteObjectsByMultiKeys({ keys });

        await batchRun(keys, async (key) => {
          if (key.includes('-parsed/')) return;
          const fileParsedPrefix = `${path.dirname(key)}/${path.basename(key, path.extname(key))}-parsed`;
          await bucket.client.deleteObjectsByPrefix({ prefix: fileParsedPrefix });
        });
      }
      if (prefix) {
        logger.info('S3 delete by prefix started', { bucketName, prefix });
        bucket.client.deleteObjectsByPrefix({ prefix });
        logger.info('S3 delete by prefix completed', { bucketName, prefix });
      }
    },
    {
      concurrency: 6
    }
  );
};

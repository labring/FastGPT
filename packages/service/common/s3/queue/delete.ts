import { getQueue, getWorker, QueueNames } from '../../bullmq';
import { getLogger, LogCategories } from '../../logger';
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
    count: 10000,
    age: 14 * 24 * 60 * 60
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
    if (data.key) return data.key;
    if (data.keys) return undefined;
    if (data.prefix) return `${data.bucketName}:${data.prefix}`;
    throw new Error('Invalid s3 delete job data');
  })();

  await queue.add('delete-s3-files', data, { jobId, ...jobOption });
};

const assertNoFailedKeys = (failedKeys: string[] | undefined, action: string) => {
  if (!failedKeys || failedKeys.length === 0) return;

  const sampleKeys = failedKeys.slice(0, 5).join(', ');
  throw new Error(
    `Failed to delete ${failedKeys.length} S3 object(s) by ${action}. Sample keys: ${sampleKeys}`
  );
};

export const executeS3DeleteJob = async ({ prefix, bucketName, key, keys }: S3MQJobData) => {
  const bucket = global.s3BucketMap?.[bucketName];

  if (!bucket) {
    logger.error('S3 bucket not found for delete job', { bucketName });
    throw new Error(`S3 bucket not found for delete job: ${bucketName}`);
  }

  if (key) {
    keys = [key];
  }
  if (keys) {
    logger.debug('S3 delete by keys', { bucketName, count: keys.length });
    const result = (await bucket.client.deleteObjectsByMultiKeys({ keys })) as
      | { keys?: string[] }
      | undefined;
    assertNoFailedKeys(result?.keys, 'keys');

    await batchRun(keys, async (key) => {
      if (key.includes('-parsed/')) return;
      const fileParsedPrefix = `${path.dirname(key)}/${path.basename(key, path.extname(key))}-parsed`;
      const result = (await bucket.client.deleteObjectsByPrefix({ prefix: fileParsedPrefix })) as
        | { keys?: string[] }
        | undefined;
      assertNoFailedKeys(result?.keys, `parsed prefix ${fileParsedPrefix}`);
    });
  }
  if (prefix) {
    logger.info('S3 delete by prefix started', { bucketName, prefix });
    const result = (await bucket.client.deleteObjectsByPrefix({ prefix })) as
      | { keys?: string[] }
      | undefined;
    assertNoFailedKeys(result?.keys, `prefix ${prefix}`);
    logger.info('S3 delete by prefix completed', { bucketName, prefix });
  }
};

export const startS3DelWorker = async () => {
  return getWorker<S3MQJobData>(
    QueueNames.s3FileDelete,
    async (job) => {
      await executeS3DeleteJob(job.data);
    },
    {
      concurrency: 6
    }
  );
};

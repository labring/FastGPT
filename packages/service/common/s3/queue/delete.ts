import { getLogger, LogCategories } from '../../logger';
import path from 'path';
import { batchRun } from '@fastgpt/global/common/system/utils';
import { deleteS3DownloadAliasByObjects } from '../accessLink';
import { s3FileDeleteMQService, type S3MQJobData } from '@fastgpt/dal/redis/bullmq';

export type { S3MQJobData } from '@fastgpt/dal/redis/bullmq';

const logger = getLogger(LogCategories.INFRA.S3);

export const addS3DelJob = (data: S3MQJobData) => s3FileDeleteMQService.addJob(data);

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

    deleteS3DownloadAliasByObjects({
      bucketName,
      objectKeys: keys
    }).catch((error) => {
      logger.warn('S3 download alias cleanup failed after delete job', {
        bucketName,
        count: keys?.length,
        error
      });
    });

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
  return s3FileDeleteMQService.getWorker(async (job) => executeS3DeleteJob(job.data));
};

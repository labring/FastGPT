import { getLogger, LogCategories } from '../../logger';
import path from 'path';
import { batchRun } from '@fastgpt/global/common/system/utils';
import { deleteS3DownloadAliasByObjects } from '../accessLink';
import { s3FileDeleteMQService, type S3MQJobData } from '@fastgpt/dal/redis/bullmq';
import {
  InvalidStorageObjectKeyError,
  type InvalidStorageObjectKeyReason
} from '@fastgpt-sdk/storage';

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

/**
 * 历史遗留 key 允许降级为原始直删的断言原因。
 * 这些 key 是旧版本写入的非规范对象名（内容片段文件名、反斜线或超长 key），
 * 其余断言原因视为调用方 bug 或安全风险，不允许绕过校验。
 */
const LEGACY_DELETE_FALLBACK_REASONS: ReadonlySet<InvalidStorageObjectKeyReason> = new Set([
  'control_character',
  'backslash',
  'too_long'
]);

/** 判断错误是否属于可降级为原始 key 直删的 legacy 断言失败。 */
const isLegacyStorageKeyError = (error: unknown) =>
  error instanceof InvalidStorageObjectKeyError && LEGACY_DELETE_FALLBACK_REASONS.has(error.reason);

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
    const result = (await bucket.client.deleteObjectsByMultiKeys({ keys }).catch((error) => {
      if (!isLegacyStorageKeyError(error)) throw error;
      // 旧数据 key 含控制字符等非规范字符，校验失败但对象确实存在，降级为原始 key 直删。
      logger.warn('Legacy S3 key rejected by validation, falling back to raw key deletion', {
        bucketName,
        count: keys.length,
        reason: error.reason
      });
      return bucket.client.deleteObjectsByRawKeys({ keys });
    })) as { keys?: string[] } | undefined;
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
      const result = (await bucket.client
        .deleteObjectsByPrefix({ prefix: fileParsedPrefix })
        .catch((error) => {
          if (!isLegacyStorageKeyError(error)) throw error;
          // legacy 原始 key 派生出的 parsed 前缀同样无法通过校验，跳过即可，不影响主对象删除。
          logger.warn('Skip parsed prefix deletion for legacy key', {
            bucketName,
            prefix: fileParsedPrefix,
            reason: error.reason
          });
          return undefined;
        })) as { keys?: string[] } | undefined;
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

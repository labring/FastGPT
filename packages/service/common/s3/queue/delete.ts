import { getLogger, LogCategories } from '../../logger';
import path from 'path';
import { createHash } from 'node:crypto';
import { batchRun } from '@fastgpt/global/common/system/utils';
import { deleteS3DownloadAliasByObjects } from '../accessLink';
import { s3FileDeleteMQService, type S3MQJobData } from '@fastgpt/dal/redis/bullmq';
import {
  InvalidStorageObjectKeyError,
  collectStorageObjectKeyViolations,
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
const isLegacyStorageKeyError = (error: unknown): error is InvalidStorageObjectKeyError =>
  error instanceof InvalidStorageObjectKeyError && LEGACY_DELETE_FALLBACK_REASONS.has(error.reason);

/** 判断源 key 本身是否为 legacy 非规范 key（全部违规原因都在白名单内）。 */
const isLegacySourceKey = (key: string) => {
  const violations = collectStorageObjectKeyViolations(key);
  return (
    violations.length > 0 &&
    violations.every((reason) => LEGACY_DELETE_FALLBACK_REASONS.has(reason))
  );
};

/**
 * 批量降级前逐个校验每个 key：合法的或白名单 legacy 的允许进入原始直删；
 * 任何 key 违反其余安全相关断言则抛出对应错误，避免混合批次整批绕过校验。
 * 使用全量违规收集而不是首个违规，防止 backslash/control_character 等白名单原因
 * 遮蔽同一 key 上的 dot_path_segment 等安全违规。
 */
const assertAllKeysLegacyRawEligible = (keys: string[]) => {
  for (const key of keys) {
    const blockingReason = collectStorageObjectKeyViolations(key).find(
      (reason) => !LEGACY_DELETE_FALLBACK_REASONS.has(reason)
    );
    if (blockingReason) {
      throw new InvalidStorageObjectKeyError({ field: 'key', reason: blockingReason });
    }
  }
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
    const result = (await bucket.client.deleteObjectsByMultiKeys({ keys }).catch((error) => {
      if (!isLegacyStorageKeyError(error)) throw error;
      // 旧数据 key 含控制字符等非规范字符，校验失败但对象确实存在，降级为原始 key 直删。
      assertAllKeysLegacyRawEligible(keys);
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
          // 只有源 key 本身是 legacy 时才跳过派生前缀删除；
          // 合法 key 的派生前缀超长等问题仍按原有方式抛出，避免静默遗留孤儿对象。
          if (!isLegacyStorageKeyError(error) || !isLegacySourceKey(key)) throw error;
          // 前缀可能来自文件名/内容片段，只记录 hash 与长度，避免敏感内容进入日志。
          logger.warn('Skip parsed prefix deletion for legacy key', {
            bucketName,
            prefixHash: createHash('sha256').update(fileParsedPrefix).digest('hex').slice(0, 16),
            prefixLength: fileParsedPrefix.length,
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

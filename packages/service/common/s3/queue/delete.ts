import { getLogger, LogCategories } from '../../logger';
import { createHash } from 'node:crypto';
import { batchRun } from '@fastgpt/global/common/system/utils';
import { deleteS3DownloadAliasByObjects } from '../accessLink';
import { s3FileDeleteMQService, type S3MQJobData } from '@fastgpt/dal/redis/bullmq';
import {
  InvalidStorageObjectKeyError,
  collectStorageObjectKeyViolations,
  type InvalidStorageObjectKeyReason
} from '@fastgpt-sdk/storage';
import { getS3ParsedPrefix, isOpaqueS3ParsedObjectKey } from '../opaqueKey';
import {
  claimSiteAvatarDeletion,
  clearSiteAvatarDeletionState,
  getCurrentSiteAvatarKeys,
  isSiteAvatarObject,
  markSiteAvatarReferenced,
  releaseSiteAvatarDeletion
} from '../siteAvatarReferences';

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
    // 头像采用延迟删除；真正删除前先原子领取对象级删除状态，再确认当前站点是否重新引用。
    // 领取成功后，新的引用保存会看到 deleting 并中止，不会出现保存引用后被旧任务删除的窗口。
    // 无法读取当前配置时抛错交给 BullMQ 重试，宁可暂时保留对象也不误删。
    const avatarKeys = keys.filter((item) => isSiteAvatarObject(bucketName, item));
    const claimedAvatarKeys: string[] = [];
    if (avatarKeys.length > 0) {
      const currentSiteRefs = await getCurrentSiteAvatarKeys();
      if (currentSiteRefs === undefined) {
        throw new Error('Cannot verify site avatar references before S3 deletion');
      }

      const deletableAvatarKeys: string[] = [];
      for (const avatarKey of avatarKeys) {
        const claim = await claimSiteAvatarDeletion({ avatarKey });
        if (claim === 'referenced') continue;
        // 另一个删除任务已领取，交给它完成即可。
        if (claim === 'deleting') continue;
        if (currentSiteRefs.avatarKeys.has(avatarKey)) {
          // 当前任务刚领取了 deleting，但配置已重新引用；先释放再标记 referenced。
          await releaseSiteAvatarDeletion({ avatarKey });
          await markSiteAvatarReferenced({
            avatarKey,
            siteRevision: currentSiteRefs.revision
          });
          continue;
        }
        claimedAvatarKeys.push(avatarKey);
        deletableAvatarKeys.push(avatarKey);
      }

      keys = [
        ...keys.filter((item) => !isSiteAvatarObject(bucketName, item)),
        ...deletableAvatarKeys
      ];
      if (keys.length === 0) {
        logger.info('Skipped S3 delete job for referenced or already-claimed avatars', {
          bucketName,
          count: avatarKeys.length
        });
        return;
      }
    }

    const keysToDelete = keys;
    try {
      logger.debug('S3 delete by keys', { bucketName, count: keysToDelete.length });
      const result = (await bucket.client
        .deleteObjectsByMultiKeys({ keys: keysToDelete })
        .catch((error) => {
          if (!isLegacyStorageKeyError(error)) throw error;
          // 旧数据 key 含控制字符等非规范字符，校验失败但对象确实存在，降级为原始 key 直删。
          assertAllKeysLegacyRawEligible(keysToDelete);
          logger.warn('Legacy S3 key rejected by validation, falling back to raw key deletion', {
            bucketName,
            count: keysToDelete.length,
            reason: error.reason
          });
          return bucket.client.deleteObjectsByRawKeys({ keys: keysToDelete });
        })) as { keys?: string[] } | undefined;
      assertNoFailedKeys(result?.keys, 'keys');

      deleteS3DownloadAliasByObjects({
        bucketName,
        objectKeys: keysToDelete
      }).catch((error) => {
        logger.warn('S3 download alias cleanup failed after delete job', {
          bucketName,
          count: keysToDelete.length,
          error
        });
      });

      await batchRun(keys, async (key) => {
        if (isOpaqueS3ParsedObjectKey(key) || key.includes('-parsed/')) return;
        const fileParsedPrefix = getS3ParsedPrefix(key);
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

      await Promise.all(
        claimedAvatarKeys.map((avatarKey) => clearSiteAvatarDeletionState({ avatarKey }))
      );
    } catch (error) {
      // 删除失败时释放领取，让下一次 BullMQ 重试仍能继续；不把状态永久卡在 deleting。
      await Promise.all(
        claimedAvatarKeys.map((avatarKey) => releaseSiteAvatarDeletion({ avatarKey }))
      );
      throw error;
    }
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

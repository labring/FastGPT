import { z } from 'zod';
import { ObjectIdSchema } from '@fastgpt/global/common/type/mongo';
import { IntSchema } from '@fastgpt/global/common/zod';
import { SystemMigrationStatusEnum } from '@fastgpt/global/migration/constants';
import type { SystemMigrationFailedRecord } from '@fastgpt/global/migration/schema';
import { isMongoDeprecateIndexEnabled } from '@fastgpt/service/common/mongo/indexManager';
import { getSystemInstanceConfig } from '@fastgpt/service/common/system/systemInstanceConfig/runtime';
import {
  LLMRequestRecordCollectionName,
  LLMRequestRecordExpiredTimeIndexName
} from '@fastgpt/service/core/ai/record/schema';
import { systemMigrationBatchSize } from '@/migration/constants';
import type { SystemMigrationContext } from '@/migration/registry';
import {
  backfillLLMRequestRecordBatch,
  cleanupLegacyCreatedAtTtlIndex,
  ensureExpiredTimeTtlIndexReady,
  findLatestLLMRequestRecordId,
  findMissingExpiredTimeRecordIds,
  LEGACY_LLM_RECORD_TTL_INDEX_NAME,
  listLLMRequestRecordBatch
} from './service';

const CheckpointSchema = z.object({
  endId: ObjectIdSchema.nullable(),
  lastId: ObjectIdSchema.nullable(),
  scannedCount: IntSchema,
  backfilledCount: IntSchema
});

export type BackfillLLMRequestRecordExpiredTimeOptions = {
  /** 仅用于测试覆盖 `MONGO_DEPRECATE_INDEX` 开关解析逻辑。 */
  isCleanupEnabled?: () => boolean;
};

/**
 * 构建手动迁移任务：确认无旧版本节点混跑后，分批回填历史 LLM 追踪记录的 `expiredTime`，
 * 全表校验无遗漏且新固定 TTL 索引就绪后，按 `MONGO_DEPRECATE_INDEX` 开关安全退役旧 `createdAt_1` 索引。
 *
 * 恢复策略：分批断点续跑（固定 `endId` 上界 + `_id` 游标 checkpoint）。
 * 原因：`llm_request_records` 存量规模不可控，分批幂等补齐可避免长事务；
 * 保留 `createdAt` 字段兼容回滚，校验阶段扫全表（不限 `endId`）可阻断混跑漏网记录，
 * 确保在删除旧 `createdAt_1` 前所有记录均已受新 `expiredTime` TTL 覆盖。
 */
export const createBackfillLLMRequestRecordExpiredTimeMigration = ({
  isCleanupEnabled = isMongoDeprecateIndexEnabled
}: BackfillLLMRequestRecordExpiredTimeOptions = {}) => {
  return async (context: SystemMigrationContext) => {
    const retentionHours = getSystemInstanceConfig().performance.tracking.retentionHours;

    // ==================== 阶段 1：分批回填 expiredTime（保留 createdAt） ====================
    await context.reportProgress({
      key: 'backfill',
      status: SystemMigrationStatusEnum.running
    });

    let checkpoint = await context.getCheckpoint(CheckpointSchema);
    await context.assertActive();
    const latestId = await findLatestLLMRequestRecordId();
    if (!checkpoint) {
      checkpoint = {
        endId: latestId,
        lastId: null,
        scannedCount: 0,
        backfilledCount: 0
      };
      await context.saveCheckpoint(checkpoint);
    } else if (latestId && (!checkpoint.endId || latestId > checkpoint.endId)) {
      // 重试时若集合在旧上界之后新增了未回填记录（例如首次因混跑校验失败后管理员停掉旧实例再重试），
      // 将扫描上界推进到最新 _id，从 lastId 之后增量补齐而不重扫已完成范围。
      checkpoint = {
        ...checkpoint,
        endId: latestId
      };
      await context.saveCheckpoint(checkpoint);
    }

    while (checkpoint.endId) {
      context.signal.throwIfAborted();
      await context.assertActive();

      const items = await listLLMRequestRecordBatch({
        endId: checkpoint.endId,
        lastId: checkpoint.lastId,
        limit: systemMigrationBatchSize
      });
      if (items.length === 0) break;

      const { backfilledCount } = await backfillLLMRequestRecordBatch({
        items,
        retentionHours
      });

      checkpoint = {
        ...checkpoint,
        lastId: items.at(-1)!.id,
        scannedCount: checkpoint.scannedCount + items.length,
        backfilledCount: checkpoint.backfilledCount + backfilledCount
      };
      await context.saveCheckpoint(checkpoint);
      await context.reportProgress({
        key: 'backfill',
        status: SystemMigrationStatusEnum.running,
        current: checkpoint.scannedCount
      });
    }

    await context.reportProgress({
      key: 'backfill',
      status: SystemMigrationStatusEnum.succeeded,
      current: checkpoint.scannedCount
    });

    // ==================== 阶段 2：全表校验回填与新 TTL 索引就绪 ====================
    await context.reportProgress({
      key: 'validation',
      status: SystemMigrationStatusEnum.running
    });
    context.signal.throwIfAborted();
    await context.assertActive();

    const validationFailures: SystemMigrationFailedRecord[] = [];
    const missingIds = await findMissingExpiredTimeRecordIds(systemMigrationBatchSize);
    for (const id of missingIds) {
      validationFailures.push({
        stageKey: 'validation',
        data: { id },
        reason: {
          message:
            'LLM request record is missing a valid Date expiredTime; ensure all legacy instances are stopped and retry'
        }
      });
    }

    const newIndexReady = await ensureExpiredTimeTtlIndexReady();
    if (!newIndexReady) {
      validationFailures.push({
        stageKey: 'validation',
        data: {
          collection: LLMRequestRecordCollectionName,
          indexName: LLMRequestRecordExpiredTimeIndexName
        },
        reason: {
          message: 'Expected expiredTime TTL index (expireAfterSeconds: 0) is not ready yet'
        }
      });
    }

    if (validationFailures.length > 0) {
      await context.fail({
        message: 'LLM request record expiredTime validation failed before legacy index cleanup',
        failedRecords: validationFailures
      });
    }

    await context.reportProgress({
      key: 'validation',
      status: SystemMigrationStatusEnum.succeeded
    });

    // ==================== 阶段 3：按 MONGO_DEPRECATE_INDEX 开关安全清理旧 createdAt_1 索引 ====================
    await context.reportProgress({
      key: 'cleanupLegacyIndex',
      status: SystemMigrationStatusEnum.running
    });
    context.signal.throwIfAborted();
    await context.assertActive();

    const applyCleanup = isCleanupEnabled();
    const cleanupOutcome = await cleanupLegacyCreatedAtTtlIndex({ apply: applyCleanup });

    if (cleanupOutcome.status === 'deferred_disabled') {
      await context.fail({
        message:
          'Legacy createdAt_1 TTL index cleanup is deferred while MONGO_DEPRECATE_INDEX is disabled',
        failedRecords: [
          {
            stageKey: 'cleanupLegacyIndex',
            data: {
              collection: LLMRequestRecordCollectionName,
              indexName: LEGACY_LLM_RECORD_TTL_INDEX_NAME
            },
            reason: {
              message:
                'Skipped because MONGO_DEPRECATE_INDEX is disabled; enable it or drop createdAt_1 manually and retry'
            }
          }
        ]
      });
    }

    if (cleanupOutcome.status === 'skipped_mismatch') {
      context.logger.warn(
        'Preserved non-standard createdAt_1 index on llm_request_records due to signature mismatch',
        {
          collection: LLMRequestRecordCollectionName,
          indexName: LEGACY_LLM_RECORD_TTL_INDEX_NAME,
          reason: cleanupOutcome.reason
        }
      );
    }

    if (applyCleanup) {
      const postCheck = await cleanupLegacyCreatedAtTtlIndex({ apply: false });
      if (postCheck.status === 'deferred_disabled') {
        await context.fail({
          message: 'Legacy createdAt_1 TTL index still exists after cleanup',
          failedRecords: [
            {
              stageKey: 'cleanupLegacyIndex',
              data: {
                collection: LLMRequestRecordCollectionName,
                indexName: LEGACY_LLM_RECORD_TTL_INDEX_NAME
              },
              reason: {
                message: 'Legacy createdAt_1 TTL index still exists after cleanup'
              }
            }
          ]
        });
      }
    }

    const legacyIndexDropped = cleanupOutcome.status === 'dropped' ? 1 : 0;

    await context.reportProgress({
      key: 'cleanupLegacyIndex',
      status: SystemMigrationStatusEnum.succeeded
    });

    return {
      scannedCount: checkpoint.scannedCount,
      backfilledCount: checkpoint.backfilledCount,
      legacyIndexDropped
    };
  };
};

export const backfillLLMRequestRecordExpiredTime =
  createBackfillLLMRequestRecordExpiredTimeMigration();

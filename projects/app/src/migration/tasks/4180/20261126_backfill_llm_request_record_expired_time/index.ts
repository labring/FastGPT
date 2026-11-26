import { z } from 'zod';
import { ObjectIdSchema } from '@fastgpt/global/common/type/mongo';
import { IntSchema } from '@fastgpt/global/common/zod';
import { SystemMigrationStatusEnum } from '@fastgpt/global/migration/constants';
import type { SystemMigrationFailedRecord } from '@fastgpt/global/migration/schema';
import { Types } from '@fastgpt/service/common/mongo';
import { getSystemInstanceConfig } from '@fastgpt/service/common/system/systemInstanceConfig/runtime';
import {
  LLMRequestRecordCollectionName,
  LLMRequestRecordExpiredTimeIndexName,
  MongoLLMRequestRecord
} from '@fastgpt/service/core/ai/record/schema';
import { systemMigrationBatchSize } from '@/migration/constants';
import type { SystemMigrationContext } from '@/migration/registry';
import {
  backfillLLMRequestRecordBatch,
  dropLegacyCreatedAtTtlIndex,
  ensureExpiredTimeTtlIndex,
  isExpiredTimeTtlIndex,
  isLegacyCreatedAtTtlIndex,
  LEGACY_LLM_RECORD_TTL_INDEX_NAME,
  listCollectionIndexesSafe,
  type LLMRequestRecordMigrationDoc
} from './service';

const CheckpointSchema = z.object({
  endId: ObjectIdSchema.nullable(),
  lastId: ObjectIdSchema.nullable(),
  scannedCount: IntSchema,
  backfilledCount: IntSchema
});

/**
 * 后台独立分批回填历史 LLM 追踪记录的 `expiredTime` 字段并移除旧 `createdAt` 字段及 `createdAt_1` TTL 索引。
 *
 * 恢复策略：分批断点续跑（固定 `endId` 上界 + `_id` 游标 checkpoint）。
 * 原因：`llm_request_records` 属于高写入日志集合，存量规模不可控，分批幂等写入可避免长事务和重复扫表；
 * 补齐并校验前置新索引 `fg_llm_req_expired_time` 就绪后再删除旧 `createdAt_1` TTL 索引，防止调大保留时长时
 * 新记录被旧索引提前误删，也避免删除旧索引后导致存量文档永久残留。
 */
export const backfillLLMRequestRecordExpiredTime = async (context: SystemMigrationContext) => {
  const collection = MongoLLMRequestRecord.collection;
  const retentionHours = getSystemInstanceConfig().performance.tracking.retentionHours;

  // ==================== 阶段 1：分批回填 expiredTime ====================
  await context.reportProgress({
    key: 'backfill',
    status: SystemMigrationStatusEnum.running
  });

  let checkpoint = await context.getCheckpoint(CheckpointSchema);
  if (!checkpoint) {
    await context.assertActive();
    const last = await collection.findOne({}, { projection: { _id: 1 }, sort: { _id: -1 } });
    checkpoint = {
      endId: last ? String(last._id) : null,
      lastId: null,
      scannedCount: 0,
      backfilledCount: 0
    };
    await context.saveCheckpoint(checkpoint);
  }

  while (checkpoint.endId) {
    context.signal.throwIfAborted();
    await context.assertActive();

    const docs = (await collection
      .find(
        {
          _id: {
            $lte: new Types.ObjectId(checkpoint.endId),
            ...(checkpoint.lastId ? { $gt: new Types.ObjectId(checkpoint.lastId) } : {})
          }
        },
        { projection: { _id: 1, createdAt: 1, expiredTime: 1 } }
      )
      .sort({ _id: 1 })
      .limit(systemMigrationBatchSize)
      .toArray()) as LLMRequestRecordMigrationDoc[];

    if (docs.length === 0) break;

    const { backfilledCount } = await backfillLLMRequestRecordBatch({
      collection,
      docs,
      retentionHours
    });

    checkpoint = {
      ...checkpoint,
      lastId: String(docs.at(-1)!._id),
      scannedCount: checkpoint.scannedCount + docs.length,
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

  // ==================== 阶段 2：确保新 TTL 索引就绪并清理旧 createdAt_1 索引 ====================
  await context.reportProgress({
    key: 'cleanupLegacyIndex',
    status: SystemMigrationStatusEnum.running
  });
  context.signal.throwIfAborted();
  await context.assertActive();

  await ensureExpiredTimeTtlIndex(collection);

  const dropStatus = await dropLegacyCreatedAtTtlIndex(collection);
  if (dropStatus === 'skipped_mismatch') {
    context.logger.warn(
      'Preserved non-standard createdAt_1 index on llm_request_records due to signature mismatch',
      {
        collection: LLMRequestRecordCollectionName,
        indexName: LEGACY_LLM_RECORD_TTL_INDEX_NAME
      }
    );
  }
  const legacyIndexDropped = dropStatus === 'dropped' ? 1 : 0;

  await context.reportProgress({
    key: 'cleanupLegacyIndex',
    status: SystemMigrationStatusEnum.succeeded
  });

  // ==================== 阶段 3：校验回填与索引状态 ====================
  await context.reportProgress({
    key: 'validation',
    status: SystemMigrationStatusEnum.running
  });
  context.signal.throwIfAborted();
  await context.assertActive();

  const validationFailures: SystemMigrationFailedRecord[] = [];

  if (checkpoint.endId) {
    const missingDocs = await collection
      .find(
        {
          _id: { $lte: new Types.ObjectId(checkpoint.endId) },
          expiredTime: { $not: { $type: 'date' } }
        },
        { projection: { _id: 1 } }
      )
      .sort({ _id: 1 })
      .limit(systemMigrationBatchSize)
      .toArray();

    for (const doc of missingDocs) {
      validationFailures.push({
        stageKey: 'validation',
        data: { id: String(doc._id) },
        reason: {
          message: 'LLM request record is missing a valid Date expiredTime after backfill'
        }
      });
    }
  }

  const finalIndexes = await listCollectionIndexesSafe(collection);
  if (!finalIndexes.some(isExpiredTimeTtlIndex)) {
    validationFailures.push({
      stageKey: 'validation',
      data: {
        collection: LLMRequestRecordCollectionName,
        indexName: LLMRequestRecordExpiredTimeIndexName
      },
      reason: {
        message: 'Expected expiredTime TTL index (expireAfterSeconds: 0) is missing'
      }
    });
  }
  if (finalIndexes.some(isLegacyCreatedAtTtlIndex)) {
    validationFailures.push({
      stageKey: 'validation',
      data: {
        collection: LLMRequestRecordCollectionName,
        indexName: LEGACY_LLM_RECORD_TTL_INDEX_NAME
      },
      reason: {
        message: 'Legacy createdAt_1 TTL index still exists after cleanup'
      }
    });
  }

  if (validationFailures.length > 0) {
    await context.fail({
      message: 'LLM request record expiredTime migration validation failed',
      failedRecords: validationFailures
    });
  }

  await context.reportProgress({
    key: 'validation',
    status: SystemMigrationStatusEnum.succeeded
  });

  return {
    scannedCount: checkpoint.scannedCount,
    backfilledCount: checkpoint.backfilledCount,
    legacyIndexDropped
  };
};

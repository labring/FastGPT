import { z } from 'zod';
import { clampLlmTraceRetentionHours } from '@fastgpt/global/common/system/config/schemas/performance';
import { ObjectIdSchema } from '@fastgpt/global/common/type/mongo';
import { IntSchema } from '@fastgpt/global/common/zod';
import { SystemMigrationStatusEnum } from '@fastgpt/global/migration/constants';
import type { SystemMigrationFailedRecord } from '@fastgpt/global/migration/schema';
import { getSystemInstanceConfig } from '@fastgpt/service/common/system/systemInstanceConfig/runtime';
import { getLegacyCreatedAtTtlSeconds } from '@fastgpt/service/core/ai/record/mongo/ttl';
import {
  LLMRequestRecordCollectionName,
  LLMRequestRecordExpiredTimeIndexName
} from '@fastgpt/service/core/ai/record/schema';
import { systemMigrationBatchSize } from '@/migration/constants';
import type { SystemMigrationContext } from '@/migration/registry';
import {
  backfillLLMRequestRecordBatch,
  ensureExpiredTimeTtlIndexReady,
  findLatestLLMRequestRecordId,
  findMissingExpiredTimeRecordIds,
  listLLMRequestRecordBatch,
  listLLMRequestRecordsByIds
} from './mongo/repository';

const CheckpointSchema = z.object({
  endId: ObjectIdSchema.nullable(),
  lastId: ObjectIdSchema.nullable(),
  scannedCount: IntSchema,
  backfilledCount: IntSchema,
  backfillTtlSeconds: z.number().int().nonnegative().optional()
});

/**
 * 解析存量回填应沿用的有效过期秒数：
 * 优先读取现网旧 `createdAt_1` TTL 索引的实际 `expireAfterSeconds`，保证先调小运行配置再回填时
 * 不缩短旧记录原有保留期；仅在库中已无旧 `createdAt` TTL 索引时回退到当前配置值。
 */
const resolveBackfillTtlSeconds = async (): Promise<number> => {
  const legacyTtlSeconds = await getLegacyCreatedAtTtlSeconds();
  if (legacyTtlSeconds !== null) {
    return Math.trunc(legacyTtlSeconds);
  }
  const fallbackHours = clampLlmTraceRetentionHours(
    getSystemInstanceConfig().performance.tracking.retentionHours
  );
  return fallbackHours * 3600;
};

const extractRetryRecordIds = (failures: readonly SystemMigrationFailedRecord[]): string[] => {
  const uniqueIds = new Set<string>();
  for (const failure of failures) {
    const parsed = ObjectIdSchema.safeParse(failure.data.id);
    if (parsed.success) {
      uniqueIds.add(parsed.data);
    }
  }
  return [...uniqueIds];
};

/**
 * 构建手动迁移任务：确认无旧版本节点混跑后，分批回填历史 LLM 追踪记录的 `expiredTime`，
 * 并完成全表覆盖校验与新固定 TTL 索引（`fg_llm_req_expired_time`）就绪校验。
 *
 * 恢复策略：先按失败明细 ID 幂等补齐（覆盖旧节点同秒写入于游标 `_id < lastId` 之前的漏网记录），
 * 再按固定 `endId` 上界 + `_id` 游标 checkpoint 增量扫描；
 * 遵循两版本 Expand-Contract 索引退役规范，本版只扩展与回填、不删除旧 `createdAt_1` 索引（留待 N+1 统一清理）。
 */
export const backfillLLMRequestRecordExpiredTime = async (context: SystemMigrationContext) => {
  // ==================== 阶段 1：消费失败明细 + 分批回填 expiredTime（保留 createdAt） ====================
  await context.reportProgress({
    key: 'backfill',
    status: SystemMigrationStatusEnum.running
  });

  let checkpoint = await context.getCheckpoint(CheckpointSchema);
  await context.assertActive();
  const latestId = await findLatestLLMRequestRecordId();

  if (!checkpoint) {
    const backfillTtlSeconds = await resolveBackfillTtlSeconds();
    checkpoint = {
      endId: latestId,
      lastId: null,
      scannedCount: 0,
      backfilledCount: 0,
      backfillTtlSeconds
    };
    await context.saveCheckpoint(checkpoint);
  } else {
    let checkpointChanged = false;
    if (checkpoint.backfillTtlSeconds === undefined) {
      checkpoint = {
        ...checkpoint,
        backfillTtlSeconds: await resolveBackfillTtlSeconds()
      };
      checkpointChanged = true;
    }
    if (latestId && (!checkpoint.endId || latestId > checkpoint.endId)) {
      // 重试时若集合在旧上界之后新增了未回填记录，将扫描上界推进到最新 _id，从 lastId 之后增量补齐。
      checkpoint = {
        ...checkpoint,
        endId: latestId
      };
      checkpointChanged = true;
    }
    if (checkpointChanged) {
      await context.saveCheckpoint(checkpoint);
    }
  }

  const backfillTtlSeconds = checkpoint.backfillTtlSeconds!;

  // 优先按 ID 幂等补齐上次校验留下的失败记录（例如跨进程同秒生成的 _id < lastId 漏写记录），
  // 每批先刷新错误快照再推进 checkpoint，保证中断重入不丢状态。
  let remainingFailures = await context.getFailedRecords();
  const retryIds = extractRetryRecordIds(remainingFailures);
  for (let offset = 0; offset < retryIds.length; offset += systemMigrationBatchSize) {
    context.signal.throwIfAborted();
    await context.assertActive();

    const chunkIds = retryIds.slice(offset, offset + systemMigrationBatchSize);
    const retryItems = await listLLMRequestRecordsByIds(chunkIds);
    const { backfilledCount } = await backfillLLMRequestRecordBatch({
      items: retryItems,
      ttlSeconds: backfillTtlSeconds
    });

    const processedSet = new Set(chunkIds);
    remainingFailures = remainingFailures.filter(
      (failure) => typeof failure.data.id !== 'string' || !processedSet.has(failure.data.id)
    );
    await context.reportFailedRecords(remainingFailures);

    if (backfilledCount > 0) {
      checkpoint = {
        ...checkpoint,
        backfilledCount: checkpoint.backfilledCount + backfilledCount
      };
      await context.saveCheckpoint(checkpoint);
    }
    await context.reportProgress({
      key: 'backfill',
      status: SystemMigrationStatusEnum.running,
      current: checkpoint.scannedCount
    });
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
      ttlSeconds: backfillTtlSeconds
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

  // ==================== 阶段 2：全表校验回填覆盖与新 TTL 索引就绪 ====================
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
      message: 'LLM request record expiredTime validation failed',
      failedRecords: validationFailures
    });
  }

  // 全表校验通过后清空历史残留错误快照（例如此前因索引未就绪记录的失败项）。
  if (remainingFailures.length > 0) {
    await context.reportFailedRecords([]);
  }

  await context.reportProgress({
    key: 'validation',
    status: SystemMigrationStatusEnum.succeeded
  });

  return {
    scannedCount: checkpoint.scannedCount,
    backfilledCount: checkpoint.backfilledCount
  };
};

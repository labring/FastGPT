import { ObjectIdSchema } from '@fastgpt/global/common/type/mongo';
import { IntSchema } from '@fastgpt/global/common/zod';
import { ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
import { SystemMigrationStatusEnum } from '@fastgpt/global/migration/constants';
import type { SystemMigrationFailedRecord } from '@fastgpt/global/migration/schema';
import { Types } from '@fastgpt/service/common/mongo';
import { MongoAIModel } from '@fastgpt/service/core/ai/model/schema';
import { z } from 'zod';
import { systemMigrationBatchSize } from '@/migration/constants';
import type { SystemMigrationContext } from '@/migration/registry';
import {
  backfillSTTPricingTypeRecord,
  migrateTierMaxInputTokensInTransaction,
  validateBackfilledSTTPricingTypes,
  validateMigratedTierMaxInputTokens
} from './service';

const CheckpointSchema = z.object({
  stt: z
    .object({
      endId: ObjectIdSchema.nullable(),
      lastId: ObjectIdSchema.nullable(),
      scanned: IntSchema
    })
    .optional(),
  sttCompleted: z.boolean().optional(),
  llmCompleted: z.boolean().optional(),
  llmScanned: IntSchema.optional(),
  llmMigrated: IntSchema.optional()
});

type ModelPricingCheckpoint = z.infer<typeof CheckpointSchema>;

/**
 * 独立后台模型价格迁移（三阶段）：
 * 1. `stt`：分批断点回填缺少计价类型的 STT 模型为 `duration`；
 * 2. `llmTiers`：单事务回填缺失 `tierUnit` 的系统 LLM 阶梯（含 `< 1` 上限乘千转 K，其余仅回填 `tierUnit: 'K'`；已标 `K` 跳过）；
 * 3. `validation`：联合校验全库 STT 计价类型与系统 LLM 阶梯上限。
 */
export const migrateModelPricing = async (context: SystemMigrationContext) => {
  const collection = MongoAIModel.collection;
  let checkpoint: ModelPricingCheckpoint = (await context.getCheckpoint(CheckpointSchema)) ?? {};

  // ==================== 阶段 1：STT 计价类型回填 ====================
  await context.reportProgress({ key: 'stt', status: SystemMigrationStatusEnum.running });

  if (!checkpoint.stt) {
    const last = await collection.findOne(
      { type: ModelTypeEnum.stt },
      { projection: { _id: 1 }, sort: { _id: -1 } }
    );
    checkpoint = {
      ...checkpoint,
      stt: { endId: last ? String(last._id) : null, lastId: null, scanned: 0 }
    };
    await context.saveCheckpoint(checkpoint);
  }

  const sttFailures = new Map<string, SystemMigrationFailedRecord>();
  for (const failure of await context.getFailedRecords()) {
    if (failure.stageKey === 'stt' || failure.stageKey === 'validation') {
      sttFailures.set(String(failure.data.id), failure);
    }
  }

  /** 错误只记录 ID 和固定原因，不把凭证或原记录写入管理员错误明细。 */
  const processSttRecord = async (id: string) => {
    await context.assertActive();
    try {
      await backfillSTTPricingTypeRecord(id);
      sttFailures.delete(id);
    } catch {
      context.signal.throwIfAborted();
      sttFailures.set(id, {
        stageKey: 'stt',
        data: { id },
        reason: {
          message: 'Invalid or concurrently modified STT pricing; repair before retrying'
        }
      });
    }
  };

  for (const id of [...sttFailures.keys()]) await processSttRecord(id);
  await context.reportFailedRecords([...sttFailures.values()]);

  if (!checkpoint.sttCompleted) {
    let sttCursor = checkpoint.stt!;
    while (sttCursor.endId) {
      context.signal.throwIfAborted();
      await context.assertActive();
      const records = await collection
        .find(
          {
            type: ModelTypeEnum.stt,
            _id: {
              $lte: new Types.ObjectId(sttCursor.endId),
              ...(sttCursor.lastId ? { $gt: new Types.ObjectId(sttCursor.lastId) } : {})
            }
          },
          { projection: { _id: 1 } }
        )
        .sort({ _id: 1 })
        .limit(systemMigrationBatchSize)
        .toArray();
      if (!records.length) break;
      for (const record of records) {
        await processSttRecord(String(record._id));
        if (sttFailures.size >= systemMigrationBatchSize * 10) {
          await context.fail({
            message: 'Too many invalid STT pricing records',
            failedRecords: [...sttFailures.values()]
          });
        }
      }
      await context.reportFailedRecords([...sttFailures.values()]);
      sttCursor = {
        ...sttCursor,
        lastId: String(records.at(-1)!._id),
        scanned: sttCursor.scanned + records.length
      };
      checkpoint = { ...checkpoint, stt: sttCursor };
      await context.saveCheckpoint(checkpoint);
      await context.reportProgress({
        key: 'stt',
        status: SystemMigrationStatusEnum.running,
        current: sttCursor.scanned
      });
    }

    if (sttFailures.size) {
      await context.fail({
        message: 'Some STT pricing records require repair',
        failedRecords: [...sttFailures.values()]
      });
    }

    checkpoint = { ...checkpoint, stt: sttCursor, sttCompleted: true };
    await context.saveCheckpoint(checkpoint);
  } else if (sttFailures.size) {
    await context.fail({
      message: 'Some STT pricing records require repair',
      failedRecords: [...sttFailures.values()]
    });
  }

  await context.reportProgress({
    key: 'stt',
    status: SystemMigrationStatusEnum.succeeded,
    current: checkpoint.stt?.scanned ?? 0
  });

  // ==================== 阶段 2：LLM 阶梯输入上限 M -> K ====================
  await context.reportProgress({ key: 'llmTiers', status: SystemMigrationStatusEnum.running });
  await context.assertActive();

  if (!checkpoint.llmCompleted) {
    const llmResult = await migrateTierMaxInputTokensInTransaction({
      signal: context.signal,
      assertActive: context.assertActive
    });
    if (llmResult.failures.length > 0) {
      await context.fail({
        message: 'Some LLM pricing tiers require repair',
        failedRecords: llmResult.failures
      });
    }
    checkpoint = {
      ...checkpoint,
      llmCompleted: true,
      llmScanned: llmResult.scannedCount,
      llmMigrated: llmResult.migratedCount
    };
    await context.saveCheckpoint(checkpoint);
  }

  await context.assertActive();
  await context.reportProgress({
    key: 'llmTiers',
    status: SystemMigrationStatusEnum.succeeded,
    current: checkpoint.llmScanned ?? 0,
    total: checkpoint.llmScanned ?? 0
  });

  // ==================== 阶段 3：联合校验 ====================
  await context.reportProgress({ key: 'validation', status: SystemMigrationStatusEnum.running });
  await context.assertActive();

  const [sttValidationFailures, llmValidationFailures] = await Promise.all([
    validateBackfilledSTTPricingTypes(),
    validateMigratedTierMaxInputTokens()
  ]);
  const validationFailures = [...sttValidationFailures, ...llmValidationFailures];

  if (validationFailures.length > 0) {
    await context.fail({
      message: 'Model pricing migration validation failed',
      failedRecords: validationFailures
    });
  }

  await context.reportProgress({ key: 'validation', status: SystemMigrationStatusEnum.succeeded });
  return {
    sttModels: checkpoint.stt?.scanned ?? 0,
    llmModels: checkpoint.llmMigrated ?? 0
  };
};

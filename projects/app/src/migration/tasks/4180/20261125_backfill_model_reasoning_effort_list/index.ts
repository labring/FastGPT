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
  LLM_BACKFILL_PROJECTION,
  loadPluginReasoningEffortPresets,
  precheckModelReasoningEffortBatch,
  processBackfillModelBatch,
  validateBackfilledModelReasoningEffortList,
  type RawLlmModelRecord
} from './service';

const CheckpointSchema = z.object({
  endId: ObjectIdSchema.nullable(),
  lastId: ObjectIdSchema.nullable(),
  scannedCount: IntSchema,
  precheckPassed: z.boolean(),
  backfillCompleted: z.boolean()
});

/**
 * 手动触发的模型可用思考等级回填迁移（分批断点续跑）：
 * 团队模型按 `(teamId, tmbId, model)` 去重，总量随团队与成员数增长无固定上界，
 * 因此采用 `_id` 稳定游标 + 固定批次大小 + checkpoint 断点续跑，并在首次写入前完成分批预检拦截坏数据。
 * 完成结果仅输出与重放无关的确定性指标（`presetCount` 与终态复验通过的 `verifiedCount`），避免至少一次重放导致增量计数漂移。
 *
 * 运行前提：须在所有 App 实例与 `fastgpt-plugin` 均升级完成后由管理员手动触发，
 * 避免旧版本 App 保存模型时按旧 Schema 剥离已回填的 `reasoningEffortList`。
 *
 * 阶段顺序：
 * 1. `loadPresets`：从 fastgpt-plugin 拉取最新 LLM 模板预设；未拉取到任何思考等级预设时明确失败。
 * 2. `backfill`：首次写入前按 `_id` 分批预检源数据（存在非法值时零写入中止）；随后优先重试历史失败记录，
 *    再按 `_id` 游标分批在目录快照事务内 CAS 回填缺失或空的列表并推进 checkpoint（先持久化错误快照再保存断点）。
 * 3. `validation`：按 `_id` 游标分批复验所有命中预设的存量模型均具备合法的非空 `reasoningEffortList`。
 */
export const createBackfillModelReasoningEffortListMigration =
  (batchSize: number = systemMigrationBatchSize) =>
  async (context: SystemMigrationContext) => {
    const maxFailedRecords = batchSize * 10;

    // ==================== 阶段 1：加载插件思考等级预设 ====================
    await context.reportProgress({ key: 'loadPresets', status: SystemMigrationStatusEnum.running });
    await context.assertActive();

    const presetMap = await loadPluginReasoningEffortPresets();
    if (presetMap.size === 0) {
      await context.fail({
        message:
          'No plugin model presets with reasoningEffortList were returned; upgrade fastgpt-plugin before running this migration',
        failedRecords: []
      });
    }

    await context.reportProgress({
      key: 'loadPresets',
      status: SystemMigrationStatusEnum.succeeded,
      current: presetMap.size,
      total: presetMap.size
    });

    // ==================== 阶段 2：分批预检与回填存量模型思考等级 ====================
    await context.reportProgress({ key: 'backfill', status: SystemMigrationStatusEnum.running });
    await context.assertActive();

    let checkpoint = await context.getCheckpoint(CheckpointSchema);
    const unresolvedFailures = new Map<string, SystemMigrationFailedRecord>();
    for (const failure of await context.getFailedRecords()) {
      if (failure.stageKey === 'backfill' || failure.stageKey === 'validation') {
        const id = String(failure.data.id ?? '');
        if (id) unresolvedFailures.set(id, failure);
      }
    }

    // 首次写入前分批预检源数据：发现非法 scope 或非法 reasoningEffortList 时立即中止，保证零局部写入。
    if (!checkpoint?.precheckPassed) {
      const lastDoc = await MongoAIModel.collection.findOne(
        { type: ModelTypeEnum.llm },
        { projection: { _id: 1 }, sort: { _id: -1 } }
      );
      const endId = lastDoc ? String(lastDoc._id) : null;

      const precheckFailures = await precheckModelReasoningEffortBatch({
        presetMap,
        endId,
        batchSize,
        signal: context.signal,
        assertActive: context.assertActive
      });
      if (precheckFailures.length > 0) {
        await context.fail({
          message:
            'Some LLM models have invalid scope or reasoningEffortList; repair before retrying',
          failedRecords: precheckFailures
        });
      }

      if (unresolvedFailures.size > 0) {
        unresolvedFailures.clear();
        await context.reportFailedRecords([]);
      }

      checkpoint = {
        endId,
        lastId: null,
        scannedCount: 0,
        precheckPassed: true,
        backfillCompleted: false
      };
      await context.saveCheckpoint(checkpoint);
    }

    // 若断点恢复时仍存在历史失败记录（含写入中途并发产生的坏数据或校验失败项），先按批重试修复。
    if (unresolvedFailures.size > 0) {
      const retryIds = [...unresolvedFailures.keys()];
      let failuresChanged = false;

      for (let i = 0; i < retryIds.length; i += batchSize) {
        context.signal.throwIfAborted();
        await context.assertActive();

        const chunkIds = retryIds.slice(i, i + batchSize);
        const validObjectIds = chunkIds
          .filter((id) => Types.ObjectId.isValid(id))
          .map((id) => new Types.ObjectId(id));

        const docs = validObjectIds.length
          ? ((await MongoAIModel.collection
              .find(
                { _id: { $in: validObjectIds }, type: ModelTypeEnum.llm },
                { projection: LLM_BACKFILL_PROJECTION }
              )
              .sort({ _id: 1 })
              .toArray()) as RawLlmModelRecord[])
          : [];

        const foundIdSet = new Set(docs.map((doc) => String(doc._id)));
        for (const id of chunkIds) {
          if (!foundIdSet.has(id) && unresolvedFailures.delete(id)) {
            failuresChanged = true;
          }
        }

        if (docs.length > 0) {
          const retryResult = await processBackfillModelBatch({
            records: docs,
            presetMap,
            signal: context.signal,
            assertActive: context.assertActive
          });

          for (const id of retryResult.resolvedIds) {
            if (unresolvedFailures.delete(id)) failuresChanged = true;
          }
          for (const failure of retryResult.failures) {
            unresolvedFailures.set(String(failure.data.id), failure);
            failuresChanged = true;
          }
        }

        if (failuresChanged) {
          await context.reportFailedRecords([...unresolvedFailures.values()]);
          failuresChanged = false;
        }
      }
    }

    if (!checkpoint.backfillCompleted) {
      while (checkpoint.endId) {
        context.signal.throwIfAborted();
        await context.assertActive();

        const records = (await MongoAIModel.collection
          .find(
            {
              type: ModelTypeEnum.llm,
              _id: {
                $lte: new Types.ObjectId(checkpoint.endId),
                ...(checkpoint.lastId ? { $gt: new Types.ObjectId(checkpoint.lastId) } : {})
              }
            },
            { projection: LLM_BACKFILL_PROJECTION }
          )
          .sort({ _id: 1 })
          .limit(batchSize)
          .toArray()) as RawLlmModelRecord[];

        if (records.length === 0) break;

        const batchResult = await processBackfillModelBatch({
          records,
          presetMap,
          signal: context.signal,
          assertActive: context.assertActive
        });

        let failuresChanged = false;
        for (const id of batchResult.resolvedIds) {
          if (unresolvedFailures.delete(id)) failuresChanged = true;
        }
        for (const failure of batchResult.failures) {
          unresolvedFailures.set(String(failure.data.id), failure);
          failuresChanged = true;
        }

        // 先持久化完整未解决错误快照，再推进断点，防止两者之间进程退出导致坏数据被永久跳过。
        if (failuresChanged) {
          await context.reportFailedRecords([...unresolvedFailures.values()]);
        }

        checkpoint = {
          ...checkpoint,
          lastId: String(records.at(-1)!._id),
          scannedCount: checkpoint.scannedCount + records.length
        };
        await context.saveCheckpoint(checkpoint);

        await context.reportProgress({
          key: 'backfill',
          status: SystemMigrationStatusEnum.running,
          current: checkpoint.scannedCount
        });

        if (unresolvedFailures.size >= maxFailedRecords) {
          await context.fail({
            message: 'Too many invalid LLM model records during backfill',
            failedRecords: [...unresolvedFailures.values()]
          });
        }
      }

      if (unresolvedFailures.size > 0) {
        await context.fail({
          message:
            'Some LLM models could not be backfilled; repair invalid records before retrying',
          failedRecords: [...unresolvedFailures.values()]
        });
      }

      checkpoint = {
        ...checkpoint,
        backfillCompleted: true
      };
      await context.saveCheckpoint(checkpoint);
    } else if (unresolvedFailures.size > 0) {
      await context.fail({
        message: 'Some LLM models could not be backfilled; repair invalid records before retrying',
        failedRecords: [...unresolvedFailures.values()]
      });
    }

    await context.assertActive();
    await context.reportProgress({
      key: 'backfill',
      status: SystemMigrationStatusEnum.succeeded,
      current: checkpoint.scannedCount,
      total: checkpoint.scannedCount
    });

    // ==================== 阶段 3：分批校验回填结果 ====================
    await context.reportProgress({ key: 'validation', status: SystemMigrationStatusEnum.running });
    await context.assertActive();

    const validationResult = await validateBackfilledModelReasoningEffortList({
      presetMap,
      batchSize,
      signal: context.signal,
      assertActive: context.assertActive
    });
    if (validationResult.failures.length > 0) {
      await context.fail({
        message: 'Model reasoningEffortList backfill validation failed',
        failedRecords: validationResult.failures
      });
    }

    await context.reportProgress({
      key: 'validation',
      status: SystemMigrationStatusEnum.succeeded,
      current: validationResult.verifiedCount,
      total: validationResult.verifiedCount
    });

    return {
      presetCount: presetMap.size,
      verifiedCount: validationResult.verifiedCount
    };
  };

export const backfillModelReasoningEffortListMigration =
  createBackfillModelReasoningEffortListMigration();

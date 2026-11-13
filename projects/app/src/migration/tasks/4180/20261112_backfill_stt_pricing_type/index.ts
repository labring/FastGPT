import { z } from 'zod';
import { ObjectIdSchema } from '@fastgpt/global/common/type/mongo';
import { IntSchema } from '@fastgpt/global/common/zod';
import { SystemMigrationStatusEnum } from '@fastgpt/global/migration/constants';
import type { SystemMigrationFailedRecord } from '@fastgpt/global/migration/schema';
import { Types } from '@fastgpt/service/common/mongo';
import { MongoAIModel } from '@fastgpt/service/core/ai/model/schema';
import { systemMigrationBatchSize } from '@/migration/constants';
import type { SystemMigrationContext } from '@/migration/registry';
import { backfillSTTPricingTypeRecord } from './service';
import { ModelTypeEnum } from '@fastgpt/global/core/ai/constants';

const CheckpointSchema = z.object({
  endId: ObjectIdSchema.nullable(),
  lastId: ObjectIdSchema.nullable(),
  scanned: IntSchema
});

/**
 * 后台回填 STT 价格类型，以固定上界和 _id 游标断点续跑。
 * 错误快照先于 checkpoint 持久化，重试先处理已跳过的坏数据；只补齐缺失类型，保留单价、已有类型和其他字段。
 * 完成校验要求集合内 pricing.type 均为有效枚举，校验阶段的新异常也保留 ID 供断点后重试。
 */
export const backfillSTTPricingType = async (context: SystemMigrationContext) => {
  const collection = MongoAIModel.collection;
  let checkpoint = await context.getCheckpoint(CheckpointSchema);
  if (!checkpoint) {
    const last = await collection.findOne(
      { type: ModelTypeEnum.stt },
      { projection: { _id: 1 }, sort: { _id: -1 } }
    );
    checkpoint = { endId: last ? String(last._id) : null, lastId: null, scanned: 0 };
    await context.saveCheckpoint(checkpoint);
  }
  const failures = new Map<string, SystemMigrationFailedRecord>();
  for (const failure of await context.getFailedRecords())
    failures.set(String(failure.data.id), failure);

  /** 错误只记录 ID 和固定原因，不能把凭证或原记录写入管理员错误明细。 */
  const processRecord = async (id: string) => {
    await context.assertActive();
    try {
      await backfillSTTPricingTypeRecord(id);
      failures.delete(id);
    } catch {
      context.signal.throwIfAborted();
      failures.set(id, {
        stageKey: 'models',
        data: { id },
        reason: {
          message: 'Invalid or concurrently modified STT pricing; repair before retrying'
        }
      });
    }
  };
  await context.reportProgress({ key: 'models', status: SystemMigrationStatusEnum.running });
  for (const id of [...failures.keys()]) await processRecord(id);
  await context.reportFailedRecords([...failures.values()]);
  while (checkpoint.endId) {
    context.signal.throwIfAborted();
    await context.assertActive();
    const records = await collection
      .find(
        {
          type: ModelTypeEnum.stt,
          _id: {
            $lte: new Types.ObjectId(checkpoint.endId),
            ...(checkpoint.lastId ? { $gt: new Types.ObjectId(checkpoint.lastId) } : {})
          }
        },
        { projection: { _id: 1 } }
      )
      .sort({ _id: 1 })
      .limit(systemMigrationBatchSize)
      .toArray();
    if (!records.length) break;
    for (const record of records) {
      await processRecord(String(record._id));
      if (failures.size >= systemMigrationBatchSize * 10) {
        await context.fail({
          message: 'Too many invalid STT pricing records',
          failedRecords: [...failures.values()]
        });
      }
    }
    await context.reportFailedRecords([...failures.values()]);
    checkpoint = {
      ...checkpoint,
      lastId: String(records.at(-1)!._id),
      scanned: checkpoint.scanned + records.length
    };
    await context.saveCheckpoint(checkpoint);
    await context.reportProgress({
      key: 'models',
      status: SystemMigrationStatusEnum.running,
      current: checkpoint.scanned
    });
  }
  if (failures.size)
    await context.fail({
      message: 'Some STT pricing records require repair',
      failedRecords: [...failures.values()]
    });
  await context.reportProgress({
    key: 'models',
    status: SystemMigrationStatusEnum.succeeded,
    current: checkpoint.scanned
  });
  await context.reportProgress({ key: 'validation', status: SystemMigrationStatusEnum.running });
  await context.assertActive();
  // 完成时检查整个集合，旧节点在固定扫描上界之后写入的旧价格也必须阻止放行。
  const invalid = await collection
    .find(
      { type: ModelTypeEnum.stt, 'pricing.type': { $nin: ['duration', 'tokens'] } },
      { projection: { _id: 1 } }
    )
    .sort({ _id: 1 })
    .limit(systemMigrationBatchSize)
    .toArray();
  if (invalid.length)
    await context.fail({
      message: 'STT pricing type backfill is incomplete',
      // 分批报告新发现的异常；修复并重试后继续校验，避免断点已越过该记录而无法恢复。
      failedRecords: invalid.map(({ _id }) => ({
        stageKey: 'validation',
        data: { id: String(_id) },
        reason: { message: 'STT pricing type is missing or invalid; repair before retrying' }
      }))
    });
  await context.reportProgress({ key: 'validation', status: SystemMigrationStatusEnum.succeeded });
  return { models: checkpoint.scanned };
};

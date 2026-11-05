import { z } from 'zod';
import { ObjectIdSchema } from '@fastgpt/global/common/type/mongo';
import { IntSchema } from '@fastgpt/global/common/zod';
import { SystemMigrationStatusEnum } from '@fastgpt/global/migration/constants';
import type { SystemMigrationFailedRecord } from '@fastgpt/global/migration/schema';
import { Types } from '@fastgpt/service/common/mongo';
import { MongoOpenApi } from '@fastgpt/service/support/openapi/schema';
import { systemMigrationBatchSize } from '@/migration/constants';
import type { SystemMigrationContext } from '@/migration/registry';
import { backfillOpenApiKeyTypeRecord } from './service';
import { ApiKeyTypeEnum } from '@fastgpt/global/support/openapi/constants';

const CheckpointSchema = z.object({
  endId: ObjectIdSchema.nullable(),
  lastId: ObjectIdSchema.nullable(),
  scanned: IntSchema
});

/**
 * 独立自动回填旧 Key 类型，以固定上界和 _id 游标断点续跑。
 * 错误快照先于 checkpoint 持久化，重试先处理已跳过的坏数据；不删除或转换旧字段。
 * 完成校验要求扫描范围内 type 均为有效枚举，校验阶段的新异常也保留 ID 供断点后重试。
 */
export const backfillOpenApiKeyType = async (context: SystemMigrationContext) => {
  const collection = MongoOpenApi.collection;
  let checkpoint = await context.getCheckpoint(CheckpointSchema);
  if (!checkpoint) {
    const last = await collection.findOne({}, { projection: { _id: 1 }, sort: { _id: -1 } });
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
      await backfillOpenApiKeyTypeRecord(id);
      failures.delete(id);
    } catch {
      context.signal.throwIfAborted();
      failures.set(id, {
        stageKey: 'keys',
        data: { id },
        reason: {
          message: 'Invalid or concurrently modified API Key type/binding; repair before retrying'
        }
      });
    }
  };
  await context.reportProgress({ key: 'keys', status: SystemMigrationStatusEnum.running });
  for (const id of [...failures.keys()]) await processRecord(id);
  await context.reportFailedRecords([...failures.values()]);
  while (checkpoint.endId) {
    context.signal.throwIfAborted();
    await context.assertActive();
    const records = await collection
      .find(
        {
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
          message: 'Too many invalid API Key records',
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
      key: 'keys',
      status: SystemMigrationStatusEnum.running,
      current: checkpoint.scanned
    });
  }
  if (failures.size)
    await context.fail({
      message: 'Some API Key records require repair',
      failedRecords: [...failures.values()]
    });
  await context.reportProgress({
    key: 'keys',
    status: SystemMigrationStatusEnum.succeeded,
    current: checkpoint.scanned
  });
  await context.reportProgress({ key: 'validation', status: SystemMigrationStatusEnum.running });
  await context.assertActive();
  const invalid = checkpoint.endId
    ? await collection
        .find(
          {
            _id: { $lte: new Types.ObjectId(checkpoint.endId) },
            type: { $nin: Object.values(ApiKeyTypeEnum) }
          },
          { projection: { _id: 1 } }
        )
        .sort({ _id: 1 })
        .limit(systemMigrationBatchSize)
        .toArray()
    : [];
  if (invalid.length)
    await context.fail({
      message: 'API Key type backfill is incomplete',
      // 分批报告新发现的异常；修复并重试后继续校验，避免断点已越过该记录而无法恢复。
      failedRecords: invalid.map(({ _id }) => ({
        stageKey: 'validation',
        data: { id: String(_id) },
        reason: { message: 'API Key type is missing or invalid; repair before retrying' }
      }))
    });
  await context.reportProgress({ key: 'validation', status: SystemMigrationStatusEnum.succeeded });
  return { keys: checkpoint.scanned };
};

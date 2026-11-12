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
import { resolveApiKeyScope } from '@fastgpt/service/support/openapi/utils';

const CheckpointSchema = z.object({
  endId: ObjectIdSchema.nullable(),
  lastId: ObjectIdSchema.nullable(),
  scanned: IntSchema,
  appIdStorageVersion: z.literal(1).optional()
});

/**
 * 独立分批遍历全部 Key，补齐个人类型并将已有应用 ID 统一为 BSON ObjectId。
 * 固定上界和 _id 游标支持幂等断点续跑；旧版仅补类型的断点从同一范围起点重扫一次。
 * 需求已确认本任务豁免“自动迁移必须兼容滚动升级”中的管理查询兼容要求。
 * 上界之后由旧实例写入的旧格式记录不在本次扫描范围内，运行期管理查询也不承担兼容。
 * 错误快照先于 checkpoint 持久化；完成校验覆盖类型、绑定语义和 ID 存储类型。
 */
export const backfillOpenApiKeyType = async (context: SystemMigrationContext) => {
  const collection = MongoOpenApi.collection;
  let checkpoint = await context.getCheckpoint(CheckpointSchema);
  if (!checkpoint) {
    const last = await collection.findOne({}, { projection: { _id: 1 }, sort: { _id: -1 } });
    checkpoint = {
      endId: last ? String(last._id) : null,
      lastId: null,
      scanned: 0,
      appIdStorageVersion: 1
    };
    await context.saveCheckpoint(checkpoint);
  } else if (checkpoint.appIdStorageVersion !== 1) {
    // 旧断点前的记录可能仍是字符串；不能只转换游标之后的 Key 就宣告完成。
    checkpoint = { ...checkpoint, lastId: null, scanned: 0, appIdStorageVersion: 1 };
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
  const invalid: { _id: Types.ObjectId }[] = [];
  if (checkpoint.endId) {
    const cursor = collection
      .find(
        { _id: { $lte: new Types.ObjectId(checkpoint.endId) } },
        { projection: { _id: 1, type: 1, appId: 1 } }
      )
      .sort({ _id: 1 })
      .batchSize(systemMigrationBatchSize);
    // 和运行期复用同一语义校验，避免 Mongo 查询对数组字段的匹配规则漏过异常绑定。
    for await (const record of cursor) {
      context.signal.throwIfAborted();
      await context.assertActive();
      try {
        if (!Object.values(ApiKeyTypeEnum).includes(record.type)) throw new Error('Missing type');
        resolveApiKeyScope({ type: record.type, appId: record.appId });
        if (record.appId !== undefined && record.appId !== null && record.appId !== '') {
          if (!(record.appId instanceof Types.ObjectId)) {
            throw new Error('API Key application ID is not stored as ObjectId');
          }
        }
      } catch {
        invalid.push({ _id: record._id });
        if (invalid.length >= systemMigrationBatchSize) break;
      }
    }
  }
  if (invalid.length)
    await context.fail({
      message: 'API Key type backfill is incomplete',
      // 分批报告新发现的异常；修复并重试后继续校验，避免断点已越过该记录而无法恢复。
      failedRecords: invalid.map(({ _id }) => ({
        stageKey: 'validation',
        data: { id: String(_id) },
        reason: {
          message:
            'API Key type, application target or ID storage is invalid; repair before retrying'
        }
      }))
    });
  await context.reportProgress({ key: 'validation', status: SystemMigrationStatusEnum.succeeded });
  return { keys: checkpoint.scanned };
};

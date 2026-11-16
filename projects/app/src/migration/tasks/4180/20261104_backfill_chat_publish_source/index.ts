import { z } from 'zod';
import { ObjectIdSchema } from '@fastgpt/global/common/type/mongo';
import { IntSchema } from '@fastgpt/global/common/zod';
import { SystemMigrationStatusEnum } from '@fastgpt/global/migration/constants';
import type { SystemMigrationFailedRecord } from '@fastgpt/global/migration/schema';
import { Types } from '@fastgpt/service/common/mongo';
import { systemMigrationBatchSize } from '@/migration/constants';
import type { SystemMigrationContext } from '@/migration/registry';
import {
  backfillPublishSourceBatch,
  getPublishSourceMigrationModel,
  readPublishSourceValidationBatch,
  type PublishSourceMigrationStage
} from './service';

const CursorSchema = z.object({
  endId: ObjectIdSchema.nullable(),
  lastId: ObjectIdSchema.nullable(),
  scanned: IntSchema
});
const ValidationCursorSchema = z.object({
  lastId: ObjectIdSchema.nullable(),
  scanned: IntSchema,
  missingChannelIds: IntSchema
});
const CheckpointSchema = z.object({
  chats: CursorSchema.extend({ total: IntSchema.optional() }),
  chatLogs: CursorSchema,
  // 旧断点只需从头开始校验，不重置已完成的回填游标。
  validation: z
    .object({ chats: ValidationCursorSchema, chatLogs: ValidationCursorSchema })
    .optional()
});

/**
 * 独立后台分批断点回填，先重试历史失败项，再按两库各自的固定 _id 上界扫描。
 * 每条条件写入可重放；完整错误快照先于 checkpoint 保存，避免跳过坏数据后永久遗漏。
 * 仅追加来源，不修改旧字段、身份、消息或统计计数；无依赖，不阻塞业务启动。
 * 对话总量保存在断点中，旧断点按已处理数加剩余数补齐；统计桶仍仅上报已处理数量。
 * 完成校验按 _id 分批读取最小来源字段，同一遍扫描完成两项统计；校验游标与累计值一起保存。
 * 校验失败批次不推进断点，修复后重读该批；数据库异常同样保留此前已完成的校验进度。
 */
export const backfillChatPublishSource = async (context: SystemMigrationContext) => {
  const stages = ['chats', 'chatLogs'] as const;
  await context.reportProgress({ key: 'chats', status: SystemMigrationStatusEnum.running });
  let checkpoint = await context.getCheckpoint(CheckpointSchema);
  if (!checkpoint) {
    const cursor = async (stage: PublishSourceMigrationStage) => {
      const last = await getPublishSourceMigrationModel(stage).findOne(
        {},
        { projection: { _id: 1 }, sort: { _id: -1 } }
      );
      return { endId: last ? String(last._id) : null, lastId: null, scanned: 0 };
    };
    checkpoint = { chats: await cursor('chats'), chatLogs: await cursor('chatLogs') };
  }
  if (checkpoint.chats.total === undefined) {
    await context.assertActive();
    const { endId, lastId, scanned } = checkpoint.chats;
    // current 累计的是扫描条数，补算旧断点时只统计尚未扫描的范围。
    const remaining = endId
      ? await getPublishSourceMigrationModel('chats').countDocuments({
          _id: {
            $lte: new Types.ObjectId(endId),
            ...(lastId ? { $gt: new Types.ObjectId(lastId) } : {})
          }
        })
      : 0;
    checkpoint.chats.total = scanned + remaining;
    await context.saveCheckpoint(checkpoint);
  }
  const failures = new Map<string, SystemMigrationFailedRecord>();
  let validationFailures: SystemMigrationFailedRecord[] = [];
  for (const failure of await context.getFailedRecords()) {
    // 校验坏数据没有越过断点，留待原批次重新检查；重读前保留明细，避免查询异常时丢失。
    if (failure.stageKey === 'validation') {
      validationFailures.push(failure);
    } else {
      failures.set(`${failure.stageKey}:${failure.data.id}`, failure);
    }
  }

  /** 只保存必要 ID 与原因；达到错误上界即中止，避免一次扫描积累无界错误列表。 */
  const processBatch = async (stage: PublishSourceMigrationStage, ids: string[]) => {
    context.signal.throwIfAborted();
    await context.assertActive();
    const batchFailures = await backfillPublishSourceBatch({ stage, ids });
    for (const id of ids) failures.delete(`${stage}:${id}`);
    for (const [id, error] of batchFailures) {
      failures.set(`${stage}:${id}`, {
        stageKey: stage,
        data: { id },
        reason: {
          message: error instanceof Error ? error.message.slice(0, 500) : 'Invalid legacy source'
        }
      });
    }
  };

  for (const stage of stages) {
    await context.reportProgress({
      key: stage,
      status: SystemMigrationStatusEnum.running,
      ...(stage === 'chats'
        ? { current: checkpoint.chats.scanned, total: checkpoint.chats.total }
        : {})
    });
    const retryIds = [...failures.values()]
      .filter((item) => item.stageKey === stage)
      .map((failure) => String(failure.data.id));
    for (let offset = 0; offset < retryIds.length; offset += systemMigrationBatchSize) {
      await processBatch(stage, retryIds.slice(offset, offset + systemMigrationBatchSize));
      await context.reportFailedRecords([...failures.values(), ...validationFailures]);
    }
    await context.reportFailedRecords([...failures.values(), ...validationFailures]);
    while (checkpoint[stage].endId) {
      context.signal.throwIfAborted();
      await context.assertActive();
      const cursor = checkpoint[stage];
      const records = await getPublishSourceMigrationModel(stage)
        .find(
          {
            _id: {
              $lte: new Types.ObjectId(cursor.endId!),
              ...(cursor.lastId ? { $gt: new Types.ObjectId(cursor.lastId) } : {})
            }
          },
          { projection: { _id: 1 } }
        )
        .sort({ _id: 1 })
        .limit(systemMigrationBatchSize)
        .toArray();
      if (!records.length) break;
      await processBatch(
        stage,
        records.map((record) => String(record._id))
      );
      if (failures.size >= systemMigrationBatchSize * 10) {
        await context.fail({
          message: 'Too many invalid legacy sources; repair reported records before retrying',
          failedRecords: [...failures.values(), ...validationFailures]
        });
      }
      // 失败快照在断点之前持久化，提交后中断时重扫该批仍保持正确。
      await context.reportFailedRecords([...failures.values(), ...validationFailures]);
      checkpoint[stage] = {
        ...cursor,
        lastId: String(records.at(-1)!._id),
        scanned: cursor.scanned + records.length
      };
      if (stage === 'chats') {
        // 兼容扫描期间插入上界内记录，避免进度超过总量而被框架拒绝。
        checkpoint.chats.total = Math.max(checkpoint.chats.total ?? 0, checkpoint.chats.scanned);
      }
      await context.saveCheckpoint(checkpoint);
      await context.reportProgress({
        key: stage,
        status: SystemMigrationStatusEnum.running,
        current: checkpoint[stage].scanned,
        ...(stage === 'chats' ? { total: checkpoint.chats.total } : {})
      });
    }
    if (stage === 'chats' && checkpoint.chats.total !== checkpoint.chats.scanned) {
      // 扫描范围已经耗尽，校准执行期间物理删除记录造成的总量偏差。
      checkpoint.chats.total = checkpoint.chats.scanned;
      await context.saveCheckpoint(checkpoint);
    }
    await context.reportProgress({
      key: stage,
      status: SystemMigrationStatusEnum.succeeded,
      current: checkpoint[stage].scanned,
      ...(stage === 'chats' ? { total: checkpoint.chats.total } : {})
    });
  }

  await context.reportProgress({
    key: 'validation',
    status: SystemMigrationStatusEnum.running,
    current:
      (checkpoint.validation?.chats.scanned ?? 0) + (checkpoint.validation?.chatLogs.scanned ?? 0)
  });
  if (failures.size)
    await context.fail({
      message: 'Some legacy publish sources require repair',
      failedRecords: [...failures.values(), ...validationFailures]
    });
  const validation = (checkpoint.validation ??= {
    chats: { lastId: null, scanned: 0, missingChannelIds: 0 },
    chatLogs: { lastId: null, scanned: 0, missingChannelIds: 0 }
  });
  for (const stage of stages) {
    const endId = checkpoint[stage].endId;
    while (endId) {
      context.signal.throwIfAborted();
      await context.assertActive();
      const cursor = validation[stage];
      const batch = await readPublishSourceValidationBatch({
        stage,
        endId,
        lastId: cursor.lastId,
        limit: systemMigrationBatchSize
      });
      if (!batch.scanned) break;

      const invalid: SystemMigrationFailedRecord[] = batch.invalidIds.map((id) => ({
        stageKey: 'validation',
        data: { collection: stage, id },
        reason: { message: 'Publish source type is missing or invalid; repair before retrying' }
      }));
      if (invalid.length) {
        // 整批校验通过才保存累计值，失败重试不会漏检或重复计数。
        await context.fail({
          message: `${stage} contains records without a valid publish source`,
          failedRecords: invalid
        });
      }
      validation[stage] = {
        lastId: batch.lastId,
        scanned: cursor.scanned + batch.scanned,
        missingChannelIds: cursor.missingChannelIds + batch.missingChannelIds
      };
      await context.saveCheckpoint(checkpoint);
      await context.reportProgress({
        key: 'validation',
        status: SystemMigrationStatusEnum.running,
        current: validation.chats.scanned + validation.chatLogs.scanned
      });
    }
    // 当前集合复核完成后再清除旧校验错误；失败批次已重读，物理删除也视为问题已消失。
    const remaining = validationFailures.filter((failure) => failure.data.collection !== stage);
    if (remaining.length !== validationFailures.length) {
      validationFailures = remaining;
      await context.reportFailedRecords([...failures.values(), ...validationFailures]);
    }
  }
  await context.reportProgress({
    key: 'validation',
    status: SystemMigrationStatusEnum.succeeded,
    current: validation.chats.scanned + validation.chatLogs.scanned
  });
  return {
    chats: checkpoint.chats.scanned,
    chatLogs: checkpoint.chatLogs.scanned,
    missingChannelIds: validation.chats.missingChannelIds + validation.chatLogs.missingChannelIds
  };
};

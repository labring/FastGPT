import { z } from 'zod';
import { ObjectIdSchema } from '@fastgpt/global/common/type/mongo';
import { IntSchema } from '@fastgpt/global/common/zod';
import { ChatSourceEnum } from '@fastgpt/global/core/chat/constants';
import { SystemMigrationStatusEnum } from '@fastgpt/global/migration/constants';
import type { SystemMigrationFailedRecord } from '@fastgpt/global/migration/schema';
import { Types } from '@fastgpt/service/common/mongo';
import { systemMigrationBatchSize } from '@/migration/constants';
import type { SystemMigrationContext } from '@/migration/registry';
import {
  backfillPublishSourceRecord,
  getPublishSourceMigrationModel,
  type PublishSourceMigrationStage
} from './service';

const CursorSchema = z.object({
  endId: ObjectIdSchema.nullable(),
  lastId: ObjectIdSchema.nullable(),
  scanned: IntSchema
});
const CheckpointSchema = z.object({
  chats: CursorSchema.extend({ total: IntSchema.optional() }),
  chatLogs: CursorSchema
});

/**
 * 独立后台分批断点回填，先重试历史失败项，再按两库各自的固定 _id 上界扫描。
 * 每条条件写入可重放；完整错误快照先于 checkpoint 保存，避免跳过坏数据后永久遗漏。
 * 仅追加来源，不修改旧字段、身份、消息或统计计数；无依赖，不阻塞业务启动。
 * 对话总量保存在断点中，旧断点按已处理数加剩余数补齐；统计桶仍仅上报已处理数量。
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
  for (const failure of await context.getFailedRecords()) {
    failures.set(`${failure.stageKey}:${failure.data.id}`, failure);
  }

  /** 只保存必要 ID 与原因；达到错误上界即中止，避免一次扫描积累无界错误列表。 */
  const processRecord = async (stage: PublishSourceMigrationStage, id: string) => {
    const key = `${stage}:${id}`;
    await context.assertActive();
    try {
      await backfillPublishSourceRecord({ stage, id });
      failures.delete(key);
    } catch (error) {
      context.signal.throwIfAborted();
      failures.set(key, {
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
    for (const failure of [...failures.values()].filter((item) => item.stageKey === stage)) {
      await processRecord(stage, String(failure.data.id));
    }
    await context.reportFailedRecords([...failures.values()]);
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
      for (const record of records) {
        await processRecord(stage, String(record._id));
        if (failures.size >= systemMigrationBatchSize * 10) {
          await context.fail({
            message: 'Too many invalid legacy sources; repair reported records before retrying',
            failedRecords: [...failures.values()]
          });
        }
      }
      // 失败快照在断点之前持久化，提交后中断时重扫该批仍保持正确。
      await context.reportFailedRecords([...failures.values()]);
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

  await context.reportProgress({ key: 'validation', status: SystemMigrationStatusEnum.running });
  if (failures.size)
    await context.fail({
      message: 'Some legacy publish sources require repair',
      failedRecords: [...failures.values()]
    });
  let missingChannelIds = 0;
  for (const stage of stages) {
    await context.assertActive();
    const endId = checkpoint[stage].endId;
    if (!endId) continue;
    const collection = getPublishSourceMigrationModel(stage);
    const range = { _id: { $lte: new Types.ObjectId(endId) } };
    const invalid = await collection.countDocuments({
      ...range,
      'publishSource.type': { $nin: Object.values(ChatSourceEnum) }
    });
    if (invalid)
      await context.fail({
        message: `${stage} still contains ${invalid} records without a valid publish source`,
        failedRecords: [...failures.values()]
      });
    missingChannelIds += await collection.countDocuments({
      ...range,
      'publishSource.type': {
        $nin: [ChatSourceEnum.online, ChatSourceEnum.test, ChatSourceEnum.cronJob]
      },
      'publishSource.id': null
    });
  }
  await context.reportProgress({ key: 'validation', status: SystemMigrationStatusEnum.succeeded });
  return {
    chats: checkpoint.chats.scanned,
    chatLogs: checkpoint.chatLogs.scanned,
    missingChannelIds
  };
};

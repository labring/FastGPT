import { Types } from '@fastgpt/service/common/mongo';
import { MongoChat } from '@fastgpt/service/core/chat/chatSchema';
import { MongoAppChatLog } from '@fastgpt/service/core/app/logs/chatLogsSchema';
import { MongoOutLink } from '@fastgpt/service/support/outLink/schema';
import { getChatSourceByPublishChannel } from '@fastgpt/global/core/chat/utils';
import { ChatPublishSourceSchema } from '@fastgpt/global/core/chat/publishSource/type';
import { LegacyPublishSourceRecordSchema, canRestoreOutLinkReference } from './utils';

export type PublishSourceMigrationStage = 'chats' | 'chatLogs';

/** 主库与日志库分别扫描，不能用当前 Chat 来源反填历史统计桶。 */
export const getPublishSourceMigrationModel = (stage: PublishSourceMigrationStage) =>
  stage === 'chats' ? MongoChat.collection : MongoAppChatLog.collection;

/**
 * 按稳定 ID 批量重读，整批只提交一次带 CAS 条件的 bulkWrite。
 * 仅绑定同团队/应用唯一且类型一致的旧外链；已删除引用允许缺 ID，结构冲突必须报错。
 * 返回可定位的逐条数据错误；数据库异常直接抛出，阻止推进断点。
 * CAS 未全部命中时批量重读，保留正常对话写入的新来源，尚未回填的记录留待重试。
 * 仅追加 publishSource，不修改或删除旧字段，支持批次重放。
 */
export const backfillPublishSourceBatch = async ({
  stage,
  ids
}: {
  stage: PublishSourceMigrationStage;
  ids: string[];
}) => {
  const collection = getPublishSourceMigrationModel(stage);
  const failures = new Map<string, unknown>();
  if (!ids.length) return failures;

  // 1. 一次读取整批，仅校验待回填记录；已有新来源始终是权威值。
  const rawRecords = await collection
    .find(
      { _id: { $in: ids.map((id) => new Types.ObjectId(id)) } },
      {
        projection: {
          teamId: 1,
          appId: 1,
          sourceType: 1,
          source: 1,
          shareId: 1,
          sourceName: 1,
          publishSource: 1
        }
      }
    )
    .toArray();
  const records = rawRecords.flatMap((raw) => {
    try {
      if (raw.publishSource !== undefined && raw.publishSource !== null) {
        ChatPublishSourceSchema.parse(raw.publishSource);
        return [];
      }
      return [{ raw, record: LegacyPublishSourceRecordSchema.parse(raw) }];
    } catch (error) {
      failures.set(String(raw._id), error);
      return [];
    }
  });

  // 2. 外链引用也按批查询，统计桶不使用当前外链反推历史来源。
  const shareIds = [
    ...new Set(
      records.flatMap(({ record }) =>
        stage === 'chats' && canRestoreOutLinkReference(record) ? [record.shareId!] : []
      )
    )
  ];
  const channels = shareIds.length
    ? await MongoOutLink.find(
        { shareId: { $in: shareIds } },
        '_id type shareId teamId appId'
      ).lean()
    : [];
  const channelsByShareId = new Map<string, typeof channels>();
  for (const channel of channels) {
    const group = channelsByShareId.get(channel.shareId) ?? [];
    group.push(channel);
    channelsByShareId.set(channel.shareId, group);
  }
  const operations = records.flatMap(({ raw, record }) => {
    try {
      const restoredId = (() => {
        if (stage !== 'chats' || !canRestoreOutLinkReference(record)) return;
        const related = channelsByShareId.get(record.shareId!) ?? [];
        const candidates = related.filter(
          (channel) =>
            String(channel.teamId) === record.teamId && String(channel.appId) === record.appId
        );
        if (candidates.length > 1) throw new Error('Legacy shareId matches multiple channels');
        const channel = candidates[0];
        if (channel) {
          if (getChatSourceByPublishChannel(channel.type) !== record.source) {
            throw new Error('Legacy channel type does not match the conversation');
          }
          return new Types.ObjectId(String(channel._id));
        }
        if (related.length)
          throw new Error('Legacy channel belongs to another team or application');
      })();
      return [
        {
          updateOne: {
            filter: {
              _id: raw._id,
              teamId: raw.teamId,
              appId: raw.appId,
              sourceType: raw.sourceType ?? null,
              publishSource: null,
              source: raw.source,
              shareId: raw.shareId ?? null,
              sourceName: raw.sourceName ?? null
            },
            update: {
              $set: {
                publishSource: {
                  type: record.source,
                  ...(restoredId ? { id: restoredId } : {})
                }
              }
            }
          }
        }
      ];
    } catch (error) {
      failures.set(String(raw._id), error);
      return [];
    }
  });

  // 3. 全部命中不再读库；部分未命中时一次核验整批，不能把 CAS 冲突记为成功。
  if (!operations.length) return failures;
  const result = await collection.bulkWrite(operations, { ordered: false });
  if (result.matchedCount === operations.length) return failures;
  const latest = await collection
    .find(
      { _id: { $in: operations.map(({ updateOne }) => updateOne.filter._id) } },
      { projection: { publishSource: 1 } }
    )
    .toArray();
  for (const raw of latest) {
    try {
      if (raw.publishSource === undefined || raw.publishSource === null) {
        throw new Error('Conversation source changed while backfilling; retry required');
      }
      ChatPublishSourceSchema.parse(raw.publishSource);
    } catch (error) {
      failures.set(String(raw._id), error);
    }
  }
  return failures;
};

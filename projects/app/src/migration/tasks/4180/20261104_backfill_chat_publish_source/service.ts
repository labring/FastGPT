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
 * 按稳定 ID 重读并 CAS 回填单条数据，支持批次重放和与正常对话并发执行。
 * 仅绑定同团队/应用唯一且类型一致的旧外链；已删除引用允许缺 ID，结构冲突必须报错。
 * 仅追加 publishSource，不修改或删除旧字段，避免破坏已有读取和回滚依据。
 */
export const backfillPublishSourceRecord = async ({
  stage,
  id
}: {
  stage: PublishSourceMigrationStage;
  id: string;
}) => {
  const collection = getPublishSourceMigrationModel(stage);
  for (let attempt = 0; attempt < 3; attempt++) {
    const raw = await collection.findOne(
      { _id: new Types.ObjectId(id) },
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
    );
    if (!raw) return;
    // 已有新来源是权威值；旧 source 再异常也不能覆盖它。
    if (raw.publishSource !== undefined && raw.publishSource !== null) {
      ChatPublishSourceSchema.parse(raw.publishSource);
      return;
    }
    const record = LegacyPublishSourceRecordSchema.parse(raw);
    let restoredId: string | undefined;
    if (stage === 'chats' && canRestoreOutLinkReference(record)) {
      const candidates = await MongoOutLink.find(
        { teamId: record.teamId, appId: record.appId, shareId: record.shareId },
        '_id type'
      )
        .limit(2)
        .lean();
      if (candidates.length > 1) throw new Error('Legacy shareId matches multiple channels');
      const channel = candidates[0];
      if (channel) {
        if (getChatSourceByPublishChannel(channel.type) !== record.source) {
          throw new Error('Legacy channel type does not match the conversation');
        }
        restoredId = String(channel._id);
      } else if (await MongoOutLink.exists({ shareId: record.shareId })) {
        throw new Error('Legacy channel belongs to another team or application');
      }
    }
    const result = await collection.updateOne(
      {
        _id: raw._id,
        publishSource: null,
        source: raw.source,
        shareId: raw.shareId ?? null,
        sourceName: raw.sourceName ?? null
      },
      {
        $set: {
          publishSource: {
            type: record.source,
            ...(restoredId ? { id: new Types.ObjectId(restoredId) } : {})
          }
        }
      }
    );
    if (result.matchedCount) return;
    // 条件未命中不能记为迁移成功；重新读取并核验是否已有合法的新来源。
  }
  throw new Error('Conversation source changed repeatedly while backfilling');
};

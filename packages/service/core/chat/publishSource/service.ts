import { ChatErrEnum } from '@fastgpt/global/common/error/code/chat';
import {
  getChatPublishSourceName,
  getChatPublishSourceType
} from '@fastgpt/global/common/chat/publishSource';
import { ChatSourceEnum } from '@fastgpt/global/core/chat/constants';
import type {
  ChatPublishSourceType,
  ChatPublishSourceResponseType
} from '@fastgpt/global/core/chat/publishSource/type';
import { MongoChat } from '../chatSchema';
import { buildChatSourceQuery, buildChatSourceWriteFields, type ChatSourceParams } from '../source';
import { assertChatPublishSource, resolveCurrentChatPublishSource } from './utils';
import { getChatPublishSourceNames } from './entity';

/**
 * preChat 的唯一来源写入点，调用方须先获取运行租约并完成资源鉴权。
 * 分享/MCP 在条件更新中复核旧来源；Mongo 唯一键冲突或快照变更时重读，不将其当成新会话。
 * 整体替换来源并显式清除失效兼容字段，尾部保存不得再次写入这些字段。
 */
export const updateChatPublishSource = async (
  params: ChatSourceParams & {
    chatId: string;
    teamId: string;
    tmbId: string;
    source: string;
    publishSource?: ChatPublishSourceType;
    sourceName?: string;
    outLinkUid?: string;
  }
) => {
  const current = resolveCurrentChatPublishSource(params);
  const name = current.id ? getChatPublishSourceName({ name: params.sourceName }) : undefined;
  const guarded = current.type === ChatSourceEnum.share || current.type === ChatSourceEnum.mcp;
  const apiRequest = current.type === ChatSourceEnum.api;
  const sourceQuery = { ...buildChatSourceQuery(params), chatId: params.chatId };
  const now = new Date();
  const $set = {
    ...buildChatSourceWriteFields(params),
    chatId: params.chatId,
    teamId: params.teamId,
    tmbId: params.tmbId,
    publishSource: current,
    source: current.type,
    ...(name ? { sourceName: name } : {}),
    ...(params.outLinkUid !== undefined ? { outLinkUid: params.outLinkUid } : {}),
    updateTime: now,
    hasBeenRead: false
  };
  const $unset = {
    ...(!name ? { sourceName: '' } : {}),
    ...(params.outLinkUid === undefined ? { outLinkUid: '' } : {})
  };

  for (let attempt = 0; attempt < 3; attempt++) {
    const chat = await MongoChat.findOne(sourceQuery)
      .select('_id teamId publishSource outLinkUid')
      .lean();
    if (chat) {
      if (String(chat.teamId) !== params.teamId) throw ChatErrEnum.unAuthChat;
      assertChatPublishSource({ previous: chat.publishSource, current });
      // API 会话使用者首次绑定后不可更换；即使漏传或换入口，也不能清除已有绑定。
      const userGuarded = apiRequest || chat.publishSource?.type === ChatSourceEnum.api;
      // 空字符串与缺失都属于旧协议的默认身份，非空使用者始终精确比较。
      if (
        (current.type === ChatSourceEnum.share || userGuarded) &&
        (chat.outLinkUid || undefined) !== (params.outLinkUid || undefined)
      ) {
        throw ChatErrEnum.unAuthChat;
      }
      const result = await MongoChat.updateOne(
        {
          _id: chat._id,
          teamId: params.teamId,
          ...(guarded
            ? {
                'publishSource.type': chat.publishSource?.type ?? null,
                'publishSource.id': chat.publishSource?.id ?? null,
                outLinkUid: chat.outLinkUid ?? null
              }
            : userGuarded
              ? { outLinkUid: chat.outLinkUid ?? null }
              : {})
        },
        { $set, $unset }
      );
      if (result.matchedCount) return current;
      continue;
    }

    try {
      await MongoChat.create({ ...$set, createTime: now });
      return current;
    } catch (error) {
      if ((error as { code?: number }).code !== 11000) throw error;
      // 新会话在读与创建之间已被另一请求写入，下一轮须按真实旧来源重新检查。
    }
  }
  throw ChatErrEnum.unAuthChat;
};

/** 分页或固定导出批次之后扩展渠道名，兼容旧响应名称，不把展示兜底写入业务数据。 */
export const extendChatPublishSources = async <
  T extends {
    publishSource?: Partial<ChatPublishSourceType> | null;
    sourceName?: string | null;
    source?: string | null;
  }
>({
  list,
  teamId,
  appId
}: {
  list: T[];
  teamId: string;
  appId: string;
}): Promise<(Omit<T, 'publishSource'> & { publishSource?: ChatPublishSourceResponseType })[]> => {
  const names = await getChatPublishSourceNames({
    teamId,
    appId,
    sources: list.flatMap((item) => (item.publishSource ? [item.publishSource] : []))
  });
  return list.map((item) => {
    const source = item.publishSource;
    const name = getChatPublishSourceName({
      type: getChatPublishSourceType(item),
      name: source?.id ? names.get(`${source.type}:${source.id}`) : undefined,
      sourceName: item.sourceName
    });
    return {
      ...item,
      sourceName: name,
      publishSource:
        source || name
          ? {
              ...(source?.type ? { type: source.type } : {}),
              ...(source?.id ? { id: String(source.id) } : {}),
              ...(name ? { name } : {})
            }
          : undefined
    };
  });
};

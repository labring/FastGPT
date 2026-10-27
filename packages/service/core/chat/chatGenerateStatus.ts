/**
 * Service helpers for persisting per-chat generate status.
 * Used by stream resume, sidebar polling, and stale-generating correction paths.
 */
import { MongoChat } from './chatSchema';
import { ChatGenerateStatusEnum } from '@fastgpt/global/core/chat/constants';
import { buildChatSourceQuery, buildChatSourceWriteFields, type ChatSourceParams } from './source';
import { stopChatGenerationLease } from './generationLease';
import { getLogger, LogCategories } from '../../common/logger';

const logger = getLogger(LogCategories.MODULE.CHAT.HISTORY);

type StartGenerateChatParams = ChatSourceParams & {
  chatId: string;
  teamId: string;
  tmbId: string;
  source: string;
  sourceName?: string;
  shareId?: string;
  outLinkUid?: string;
  generationRunnerId: string;
  generationResponseChatItemId?: string;
};

const buildGeneratingChatUpdate = (params: StartGenerateChatParams) => {
  const now = new Date();
  const { sourceType, sourceId, ...chatFields } = params;
  const chatSource = {
    sourceType,
    sourceId
  };

  return {
    now,
    chatSource,
    $set: {
      ...chatFields,
      ...buildChatSourceWriteFields(chatSource),
      updateTime: now,
      hasBeenRead: false,
      chatGenerateStatus: ChatGenerateStatusEnum.generating,
      generationRunnerId: params.generationRunnerId,
      ...(params.generationResponseChatItemId && {
        generationResponseChatItemId: params.generationResponseChatItemId
      })
    },
    $setOnInsert: {
      createTime: now,
      summary: {
        llmInputTokens: 0,
        llmOutputTokens: 0
      }
    }
  };
};

/**
 * 尝试占用一次会话生成槽。
 *
 * 同一个 `sourceType/sourceId/chatId` 只允许一个请求进入生成中状态；已有 generating 记录时返回 false，
 * 由 API 层转换为“当前会话正在运行”的错误。
 *
 * 这里用“条件匹配 + upsert + 唯一索引”实现无副作用抢占：只有非 generating
 * 记录会被更新为 generating；如果已有 generating 记录，查询不会命中，upsert 会因
 * chat source 唯一索引报 11000，再转换为 false。这样被拒绝的并发请求不会刷新
 * updateTime 或覆盖 source/sourceName。
 */
export const tryStartGenerateChat = async (params: StartGenerateChatParams) => {
  const { $set, $setOnInsert, chatSource } = buildGeneratingChatUpdate(params);

  try {
    await MongoChat.findOneAndUpdate(
      {
        ...buildChatSourceQuery(chatSource),
        chatId: params.chatId,
        chatGenerateStatus: { $ne: ChatGenerateStatusEnum.generating }
      },
      {
        $set,
        $setOnInsert
      },
      {
        upsert: true,
        new: false
      }
    ).lean();

    return true;
  } catch (error: any) {
    if (error?.code === 11000) {
      return false;
    }
    throw error;
  }
};

type UpdateChatGenerateStatusParams = Pick<
  StartGenerateChatParams,
  'sourceType' | 'sourceId' | 'chatId'
> & {
  status: ChatGenerateStatusEnum;
  generationRunnerId?: string;
  /** 若传入则覆盖；否则在 done/error 时默认未读（前台看完可再调 markRead） */
  hasBeenRead?: boolean;
};
export const updateChatGenerateStatus = async (params: UpdateChatGenerateStatusParams) => {
  const { chatId, status, generationRunnerId, hasBeenRead } = params;
  const chatSource = {
    sourceType: params.sourceType,
    sourceId: params.sourceId
  };
  const now = new Date();
  const $set: Record<string, unknown> = {
    chatGenerateStatus: status,
    updateTime: now
  };
  const $unset: Record<string, ''> = {};
  if (hasBeenRead !== undefined) {
    $set.hasBeenRead = hasBeenRead;
  } else if (status === ChatGenerateStatusEnum.done || status === ChatGenerateStatusEnum.error) {
    $set.hasBeenRead = false;
  }
  if (
    generationRunnerId &&
    (status === ChatGenerateStatusEnum.done || status === ChatGenerateStatusEnum.error)
  ) {
    $unset.generationRunnerId = '';
    $unset.generationResponseChatItemId = '';
  }

  let updated = false;
  try {
    const result = await MongoChat.updateOne(
      {
        ...buildChatSourceQuery(chatSource),
        chatId,
        ...(generationRunnerId && {
          generationRunnerId
        })
      },
      {
        $set,
        ...(Object.keys($unset).length > 0 && { $unset })
      }
    );
    updated = (result.matchedCount ?? 0) > 0;

    if (generationRunnerId && !updated) {
      logger.warn('Chat generate status update lost runner ownership', {
        ...chatSource,
        chatId,
        generationRunnerId,
        status
      });
    }
  } finally {
    if (
      generationRunnerId &&
      (status === ChatGenerateStatusEnum.done || status === ChatGenerateStatusEnum.error)
    ) {
      await stopChatGenerationLease({
        ...chatSource,
        chatId,
        generationRunnerId
      });
    }
  }

  return updated;
};

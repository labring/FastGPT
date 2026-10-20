import { subMinutes } from 'date-fns';
import {
  ChatGenerateStatusEnum,
  ChatRoleEnum,
  ChatSourceTypeEnum
} from '@fastgpt/global/core/chat/constants';
import { getLogger, LogCategories } from '../../common/logger';
import { MongoChat } from './chatSchema';
import { MongoChatItem } from './chatItemSchema';
import { CHAT_GENERATION_LEASE_TTL_MS, getChatGenerationLeaseToken } from './generationLease';
import { buildChatSourceQuery } from './source';
import { writeResumeTerminalError } from './resume';

const logger = getLogger(LogCategories.MODULE.CHAT.HISTORY);

/** 老数据没有 generationRunId，只能保留 30 分钟兜底。 */
export const STALE_GENERATING_CHAT_MINUTES = 30;
export const GENERATION_INTERRUPTED_ERROR = 'Chat generation was interrupted';

type GeneratingChat = {
  _id: unknown;
  teamId: { toString: () => string } | string;
  sourceType?: ChatSourceTypeEnum;
  appId: { toString: () => string } | string;
  chatId: string;
  updateTime?: Date;
  generationRunId?: string;
  generationResponseChatItemId?: string;
  generationHeartbeatAt?: Date;
  generationLeaseExpiresAt?: Date;
};

type CleanStaleGeneratingChatsResult = {
  modifiedCount: number;
  leaseExpiredCount: number;
  fallbackCount: number;
};

const getChatSource = (chat: GeneratingChat) => ({
  sourceType: chat.sourceType ?? ChatSourceTypeEnum.app,
  sourceId: chat.appId.toString()
});

const markChatAsError = async ({ chat, now }: { chat: GeneratingChat; now: Date }) => {
  const source = getChatSource(chat);
  const result = await MongoChat.updateOne(
    {
      _id: chat._id,
      chatGenerateStatus: ChatGenerateStatusEnum.generating,
      ...(chat.generationRunId
        ? {
            generationRunId: chat.generationRunId,
            generationLeaseExpiresAt: chat.generationLeaseExpiresAt
              ? chat.generationLeaseExpiresAt
              : { $exists: false }
          }
        : {
            generationRunId: { $exists: false },
            updateTime: chat.updateTime
          })
    },
    {
      $set: {
        chatGenerateStatus: ChatGenerateStatusEnum.error,
        updateTime: now,
        hasBeenRead: false
      },
      $unset: {
        generationLeaseExpiresAt: ''
      }
    }
  );

  const modifiedCount = result.modifiedCount ?? 0;
  if (modifiedCount === 0) {
    logger.warn('cleanStaleGeneratingChats: candidate CAS failed', {
      ...source,
      chatId: chat.chatId,
      generationRunId: chat.generationRunId,
      expectedLeaseExpiresAt: chat.generationLeaseExpiresAt,
      expectedUpdateTime: chat.updateTime
    });
    return 0;
  }

  if (chat.generationResponseChatItemId) {
    await MongoChatItem.updateOne(
      {
        ...buildChatSourceQuery(source),
        chatId: chat.chatId,
        dataId: chat.generationResponseChatItemId,
        obj: ChatRoleEnum.AI
      },
      {
        $set: {
          errorMsg: GENERATION_INTERRUPTED_ERROR
        }
      }
    ).catch((error) => {
      logger.warn('Failed to mark interrupted AI response', {
        ...source,
        chatId: chat.chatId,
        generationRunId: chat.generationRunId,
        error
      });
    });
  }

  await writeResumeTerminalError({
    teamId: chat.teamId.toString(),
    ...source,
    chatId: chat.chatId,
    generationRunId: chat.generationRunId,
    message: GENERATION_INTERRUPTED_ERROR
  }).catch((error) => {
    logger.warn('Failed to write interrupted generation terminal event', {
      ...source,
      chatId: chat.chatId,
      generationRunId: chat.generationRunId,
      error
    });
  });

  return modifiedCount;
};

/**
 * 纠正异常中断后残留的 generating 状态。
 *
 * 新 run 以 Redis lease token 为主、Mongo heartbeat 为持久兜底；任一侧仍有效都不会清理。
 * 只有 Redis token 已不存在，且 Mongo lease 到期时间与读取时一致时才执行 CAS，避免
 * cleaner 读取候选后新 run 已完成或启动时误写新状态。
 */
export const cleanStaleGeneratingChats = async (): Promise<CleanStaleGeneratingChatsResult> => {
  const now = new Date();
  const fallbackThreshold = subMinutes(now, STALE_GENERATING_CHAT_MINUTES);
  let modifiedCount = 0;
  let leaseExpiredCount = 0;
  let fallbackCount = 0;
  let redisFailed = false;

  const generatingChats = (await MongoChat.find(
    {
      chatGenerateStatus: ChatGenerateStatusEnum.generating,
      $or: [
        {
          generationRunId: { $exists: false },
          updateTime: { $lt: fallbackThreshold }
        },
        {
          generationRunId: { $exists: true },
          generationLeaseExpiresAt: { $lte: now }
        },
        {
          generationRunId: { $exists: true },
          generationLeaseExpiresAt: { $exists: false },
          updateTime: { $lt: fallbackThreshold }
        }
      ]
    },
    {
      _id: 1,
      teamId: 1,
      sourceType: 1,
      appId: 1,
      chatId: 1,
      updateTime: 1,
      generationRunId: 1,
      generationResponseChatItemId: 1,
      generationHeartbeatAt: 1,
      generationLeaseExpiresAt: 1
    }
  )
    .lean()
    .exec()) as GeneratingChat[];

  for (const chat of generatingChats) {
    if (!chat.generationRunId) {
      if (chat.updateTime && chat.updateTime < fallbackThreshold) {
        const currentModifiedCount = await markChatAsError({ chat, now });
        modifiedCount += currentModifiedCount;
        fallbackCount += currentModifiedCount;
      }
      continue;
    }

    // 滚动发布期间，旧实例开始新 run 时不会更新 runId/heartbeat；按 legacy 路径保守处理。
    if (
      !chat.generationHeartbeatAt ||
      (chat.updateTime &&
        chat.updateTime.getTime() - chat.generationHeartbeatAt.getTime() >
          CHAT_GENERATION_LEASE_TTL_MS)
    ) {
      if (chat.updateTime && chat.updateTime < fallbackThreshold) {
        const currentModifiedCount = await markChatAsError({ chat, now });
        modifiedCount += currentModifiedCount;
        fallbackCount += currentModifiedCount;
      }
      continue;
    }

    // Mongo heartbeat 仍然新鲜时直接跳过；这层兜底不依赖 Redis 可用性。
    if (chat.generationLeaseExpiresAt && chat.generationLeaseExpiresAt > now) {
      continue;
    }

    if (redisFailed) {
      continue;
    }

    try {
      const leaseToken = await getChatGenerationLeaseToken({
        ...getChatSource(chat),
        chatId: chat.chatId
      });
      if (leaseToken) continue;
    } catch (error) {
      redisFailed = true;
      logger.warn('cleanStaleGeneratingChats: failed to inspect generation lease', {
        error
      });
      continue;
    }

    const currentModifiedCount = await markChatAsError({ chat, now });
    modifiedCount += currentModifiedCount;
    leaseExpiredCount += currentModifiedCount;
  }

  if (modifiedCount > 0) {
    logger.info('cleanStaleGeneratingChats: corrected interrupted generating chats', {
      modifiedCount,
      leaseExpiredCount,
      fallbackCount,
      fallbackThreshold,
      staleMinutes: STALE_GENERATING_CHAT_MINUTES
    });
  }

  return {
    modifiedCount,
    leaseExpiredCount,
    fallbackCount
  };
};

import { randomUUID } from 'node:crypto';
import { subMinutes } from 'date-fns';
import { ChatGenerationLeaseCache } from '@fastgpt/dal/redis/caches/chatGenerationLease';
import {
  ChatGenerateStatusEnum,
  ChatRoleEnum,
  ChatSourceTypeEnum
} from '@fastgpt/global/core/chat/constants';
import { getLogger, LogCategories } from '../../common/logger';
import { MongoChat } from './chatSchema';
import { MongoChatItem } from './chatItemSchema';
import { buildChatSourceQuery } from './source';
import { writeResumeTerminalError } from './resume';

const logger = getLogger(LogCategories.MODULE.CHAT.HISTORY);
const generationLeaseCache = new ChatGenerationLeaseCache();

/** 老数据没有 generationRunnerId，只能保留 30 分钟兜底。 */
export const STALE_GENERATING_CHAT_MINUTES = 30;
/** runner 记录最多每 90 秒失效一次，扫描时额外留出 Redis 故障窗口。 */
export const STALE_GENERATING_RUNNER_MINUTES = 2;
const CLEANUP_LEASE_TTL_MS = 30 * 1000;
export const GENERATION_INTERRUPTED_ERROR = 'Chat generation was interrupted';

type GeneratingChat = {
  _id: unknown;
  teamId: { toString: () => string } | string;
  sourceType?: ChatSourceTypeEnum;
  appId: { toString: () => string } | string;
  chatId: string;
  updateTime?: Date;
  generationRunnerId?: string;
  generationResponseChatItemId?: string;
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
      ...(chat.generationRunnerId
        ? {
            generationRunnerId: chat.generationRunnerId
          }
        : {
            generationRunnerId: { $exists: false },
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
        generationRunnerId: '',
        generationResponseChatItemId: ''
      }
    }
  );

  const modifiedCount = result.modifiedCount ?? 0;
  if (modifiedCount === 0) {
    logger.warn('cleanStaleGeneratingChats: candidate CAS failed', {
      ...source,
      chatId: chat.chatId,
      generationRunnerId: chat.generationRunnerId,
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
        generationRunnerId: chat.generationRunnerId,
        error
      });
    });
  }

  await writeResumeTerminalError({
    teamId: chat.teamId.toString(),
    ...source,
    chatId: chat.chatId,
    generationRunnerId: chat.generationRunnerId,
    message: GENERATION_INTERRUPTED_ERROR
  }).catch((error) => {
    logger.warn('Failed to write interrupted generation terminal event', {
      ...source,
      chatId: chat.chatId,
      generationRunnerId: chat.generationRunnerId,
      error
    });
  });

  return modifiedCount;
};

/**
 * 纠正异常中断后残留的 generating 状态。
 *
 * Redis runner key 是唯一存活真源。cleaner 先抢同一个 key 的 cleanup token，
 * 抢到后才能执行状态 CAS；新 runner 在 cleanup 期间无法启动。
 */
export const cleanStaleGeneratingChats = async (): Promise<CleanStaleGeneratingChatsResult> => {
  const now = new Date();
  const fallbackThreshold = subMinutes(now, STALE_GENERATING_CHAT_MINUTES);
  const runnerThreshold = subMinutes(now, STALE_GENERATING_RUNNER_MINUTES);
  let modifiedCount = 0;
  let leaseExpiredCount = 0;
  let fallbackCount = 0;
  let redisFailed = false;

  const generatingChats = (await MongoChat.find(
    {
      chatGenerateStatus: ChatGenerateStatusEnum.generating,
      $or: [
        {
          generationRunnerId: { $exists: false },
          updateTime: { $lt: fallbackThreshold }
        },
        {
          generationRunnerId: { $exists: true },
          updateTime: { $lt: runnerThreshold }
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
      generationRunnerId: 1,
      generationResponseChatItemId: 1
    }
  )
    .lean()
    .exec()) as GeneratingChat[];

  for (const chat of generatingChats) {
    if (
      chat.generationRunnerId
        ? !chat.updateTime || chat.updateTime >= runnerThreshold
        : !chat.updateTime || chat.updateTime >= fallbackThreshold
    ) {
      continue;
    }

    if (redisFailed) {
      continue;
    }

    const source = getChatSource(chat);
    const cleanupToken = `cleanup:${randomUUID()}`;
    let cleanupLeaseAcquired = false;
    try {
      cleanupLeaseAcquired = await generationLeaseCache.tryAcquire({
        params: {
          ...source,
          chatId: chat.chatId
        },
        token: cleanupToken,
        ttlMs: CLEANUP_LEASE_TTL_MS
      });
    } catch (error) {
      redisFailed = true;
      logger.warn('cleanStaleGeneratingChats: failed to acquire cleanup lease', {
        error
      });
      continue;
    }
    if (!cleanupLeaseAcquired) continue;

    try {
      const currentModifiedCount = await markChatAsError({ chat, now });
      modifiedCount += currentModifiedCount;
      if (chat.generationRunnerId) {
        leaseExpiredCount += currentModifiedCount;
      } else {
        fallbackCount += currentModifiedCount;
      }
    } finally {
      await generationLeaseCache
        .release({
          params: {
            ...source,
            chatId: chat.chatId
          },
          token: cleanupToken
        })
        .catch((error) => {
          logger.warn('cleanStaleGeneratingChats: failed to release cleanup lease', {
            ...source,
            chatId: chat.chatId,
            error
          });
        });
    }
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

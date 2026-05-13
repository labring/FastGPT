import { subMilliseconds, subMinutes } from 'date-fns';
import { ChatGenerateStatusEnum } from '@fastgpt/global/core/chat/constants';
import { getLogger, LogCategories } from '../../common/logger';
import { MongoChat } from './chatSchema';
import {
  getStreamResumeActiveState,
  isStreamResumeActiveStale,
  STREAM_RESUME_INACTIVE_MS
} from './resume';

const logger = getLogger(LogCategories.MODULE.CHAT.HISTORY);

/** 超过该时间仍停留在 generating 的会话视为异常中断，需纠正状态（分钟） */
export const STALE_GENERATING_CHAT_MINUTES = 30;

type GeneratingChat = {
  _id: unknown;
  teamId: { toString: () => string } | string;
  appId: { toString: () => string } | string;
  chatId: string;
  updateTime?: Date;
};

type CleanStaleGeneratingChatsResult = {
  modifiedCount: number;
  inactiveCount: number;
  fallbackCount: number;
};

const markChatAsDone = async (chat: GeneratingChat, now: Date) => {
  const result = await MongoChat.updateOne(
    {
      _id: chat._id,
      chatGenerateStatus: ChatGenerateStatusEnum.generating
    },
    {
      $set: {
        chatGenerateStatus: ChatGenerateStatusEnum.done,
        updateTime: now,
        hasBeenRead: false
      }
    }
  );

  return result.modifiedCount ?? 0;
};

/**
 * 定时将卡在 generating 的对话标记为 done，避免侧栏/恢复逻辑永久认为「生成中」。
 * 优先依赖 Redis stream activity：stream 模式会持续推送心跳，activity 超过 2 分钟未刷新视为异常中断。
 * Redis 异常时保留 30 分钟 updateTime 兜底，避免短暂 Redis 故障误改正在生成的会话。
 */
export const cleanStaleGeneratingChats = async (): Promise<CleanStaleGeneratingChatsResult> => {
  const now = new Date();
  const fallbackThreshold = subMinutes(now, STALE_GENERATING_CHAT_MINUTES);
  const inactiveThreshold = subMilliseconds(now, STREAM_RESUME_INACTIVE_MS);
  let modifiedCount = 0;
  let inactiveCount = 0;
  let fallbackCount = 0;
  let redisFailed = false;

  const generatingChats = (await MongoChat.find(
    {
      chatGenerateStatus: ChatGenerateStatusEnum.generating,
      updateTime: { $lt: inactiveThreshold }
    },
    {
      _id: 1,
      teamId: 1,
      appId: 1,
      chatId: 1,
      updateTime: 1
    }
  )
    .lean()
    .exec()) as GeneratingChat[];

  for (const chat of generatingChats) {
    const shouldUseFallback = !!chat.updateTime && chat.updateTime < fallbackThreshold;

    if (shouldUseFallback) {
      const currentModifiedCount = await markChatAsDone(chat, now);
      modifiedCount += currentModifiedCount;
      fallbackCount += currentModifiedCount;
      continue;
    }

    if (redisFailed) {
      continue;
    }

    try {
      const activeState = await getStreamResumeActiveState({
        teamId: chat.teamId.toString(),
        appId: chat.appId.toString(),
        chatId: chat.chatId
      });

      if (isStreamResumeActiveStale(activeState, now.getTime())) {
        const currentModifiedCount = await markChatAsDone(chat, now);
        modifiedCount += currentModifiedCount;
        inactiveCount += currentModifiedCount;
      }
    } catch (error) {
      redisFailed = true;
      logger.warn('cleanStaleGeneratingChats: failed to inspect stream resume activity', {
        error
      });
    }
  }

  if (modifiedCount > 0) {
    logger.info('cleanStaleGeneratingChats: corrected stuck generating chats', {
      modifiedCount,
      inactiveCount,
      fallbackCount,
      inactiveMs: STREAM_RESUME_INACTIVE_MS,
      fallbackThreshold,
      staleMinutes: STALE_GENERATING_CHAT_MINUTES
    });
  }

  return {
    modifiedCount,
    inactiveCount,
    fallbackCount
  };
};

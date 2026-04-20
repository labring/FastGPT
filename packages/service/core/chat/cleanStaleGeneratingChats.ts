import { subMinutes } from 'date-fns';
import { ChatGenerateStatusEnum } from '@fastgpt/global/core/chat/constants';
import { getLogger, LogCategories } from '../../common/logger';
import { MongoChat } from './chatSchema';

const logger = getLogger(LogCategories.MODULE.CHAT.HISTORY);

/** 超过该时间仍停留在 generating 的会话视为异常中断，需纠正状态（分钟） */
export const STALE_GENERATING_CHAT_MINUTES = 30;

/**
 * 定时将长时间卡在 generating 的对话标记为 done，避免侧栏/恢复逻辑永久认为「生成中」。
 * 依赖 MongoChat.updateTime：进入 generating 时会更新；若进程崩溃未写 done/error，则时间停留在发起时刻。
 */
export const cleanStaleGeneratingChats = async (): Promise<{ modifiedCount: number }> => {
  const threshold = subMinutes(new Date(), STALE_GENERATING_CHAT_MINUTES);
  const now = new Date();

  const result = await MongoChat.updateMany(
    {
      chatGenerateStatus: ChatGenerateStatusEnum.generating,
      updateTime: { $lt: threshold }
    },
    {
      $set: {
        chatGenerateStatus: ChatGenerateStatusEnum.done,
        updateTime: now,
        hasBeenRead: false
      }
    }
  );

  if (result.modifiedCount > 0) {
    logger.info('cleanStaleGeneratingChats: corrected stuck generating chats', {
      modifiedCount: result.modifiedCount,
      threshold,
      staleMinutes: STALE_GENERATING_CHAT_MINUTES
    });
  }

  return { modifiedCount: result.modifiedCount };
};

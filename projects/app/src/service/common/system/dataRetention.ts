import { subDays } from 'date-fns';
import { batchRun } from '@fastgpt/global/common/system/utils';
import { getLogger, LogCategories } from '@fastgpt/service/common/logger';
import { env } from '@fastgpt/service/env';
import { MongoAppChatLog } from '@fastgpt/service/core/app/logs/chatLogsSchema';
import { deleteSandboxesByChatIds } from '@fastgpt/service/core/ai/sandbox/controller';
import { MongoChatItemResponse } from '@fastgpt/service/core/chat/chatItemResponseSchema';
import { MongoChatItem } from '@fastgpt/service/core/chat/chatItemSchema';
import { MongoChat } from '@fastgpt/service/core/chat/chatSchema';
import { getS3ChatSource } from '@fastgpt/service/common/s3/sources/chat/index';
import { MongoTeamAudit } from '@fastgpt/service/support/user/audit/schema';

const logger = getLogger(LogCategories.INFRA.MONGO);
const defaultBatchSize = 200;

type ChatCleanupRecord = {
  appId: string;
  chatId: string;
  tmbId: string;
  outLinkUid?: string;
};

type CleanupSummary = {
  enabled: boolean;
  retentionDays?: number;
  deletedCount: number;
};

type ChatHistoryCleanupSummary = {
  enabled: boolean;
  retentionDays?: number;
  scannedChatCount: number;
  deletedChatCount: number;
  deletedChatItemCount: number;
  deletedChatItemResponseCount: number;
  deletedChatLogCount: number;
};

type GroupedChatCleanupRecord = {
  appId: string;
  chatIds: string[];
  chats: ChatCleanupRecord[];
};

const groupChatsByApp = (chats: ChatCleanupRecord[]): GroupedChatCleanupRecord[] => {
  const groupMap = new Map<string, GroupedChatCleanupRecord>();

  chats.forEach((chat) => {
    const current = groupMap.get(chat.appId);

    if (current) {
      current.chatIds.push(chat.chatId);
      current.chats.push(chat);
      return;
    }

    groupMap.set(chat.appId, {
      appId: chat.appId,
      chatIds: [chat.chatId],
      chats: [chat]
    });
  });

  return Array.from(groupMap.values());
};

const logExternalCleanupFailures = ({
  appId,
  chats,
  results
}: {
  appId: string;
  chats: ChatCleanupRecord[];
  results: PromiseSettledResult<unknown>[];
}) => {
  results.forEach((result, index) => {
    if (result.status === 'fulfilled') return;

    logger.error('Failed to cleanup chat history external resource', {
      appId,
      resource: index === 0 ? 'sandbox' : 'chatFile',
      ...(index > 0 ? { chatId: chats[index - 1]?.chatId } : {}),
      error: result.reason
    });
  });
};

export const hasChatRetentionPolicy = () =>
  Boolean(env.CHAT_HISTORY_RETENTION_DAYS || env.APP_CHAT_LOG_RETENTION_DAYS);

export const hasAuditLogRetentionPolicy = () => Boolean(env.AUDIT_LOG_RETENTION_DAYS);

export async function cleanupExpiredAppChatLogs({
  retentionDays = env.APP_CHAT_LOG_RETENTION_DAYS
}: {
  retentionDays?: number;
} = {}): Promise<CleanupSummary> {
  if (!retentionDays) {
    return {
      enabled: false,
      deletedCount: 0
    };
  }

  const cutoff = subDays(new Date(), retentionDays);
  logger.info('Start app chat log retention cleanup', { retentionDays, cutoff });

  const { deletedCount = 0 } = await MongoAppChatLog.deleteMany({
    updateTime: { $lt: cutoff }
  });

  logger.info('Finished app chat log retention cleanup', { retentionDays, cutoff, deletedCount });

  return {
    enabled: true,
    retentionDays,
    deletedCount
  };
}

export async function cleanupExpiredAuditLogs({
  retentionDays = env.AUDIT_LOG_RETENTION_DAYS
}: {
  retentionDays?: number;
} = {}): Promise<CleanupSummary> {
  if (!retentionDays) {
    return {
      enabled: false,
      deletedCount: 0
    };
  }

  const cutoff = subDays(new Date(), retentionDays);
  logger.info('Start audit log retention cleanup', { retentionDays, cutoff });

  const { deletedCount = 0 } = await MongoTeamAudit.deleteMany({
    timestamp: { $lt: cutoff }
  });

  logger.info('Finished audit log retention cleanup', { retentionDays, cutoff, deletedCount });

  return {
    enabled: true,
    retentionDays,
    deletedCount
  };
}

export async function cleanupExpiredChatHistories({
  retentionDays = env.CHAT_HISTORY_RETENTION_DAYS,
  batchSize = defaultBatchSize
}: {
  retentionDays?: number;
  batchSize?: number;
} = {}): Promise<ChatHistoryCleanupSummary> {
  if (!retentionDays) {
    return {
      enabled: false,
      scannedChatCount: 0,
      deletedChatCount: 0,
      deletedChatItemCount: 0,
      deletedChatItemResponseCount: 0,
      deletedChatLogCount: 0
    };
  }

  const cutoff = subDays(new Date(), retentionDays);
  const s3ChatSource = getS3ChatSource();
  const summary: ChatHistoryCleanupSummary = {
    enabled: true,
    retentionDays,
    scannedChatCount: 0,
    deletedChatCount: 0,
    deletedChatItemCount: 0,
    deletedChatItemResponseCount: 0,
    deletedChatLogCount: 0
  };

  logger.info('Start chat history retention cleanup', {
    retentionDays,
    cutoff,
    batchSize
  });

  while (true) {
    const chats = (await MongoChat.find(
      {
        updateTime: { $lt: cutoff }
      },
      'appId chatId tmbId outLinkUid'
    )
      .sort({ updateTime: 1, _id: 1 })
      .limit(batchSize)
      .lean()) as ChatCleanupRecord[];

    if (chats.length === 0) {
      break;
    }

    summary.scannedChatCount += chats.length;

    await batchRun(
      groupChatsByApp(chats),
      async ({ appId, chatIds, chats }) => {
        const [responseResult, itemResult, chatResult, logResult] = await Promise.all([
          MongoChatItemResponse.deleteMany({
            appId,
            chatId: { $in: chatIds }
          }),
          MongoChatItem.deleteMany({
            appId,
            chatId: { $in: chatIds }
          }),
          MongoChat.deleteMany({
            appId,
            chatId: { $in: chatIds }
          }),
          MongoAppChatLog.deleteMany({
            appId,
            chatId: { $in: chatIds }
          })
        ]);

        summary.deletedChatItemResponseCount += responseResult.deletedCount ?? 0;
        summary.deletedChatItemCount += itemResult.deletedCount ?? 0;
        summary.deletedChatCount += chatResult.deletedCount ?? 0;
        summary.deletedChatLogCount += logResult.deletedCount ?? 0;

        const externalCleanupResults = await Promise.allSettled([
          deleteSandboxesByChatIds({ appId, chatIds }),
          ...chats.map((chat) =>
            s3ChatSource.deleteChatFilesByPrefix({
              appId,
              chatId: chat.chatId,
              uId: String(chat.outLinkUid || chat.tmbId)
            })
          )
        ]);

        logExternalCleanupFailures({
          appId,
          chats,
          results: externalCleanupResults
        });
      },
      5
    );

    if (chats.length < batchSize) {
      break;
    }
  }

  logger.info('Finished chat history retention cleanup', summary);

  return summary;
}

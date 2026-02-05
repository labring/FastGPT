import { NextAPI } from '@/service/middleware/entry';
import { addLog } from '@fastgpt/service/common/system/log';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import { MongoChatItem } from '@fastgpt/service/core/chat/chatItemSchema';
import { MongoChatItemResponse } from '@fastgpt/service/core/chat/chatItemResponseSchema';
import { MongoChat } from '@fastgpt/service/core/chat/chatSchema';
import { batchRun } from '@fastgpt/global/common/system/utils';

/**
 * Initialize error count for chat records
 *
 * Strategy:
 * 1. Aggregate error count from chatItem.responseData[].errorText
 * 2. Aggregate error count from chatItemResponse.data.errorText
 * 3. Merge and sum by (appId, chatId)
 * 4. Use batchRun to update errorCount concurrently
 */

const CONCURRENCY = 10;

type ChatErrorCount = {
  appId: string;
  chatId: string;
  errorCount: number;
};

/**
 * Get error count from ChatItem for each chat
 */
async function getErrorCountFromChatItem(): Promise<ChatErrorCount[]> {
  addLog.info('Aggregating error count from chatItems...');

  const results = await MongoChatItem.aggregate<ChatErrorCount>(
    [
      {
        $match: {
          'responseData.errorText': { $exists: true, $ne: null }
        }
      },
      {
        $project: {
          appId: 1,
          chatId: 1,
          errorCount: {
            $size: {
              $filter: {
                input: { $ifNull: ['$responseData', []] },
                as: 'item',
                cond: { $ne: [{ $ifNull: ['$$item.errorText', null] }, null] }
              }
            }
          }
        }
      },
      {
        $group: {
          _id: {
            appId: '$appId',
            chatId: '$chatId'
          },
          errorCount: { $sum: '$errorCount' }
        }
      },
      {
        $project: {
          _id: 0,
          appId: { $toString: '$_id.appId' },
          chatId: '$_id.chatId',
          errorCount: 1
        }
      }
    ],
    { allowDiskUse: true, maxTimeMS: 6000000 }
  );

  addLog.info(`Found ${results.length.toLocaleString()} chats with error from chatItems`);
  return results;
}

/**
 * Get error count from ChatItemResponse for each chat
 */
async function getErrorCountFromResponse(): Promise<ChatErrorCount[]> {
  addLog.info('Aggregating error count from chatItemResponses...');

  const results = await MongoChatItemResponse.aggregate<ChatErrorCount>(
    [
      {
        $match: {
          'data.errorText': { $exists: true, $ne: null }
        }
      },
      {
        $group: {
          _id: {
            appId: '$appId',
            chatId: '$chatId'
          },
          errorCount: { $sum: 1 }
        }
      },
      {
        $project: {
          _id: 0,
          appId: { $toString: '$_id.appId' },
          chatId: '$_id.chatId',
          errorCount: 1
        }
      }
    ],
    { allowDiskUse: true, maxTimeMS: 6000000 }
  );

  addLog.info(`Found ${results.length.toLocaleString()} chats with error from chatItemResponses`);
  return results;
}

/**
 * Main migration function
 */
export async function migrateErrorCount() {
  const startTime = Date.now();

  addLog.info('========================================');
  addLog.info('Starting error count migration');
  addLog.info(`Concurrency: ${CONCURRENCY}`);
  addLog.info('========================================');

  // Get error counts from both sources
  const [chatItemErrors, responseErrors] = await Promise.all([
    getErrorCountFromChatItem(),
    getErrorCountFromResponse()
  ]);

  // Merge and sum by (appId, chatId)
  const chatMap = new Map<string, ChatErrorCount>();

  for (const item of [...chatItemErrors, ...responseErrors]) {
    const key = `${item.appId}_${item.chatId}`;
    const existing = chatMap.get(key);
    if (existing) {
      existing.errorCount += item.errorCount;
    } else {
      chatMap.set(key, { ...item });
    }
  }

  const chats = Array.from(chatMap.values());
  addLog.info(`Found ${chats.length.toLocaleString()} unique chats with error (after merge)`);

  if (chats.length === 0) {
    addLog.info('No chats with error found');
    return {
      total: 0,
      succeeded: 0,
      failed: 0,
      duration: 0
    };
  }

  // Process all chats using batchRun
  addLog.info(`Processing ${chats.length.toLocaleString()} chats...`);

  let succeeded = 0;
  let failed = 0;

  await batchRun(
    chats,
    async (chat) => {
      try {
        await MongoChat.updateOne(
          { appId: chat.appId, chatId: chat.chatId },
          { $set: { errorCount: chat.errorCount } }
        );
        succeeded++;

        // Log progress every 1000 chats
        if (succeeded % 1000 === 0) {
          addLog.info(`Progress: ${succeeded.toLocaleString()} / ${chats.length.toLocaleString()}`);
        }
      } catch (error) {
        failed++;
        addLog.error(
          `Failed to process chat ${chat.chatId}:`,
          error instanceof Error ? error.message : String(error)
        );
      }
    },
    CONCURRENCY
  );

  const duration = Date.now() - startTime;
  const durationMinutes = (duration / 1000 / 60).toFixed(2);

  addLog.info('========================================');
  addLog.info('Migration error count completed!');
  addLog.info(`Total: ${chats.length.toLocaleString()}`);
  addLog.info(`Succeeded: ${succeeded.toLocaleString()}`);
  addLog.info(`Failed: ${failed.toLocaleString()}`);
  addLog.info(`Duration: ${durationMinutes} minutes`);
  addLog.info(`Average: ${(duration / chats.length).toFixed(0)}ms per chat`);
  addLog.info('========================================');

  return {
    total: chats.length,
    succeeded,
    failed,
    duration
  };
}

export default NextAPI(async function handler(req, res) {
  await authCert({ req, authRoot: true });

  const result = await migrateErrorCount();

  return result;
});

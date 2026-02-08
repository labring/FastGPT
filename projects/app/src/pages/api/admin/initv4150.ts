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
 * 1. Create temporary indexes for migration
 * 2. Aggregate all chats with error from chatItem and chatItemResponse
 * 3. Use batchRun to update error counts concurrently
 */

const CONCURRENCY = 10;

type ChatErrorInfo = {
  appId: string;
  chatId: string;
  errorCount: number;
};

/**
 * Create temporary indexes for migration performance
 */
async function createTemporaryIndexes(): Promise<void> {
  addLog.info('Creating temporary indexes for migration...');

  try {
    await Promise.all([
      MongoChatItem.collection.createIndex({ 'responseData.errorText': 1, appId: 1, chatId: 1 }, {
        name: 'temp_error_migration_chatitem',
        partialFilterExpression: { 'responseData.errorText': { $exists: true } },
        background: true
      } as any),
      MongoChatItemResponse.collection.createIndex({ 'data.errorText': 1, appId: 1, chatId: 1 }, {
        name: 'temp_error_migration_response',
        partialFilterExpression: { 'data.errorText': { $exists: true } },
        background: true
      } as any)
    ]);

    addLog.info('Temporary indexes created successfully');
  } catch (error: any) {
    addLog.warn('Error creating indexes (may already exist):', error);
  }
}

// Remove temp indexes
async function removeTemporaryIndexes(): Promise<void> {
  addLog.info('Removing temporary indexes...');
  await Promise.all([
    MongoChatItem.collection.dropIndex('temp_error_migration_chatitem'),
    MongoChatItemResponse.collection.dropIndex('temp_error_migration_response')
  ]);
  addLog.info('Temporary indexes removed successfully');
}

/**
 * Get all unique chats that have error
 */
async function getChatsWithError(): Promise<ChatErrorInfo[]> {
  addLog.info('Aggregating chats with error...');

  // Get errors from chatItem
  const chatItemErrorsPromise = MongoChatItem.aggregate<{
    appId: string;
    chatId: string;
    errorCount: number;
  }>(
    [
      {
        $match: {
          'responseData.errorText': { $exists: true }
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
      }
    ],
    { allowDiskUse: true, maxTimeMS: 6000000 }
  );

  // Get errors from chatItemResponse
  const responseErrorsPromise = MongoChatItemResponse.aggregate<{
    appId: string;
    chatId: string;
    errorCount: number;
  }>(
    [
      {
        $match: {
          'data.errorText': { $exists: true }
        }
      },
      {
        $project: {
          _id: 0,
          appId: 1,
          chatId: 1,
          errorCount: { $literal: 1 }
        }
      }
    ],
    { allowDiskUse: true, maxTimeMS: 6000000 }
  );

  // Execute both queries in parallel
  const [chatItemErrors, responseErrors] = await Promise.all([
    chatItemErrorsPromise,
    responseErrorsPromise
  ]);

  addLog.info(`Found ${chatItemErrors.length.toLocaleString()} chats with error from chatItem`);
  addLog.info(
    `Found ${responseErrors.length.toLocaleString()} chats with error from chatItemResponse`
  );

  // Deduplicate in application layer using Map
  const chatMap = new Map<string, ChatErrorInfo>();

  for (const chat of [...chatItemErrors, ...responseErrors]) {
    const key = `${String(chat.appId)}_${chat.chatId}`;
    const existing = chatMap.get(key);
    if (existing) {
      existing.errorCount += chat.errorCount;
    } else {
      chatMap.set(key, { ...chat });
    }
  }

  const result = Array.from(chatMap.values());
  addLog.info(`Found ${result.length.toLocaleString()} unique chats with error (after merge)`);

  return result;
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

  // Step 1: Create temporary indexes
  await createTemporaryIndexes();

  // Step 2: Get all chats with error
  const chats = await getChatsWithError();

  // Remove temporary indexes
  await removeTemporaryIndexes();

  if (chats.length === 0) {
    addLog.info('No chats with error found');
    return {
      total: 0,
      succeeded: 0,
      failed: 0,
      duration: 0
    };
  }

  // Step 3: Process all chats using batchRun
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

export default NextAPI(async function handler(req) {
  await authCert({ req, authRoot: true });

  const result = await migrateErrorCount();

  return result;
});

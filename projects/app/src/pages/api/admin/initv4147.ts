import { NextAPI } from '@/service/middleware/entry';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import { MongoChatItem } from '@fastgpt/service/core/chat/chatItemSchema';
import { MongoChatItemResponse } from '@fastgpt/service/core/chat/chatItemResponseSchema';
import { MongoChat } from '@fastgpt/service/core/chat/chatSchema';
import { batchRun } from '@fastgpt/global/common/system/utils';
import { getLogger } from '@fastgpt/service/common/logger';

const logger = getLogger(['initv4147']);

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
  logger.info('Creating temporary indexes for migration...');

  try {
    await Promise.all([
      // Simple index for efficient lookup: only index docs with errorText
      // Query will use hint() to force index usage
      MongoChatItem.collection.createIndex({ appId: 1, chatId: 1 }, {
        name: 'temp_error_migration_chatitem',
        partialFilterExpression: { 'responseData.errorText': { $exists: true } },
        background: true
      } as any),
      MongoChatItemResponse.collection.createIndex({ appId: 1, chatId: 1 }, {
        name: 'temp_error_migration_response',
        partialFilterExpression: { 'data.errorText': { $exists: true } },
        background: true
      } as any)
    ]);

    logger.info('Temporary indexes created successfully');
  } catch (error: any) {
    logger.warn('Error creating indexes (may already exist):', error);
  }
}

/**
 * Get all unique chats that have error
 */
async function getChatsWithError(): Promise<ChatErrorInfo[]> {
  logger.info('Aggregating chats with error...');

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
    {
      allowDiskUse: true,
      maxTimeMS: 6000000,
      hint: 'temp_error_migration_chatitem' // Force use of our index
    }
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
          appId: '$_id.appId',
          chatId: '$_id.chatId',
          errorCount: 1
        }
      }
    ],
    {
      allowDiskUse: true,
      maxTimeMS: 6000000,
      hint: 'temp_error_migration_response' // Force use of our index
    }
  );

  // Execute both queries in parallel
  const [chatItemErrors, responseErrors] = await Promise.all([
    chatItemErrorsPromise,
    responseErrorsPromise
  ]);

  logger.info(`Found ${chatItemErrors.length.toLocaleString()} chats with error from chatItem`);
  logger.info(
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
  logger.info(`Found ${result.length.toLocaleString()} unique chats with error (after merge)`);

  return result;
}

/**
 * Main migration function
 */
export async function migrateErrorCount() {
  const startTime = Date.now();

  logger.info('========================================');
  logger.info('Starting error count migration');
  logger.info(`Concurrency: ${CONCURRENCY}`);
  logger.info('========================================');

  // Step 1: Create temporary indexes
  await createTemporaryIndexes();

  // Step 2: Get all chats with error
  const chats = await getChatsWithError();

  if (chats.length === 0) {
    logger.info('No chats with error found');
    return {
      total: 0,
      succeeded: 0,
      failed: 0,
      duration: 0
    };
  }

  // Step 3: Process all chats using batchRun
  logger.info(`Processing ${chats.length.toLocaleString()} chats...`);

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
          logger.info(`Progress: ${succeeded.toLocaleString()} / ${chats.length.toLocaleString()}`);
        }
      } catch (error) {
        failed++;
        logger.error(`Failed to process chat ${chat.chatId}:`, { error });
      }
    },
    CONCURRENCY
  );

  const duration = Date.now() - startTime;
  const durationMinutes = (duration / 1000 / 60).toFixed(2);

  logger.info('========================================');
  logger.info('Migration error count completed!');
  logger.info(`Total: ${chats.length.toLocaleString()}`);
  logger.info(`Succeeded: ${succeeded.toLocaleString()}`);
  logger.info(`Failed: ${failed.toLocaleString()}`);
  logger.info(`Duration: ${durationMinutes} minutes`);
  logger.info(`Average: ${(duration / chats.length).toFixed(0)}ms per chat`);
  logger.info('========================================');

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

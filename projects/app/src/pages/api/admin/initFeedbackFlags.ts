import { NextAPI } from '@/service/middleware/entry';
import { addLog } from '@fastgpt/service/common/system/log';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import { MongoChatItem } from '@fastgpt/service/core/chat/chatItemSchema';
import { updateChatFeedbackCount } from '@fastgpt/service/core/chat/controller';
import { batchRun } from '@fastgpt/global/common/system/utils';

/**
 * Initialize feedback flags for chat records
 *
 * Optimized strategy:
 * 1. Create temporary indexes for migration
 * 2. Aggregate all chats with feedback from chatItem (only ~1% of total)
 * 3. Use batchRun to update feedback counts concurrently
 * 4. Mark each chat as migrated
 * 5. Drop temporary indexes after completion
 */

const CONCURRENCY = 10;

type ChatIdentifier = {
  teamId: string;
  appId: string;
  chatId: string;
};

/**
 * Create temporary indexes for migration performance
 */
async function createTemporaryIndexes(): Promise<void> {
  addLog.info('Creating temporary indexes for migration...');

  try {
    await Promise.all([
      MongoChatItem.collection.createIndex(
        { userGoodFeedback: 1, teamId: 1, appId: 1, chatId: 1 },
        {
          name: 'temp_feedback_migration_good',
          partialFilterExpression: { userGoodFeedback: { $exists: true } },
          background: true
        } as any
      ),
      MongoChatItem.collection.createIndex({ userBadFeedback: 1, teamId: 1, appId: 1, chatId: 1 }, {
        name: 'temp_feedback_migration_bad',
        partialFilterExpression: { userBadFeedback: { $exists: true } },
        background: true
      } as any)
    ]);

    addLog.info('Temporary indexes created successfully');
  } catch (error: any) {
    // Index might already exist, log warning but continue
    addLog.warn('Error creating indexes (may already exist):', error);
  }
}

/**
 * Get all unique chats that have feedback
 * Optimized: Separate queries for good/bad feedback to utilize indexes better
 */
async function getChatsWithFeedback(): Promise<ChatIdentifier[]> {
  addLog.info('Aggregating chats with feedback from chatItems...');

  // Separate queries for good and bad feedback to utilize partial indexes better
  const goodFeedbackChatsPromise = MongoChatItem.aggregate<ChatIdentifier>(
    [
      {
        $match: {
          userGoodFeedback: { $exists: true }
        }
      },
      {
        $group: {
          _id: {
            teamId: '$teamId',
            appId: '$appId',
            chatId: '$chatId'
          }
        }
      },
      {
        $project: {
          _id: 0,
          teamId: { $toString: '$_id.teamId' },
          appId: { $toString: '$_id.appId' },
          chatId: '$_id.chatId'
        }
      }
    ],
    { allowDiskUse: true, maxTimeMS: 6000000 }
  );

  const badFeedbackChatsPromise = MongoChatItem.aggregate<ChatIdentifier>(
    [
      {
        $match: {
          userBadFeedback: { $exists: true }
        }
      },
      {
        $group: {
          _id: {
            teamId: '$teamId',
            appId: '$appId',
            chatId: '$chatId'
          }
        }
      },
      {
        $project: {
          _id: 0,
          teamId: { $toString: '$_id.teamId' },
          appId: { $toString: '$_id.appId' },
          chatId: '$_id.chatId'
        }
      }
    ],
    { allowDiskUse: true, maxTimeMS: 6000000 }
  );

  // Execute both queries in parallel
  const [goodChats, badChats] = await Promise.all([
    goodFeedbackChatsPromise,
    badFeedbackChatsPromise
  ]);

  addLog.info(`Found ${goodChats.length.toLocaleString()} chats with good feedback`);
  addLog.info(`Found ${badChats.length.toLocaleString()} chats with bad feedback`);

  // Deduplicate in application layer using Map
  const chatMap = new Map<string, ChatIdentifier>();

  for (const chat of [...goodChats, ...badChats]) {
    const key = `${chat.teamId}_${chat.appId}_${chat.chatId}`;
    if (!chatMap.has(key)) {
      chatMap.set(key, chat);
    }
  }

  const result = Array.from(chatMap.values());
  addLog.info(`Found ${result.length.toLocaleString()} unique chats with feedback (after dedup)`);

  return result;
}

/**
 * Main migration function
 */
export async function migrateFeedbackFlags() {
  const startTime = Date.now();

  addLog.info('========================================');
  addLog.info('Starting feedback flags migration');
  addLog.info(`Concurrency: ${CONCURRENCY}`);
  addLog.info('========================================');

  // Step 1: Create temporary indexes
  await createTemporaryIndexes();

  // Step 2: Get all chats with feedback
  const chats = await getChatsWithFeedback();

  if (chats.length === 0) {
    addLog.info('No chats with feedback found');
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
        await updateChatFeedbackCount({
          appId: chat.appId,
          chatId: chat.chatId
        });
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
  addLog.info('Migration feedback completed!');
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

  const result = await migrateFeedbackFlags();

  return result;
});

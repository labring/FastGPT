import { beforeEach, describe, expect, it } from 'vitest';
import {
  ChatRoleEnum,
  ChatSourceEnum,
  ChatSourceTypeEnum
} from '@fastgpt/global/core/chat/constants';
import { MongoChat } from '@fastgpt/service/core/chat/chatSchema';
import { MongoChatItem } from '@fastgpt/service/core/chat/chatItemSchema';
import { Types } from '@fastgpt/service/common/mongo';
import { runCleanupDuplicateChatsMigration } from '@/pages/api/admin/dataClean/cleanupDuplicateChats';

const teamId = '65f000000000000000000061';
const tmbId = '65f000000000000000000062';
const appId = '65f000000000000000000063';
const otherAppId = '65f000000000000000000064';

const legacyUniqueIndexNames = ['appId_1_chatId_1', 'sourceType_1_appId_1_chatId_1'] as const;

const ensureLegacyDuplicateWritableCollection = async () => {
  for (const indexName of legacyUniqueIndexNames) {
    try {
      await MongoChat.collection.dropIndex(indexName);
    } catch (error) {
      const codeName = (error as { codeName?: string }).codeName;
      if (codeName !== 'IndexNotFound' && codeName !== 'NamespaceNotFound') {
        throw error;
      }
    }
  }
};

const createChatHeader = ({
  id,
  sourceId = appId,
  chatId,
  updateTime
}: {
  id: string;
  sourceId?: string;
  chatId: string;
  updateTime: Date;
}) => ({
  _id: new Types.ObjectId(id),
  teamId: new Types.ObjectId(teamId),
  tmbId: new Types.ObjectId(tmbId),
  sourceType: ChatSourceTypeEnum.app,
  appId: new Types.ObjectId(sourceId),
  chatId,
  source: ChatSourceEnum.online,
  title: `chat-${chatId}`,
  createTime: new Date('2026-01-01T00:00:00.000Z'),
  updateTime
});

const createChatUniqueIndexes = async () => {
  await MongoChat.collection.createIndex({ appId: 1, chatId: 1 }, { unique: true });
  await MongoChat.collection.createIndex(
    { sourceType: 1, appId: 1, chatId: 1 },
    { unique: true, name: 'sourceType_1_appId_1_chatId_1' }
  );
};

describe('cleanupDuplicateChats data clean API', () => {
  beforeEach(async () => {
    await ensureLegacyDuplicateWritableCollection();
  });

  it('dry-runs duplicate chat headers without deleting data', async () => {
    await MongoChat.collection.insertMany([
      createChatHeader({
        id: '65f000000000000000000101',
        chatId: 'duplicate-chat',
        updateTime: new Date('2026-01-01T00:00:00.000Z')
      }),
      createChatHeader({
        id: '65f000000000000000000102',
        chatId: 'duplicate-chat',
        updateTime: new Date('2026-01-02T00:00:00.000Z')
      }),
      createChatHeader({
        id: '65f000000000000000000103',
        chatId: 'unique-chat',
        updateTime: new Date('2026-01-03T00:00:00.000Z')
      })
    ]);

    const result = await runCleanupDuplicateChatsMigration({
      dryRun: true,
      sampleLimit: 10
    });

    expect(result).toMatchObject({
      dryRun: true,
      scannedDuplicateGroupCount: 1,
      duplicateDocumentCount: 1,
      deletedDocumentCount: 0,
      samples: [
        {
          appId,
          chatId: 'duplicate-chat',
          totalCount: 2,
          duplicateCount: 1,
          keepId: '65f000000000000000000102',
          deleteIds: ['65f000000000000000000101']
        }
      ]
    });
    expect(await MongoChat.countDocuments({ appId, chatId: 'duplicate-chat' })).toBe(2);
  });

  it('deletes only duplicate chat headers and keeps chat items untouched', async () => {
    await MongoChat.collection.insertMany([
      createChatHeader({
        id: '65f000000000000000000201',
        chatId: 'duplicate-chat',
        updateTime: new Date('2026-01-01T00:00:00.000Z')
      }),
      createChatHeader({
        id: '65f000000000000000000202',
        chatId: 'duplicate-chat',
        updateTime: new Date('2026-01-02T00:00:00.000Z')
      }),
      createChatHeader({
        id: '65f000000000000000000203',
        chatId: 'duplicate-chat',
        updateTime: new Date('2026-01-02T00:00:00.000Z')
      }),
      createChatHeader({
        id: '65f000000000000000000204',
        sourceId: otherAppId,
        chatId: 'duplicate-chat',
        updateTime: new Date('2026-01-03T00:00:00.000Z')
      })
    ]);
    await MongoChatItem.create({
      teamId,
      tmbId,
      sourceType: ChatSourceTypeEnum.app,
      appId,
      chatId: 'duplicate-chat',
      dataId: 'item-1',
      obj: ChatRoleEnum.AI,
      value: [{ type: 'text', text: { content: 'answer' } }]
    });

    const result = await runCleanupDuplicateChatsMigration({
      dryRun: false,
      sampleLimit: 10
    });

    expect(result).toMatchObject({
      dryRun: false,
      scannedDuplicateGroupCount: 1,
      duplicateDocumentCount: 2,
      deletedDocumentCount: 2,
      samples: [
        {
          appId,
          chatId: 'duplicate-chat',
          totalCount: 3,
          duplicateCount: 2,
          keepId: '65f000000000000000000203',
          deleteIds: ['65f000000000000000000202', '65f000000000000000000201']
        }
      ]
    });

    const keptChats = await MongoChat.find({ chatId: 'duplicate-chat' }).sort({ appId: 1 }).lean();
    expect(keptChats.map((chat) => String(chat._id)).sort()).toEqual([
      '65f000000000000000000203',
      '65f000000000000000000204'
    ]);
    expect(await MongoChatItem.countDocuments({ appId, chatId: 'duplicate-chat' })).toBe(1);
  });

  it('allows unique chat indexes to be created after cleanup', async () => {
    await MongoChat.collection.insertMany([
      createChatHeader({
        id: '65f000000000000000000401',
        chatId: 'duplicate-chat',
        updateTime: new Date('2026-01-01T00:00:00.000Z')
      }),
      createChatHeader({
        id: '65f000000000000000000402',
        chatId: 'duplicate-chat',
        updateTime: new Date('2026-01-02T00:00:00.000Z')
      }),
      createChatHeader({
        id: '65f000000000000000000403',
        chatId: 'unique-chat',
        updateTime: new Date('2026-01-03T00:00:00.000Z')
      })
    ]);

    await expect(createChatUniqueIndexes()).rejects.toThrow(/duplicate key/i);

    await ensureLegacyDuplicateWritableCollection();
    await runCleanupDuplicateChatsMigration({
      dryRun: false,
      sampleLimit: 10
    });

    await expect(createChatUniqueIndexes()).resolves.toBeUndefined();

    const indexes = await MongoChat.collection.indexes();
    expect(
      indexes.find((index) => index.name === 'appId_1_chatId_1' && index.unique === true)
    ).toBeTruthy();
    expect(
      indexes.find(
        (index) => index.name === 'sourceType_1_appId_1_chatId_1' && index.unique === true
      )
    ).toBeTruthy();
  });

  it('ignores invalid duplicate keys with empty chatId', async () => {
    await MongoChat.collection.insertMany([
      createChatHeader({
        id: '65f000000000000000000301',
        chatId: '',
        updateTime: new Date('2026-01-01T00:00:00.000Z')
      }),
      createChatHeader({
        id: '65f000000000000000000302',
        chatId: '',
        updateTime: new Date('2026-01-02T00:00:00.000Z')
      })
    ]);

    const result = await runCleanupDuplicateChatsMigration({
      dryRun: false,
      sampleLimit: 10
    });

    expect(result).toMatchObject({
      scannedDuplicateGroupCount: 0,
      duplicateDocumentCount: 0,
      deletedDocumentCount: 0,
      samples: []
    });
    expect(await MongoChat.countDocuments({ appId, chatId: '' })).toBe(2);
  });
});

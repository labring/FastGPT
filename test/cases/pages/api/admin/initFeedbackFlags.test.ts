import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@/service/middleware/entry', () => ({
  NextAPI: (handler: any) => handler
}));
vi.mock('@fastgpt/service/support/permission/auth/common', () => ({
  authCert: vi.fn()
}));
vi.mock('@fastgpt/service/core/chat/controller', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@fastgpt/service/core/chat/controller')>();
  return {
    ...actual,
    updateChatFeedbackCount: vi.fn()
  };
});
vi.mock('@fastgpt/global/common/system/utils', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@fastgpt/global/common/system/utils')>();
  return {
    ...actual,
    batchRun: vi.fn()
  };
});
vi.mock('@fastgpt/service/common/system/log', () => ({
  addLog: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }
}));

let addLogInfoSpy: ReturnType<typeof vi.fn>;
let addLogWarnSpy: ReturnType<typeof vi.fn>;
let addLogErrorSpy: ReturnType<typeof vi.fn>;

let realModule: typeof import('@/pages/api/admin/initFeedbackFlags');

beforeEach(async () => {
  vi.resetModules();
  vi.clearAllMocks();

  // Patch MongoChatItem for each test; must be BEFORE importing realModule
  const mongoChatItemMock = {
    collection: {
      createIndex: vi.fn()
    },
    aggregate: vi.fn()
  };
  vi.doMock('@fastgpt/service/core/chat/chatItemSchema', () => ({
    MongoChatItem: mongoChatItemMock
  }));

  // Dynamically import after mocks set up
  realModule = await import('@/pages/api/admin/initFeedbackFlags');

  // Patch addLog spies
  const { addLog } = await import('@fastgpt/service/common/system/log');
  addLogInfoSpy = vi.mocked(addLog.info);
  addLogWarnSpy = vi.mocked(addLog.warn);
  addLogErrorSpy = vi.mocked(addLog.error);
});

describe('initFeedbackFlags', () => {
  describe('createTemporaryIndexes', () => {
    it('should create temporary indexes successfully', async () => {
      // Patch MongoChatItem.collection.createIndex
      const { MongoChatItem } = await import('@fastgpt/service/core/chat/chatItemSchema');
      const createIndexSpy = vi.fn().mockResolvedValue(undefined);
      MongoChatItem.collection.createIndex = createIndexSpy;

      await realModule.createTemporaryIndexes();

      expect(createIndexSpy).toHaveBeenCalledTimes(2);
      expect(createIndexSpy).toHaveBeenNthCalledWith(
        1,
        { userGoodFeedback: 1, teamId: 1, appId: 1, chatId: 1 },
        expect.objectContaining({ name: 'temp_feedback_migration_good' })
      );
      expect(createIndexSpy).toHaveBeenNthCalledWith(
        2,
        { userBadFeedback: 1, teamId: 1, appId: 1, chatId: 1 },
        expect.objectContaining({ name: 'temp_feedback_migration_bad' })
      );
      expect(addLogInfoSpy).toHaveBeenCalledWith('Creating temporary indexes for migration...');
      expect(addLogInfoSpy).toHaveBeenCalledWith('Temporary indexes created successfully');
    });

    it('should log warning if error occurs', async () => {
      const { MongoChatItem } = await import('@fastgpt/service/core/chat/chatItemSchema');
      const createIndexSpy = vi
        .fn()
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(new Error('Index exists'));
      MongoChatItem.collection.createIndex = createIndexSpy;

      await realModule.createTemporaryIndexes();

      expect(createIndexSpy).toHaveBeenCalledTimes(2);
      expect(addLogWarnSpy).toHaveBeenCalledWith(
        'Error creating indexes (may already exist):',
        expect.any(Error)
      );
      expect(addLogInfoSpy).toHaveBeenCalledWith('Creating temporary indexes for migration...');
    });
  });

  describe('getChatsWithFeedback', () => {
    it('should aggregate and deduplicate chats with feedback', async () => {
      const goodChats = [
        { teamId: 't1', appId: 'a1', chatId: 'c1' },
        { teamId: 't2', appId: 'a2', chatId: 'c2' }
      ];
      const badChats = [
        { teamId: 't1', appId: 'a1', chatId: 'c1' },
        { teamId: 't3', appId: 'a3', chatId: 'c3' }
      ];

      const { MongoChatItem } = await import('@fastgpt/service/core/chat/chatItemSchema');
      // Patch aggregate to return .allowDiskUse().then()
      MongoChatItem.aggregate = vi
        .fn()
        .mockReturnValueOnce({
          allowDiskUse: vi.fn().mockReturnValue(Promise.resolve(goodChats))
        })
        .mockReturnValueOnce({
          allowDiskUse: vi.fn().mockReturnValue(Promise.resolve(badChats))
        });

      const result = await realModule.getChatsWithFeedback();

      expect(result).toHaveLength(3);
      expect(result).toEqual(
        expect.arrayContaining([
          { teamId: 't1', appId: 'a1', chatId: 'c1' },
          { teamId: 't2', appId: 'a2', chatId: 'c2' },
          { teamId: 't3', appId: 'a3', chatId: 'c3' }
        ])
      );
      expect(addLogInfoSpy).toHaveBeenCalledWith('Found 2 chats with good feedback');
      expect(addLogInfoSpy).toHaveBeenCalledWith('Found 2 chats with bad feedback');
      expect(addLogInfoSpy).toHaveBeenCalledWith(
        'Found 3 unique chats with feedback (after dedup)'
      );
    });

    it('should return empty array if no chats with feedback', async () => {
      const { MongoChatItem } = await import('@fastgpt/service/core/chat/chatItemSchema');
      MongoChatItem.aggregate = vi
        .fn()
        .mockReturnValueOnce({
          allowDiskUse: vi.fn().mockReturnValue(Promise.resolve([]))
        })
        .mockReturnValueOnce({
          allowDiskUse: vi.fn().mockReturnValue(Promise.resolve([]))
        });

      const result = await realModule.getChatsWithFeedback();

      expect(result).toEqual([]);
      expect(addLogInfoSpy).toHaveBeenCalledWith('Found 0 chats with good feedback');
      expect(addLogInfoSpy).toHaveBeenCalledWith('Found 0 chats with bad feedback');
      expect(addLogInfoSpy).toHaveBeenCalledWith(
        'Found 0 unique chats with feedback (after dedup)'
      );
    });
  });

  describe('migrateFeedbackFlags', () => {
    it('should return early if no chats with feedback', async () => {
      // Patch MongoChatItem.aggregate to handle getChatsWithFeedback internals
      const { MongoChatItem } = await import('@fastgpt/service/core/chat/chatItemSchema');
      MongoChatItem.aggregate = vi.fn().mockReturnValue({
        allowDiskUse: vi.fn().mockReturnValue(Promise.resolve([]))
      });

      // Patch createTemporaryIndexes using spyOn/vi.spyOn if needed
      // Instead, patch the method on the prototype or spy using vi.spyOn once loaded
      const spy = vi.spyOn(realModule, 'createTemporaryIndexes').mockResolvedValue(undefined);

      const result = await realModule.migrateFeedbackFlags();

      expect(result).toMatchObject({
        total: 0,
        succeeded: 0,
        failed: 0,
        duration: 0
      });
      expect(addLogInfoSpy).toHaveBeenCalledWith('No chats with feedback found');
      spy.mockRestore();
    });

    it('should process all chats successfully', async () => {
      const chats = [
        { teamId: 't1', appId: 'a1', chatId: 'c1' },
        { teamId: 't2', appId: 'a2', chatId: 'c2' },
        { teamId: 't3', appId: 'a3', chatId: 'c3' }
      ];

      // Patch MongoChatItem.aggregate for getChatsWithFeedback
      const { MongoChatItem } = await import('@fastgpt/service/core/chat/chatItemSchema');
      MongoChatItem.aggregate = vi
        .fn()
        .mockReturnValueOnce({
          allowDiskUse: vi.fn().mockReturnValue(
            Promise.resolve([
              { teamId: 't1', appId: 'a1', chatId: 'c1' },
              { teamId: 't2', appId: 'a2', chatId: 'c2' }
            ])
          )
        })
        .mockReturnValueOnce({
          allowDiskUse: vi
            .fn()
            .mockReturnValue(Promise.resolve([{ teamId: 't3', appId: 'a3', chatId: 'c3' }]))
        });

      // Patch createTemporaryIndexes
      const spy = vi.spyOn(realModule, 'createTemporaryIndexes').mockResolvedValue(undefined);

      // Patch updateChatFeedbackCount
      const controller = await import('@fastgpt/service/core/chat/controller');
      vi.mocked(controller.updateChatFeedbackCount).mockResolvedValue(undefined);

      // Patch batchRun to call the cb for each chat
      const utils = await import('@fastgpt/global/common/system/utils');
      vi.mocked(utils.batchRun).mockImplementation(async (items, cb) => {
        for (const item of items as typeof chats) {
          await cb(item);
        }
      });

      const result = await realModule.migrateFeedbackFlags();

      expect(result.total).toBe(3);
      expect(result.succeeded).toBe(3);
      expect(result.failed).toBe(0);
      expect(result.duration).toBeGreaterThanOrEqual(0);
      expect(controller.updateChatFeedbackCount).toHaveBeenCalledTimes(3);
      spy.mockRestore();
    });

    it('should count failed chats if updateChatFeedbackCount throws', async () => {
      const chats = [
        { teamId: 't1', appId: 'a1', chatId: 'c1' },
        { teamId: 't2', appId: 'a2', chatId: 'c2' }
      ];

      // Patch MongoChatItem.aggregate for getChatsWithFeedback
      const { MongoChatItem } = await import('@fastgpt/service/core/chat/chatItemSchema');
      MongoChatItem.aggregate = vi
        .fn()
        .mockReturnValueOnce({
          allowDiskUse: vi
            .fn()
            .mockReturnValue(Promise.resolve([{ teamId: 't1', appId: 'a1', chatId: 'c1' }]))
        })
        .mockReturnValueOnce({
          allowDiskUse: vi
            .fn()
            .mockReturnValue(Promise.resolve([{ teamId: 't2', appId: 'a2', chatId: 'c2' }]))
        });

      // Patch createTemporaryIndexes
      const spy = vi.spyOn(realModule, 'createTemporaryIndexes').mockResolvedValue(undefined);

      // Patch updateChatFeedbackCount
      const controller = await import('@fastgpt/service/core/chat/controller');
      vi.mocked(controller.updateChatFeedbackCount)
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(new Error('fail'));

      // Patch batchRun to call the cb for each chat
      const utils = await import('@fastgpt/global/common/system/utils');
      vi.mocked(utils.batchRun).mockImplementation(async (items, cb) => {
        for (const item of items as typeof chats) {
          await cb(item);
        }
      });

      const result = await realModule.migrateFeedbackFlags();

      expect(result.total).toBe(2);
      expect(result.succeeded).toBe(1);
      expect(result.failed).toBe(1);
      expect(controller.updateChatFeedbackCount).toHaveBeenCalledTimes(2);
      expect(addLogErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to process chat'),
        expect.any(String)
      );
      spy.mockRestore();
    });
  });

  describe('CONCURRENCY', () => {
    it('should be 10', () => {
      expect(realModule.CONCURRENCY).toBe(10);
    });
  });
});

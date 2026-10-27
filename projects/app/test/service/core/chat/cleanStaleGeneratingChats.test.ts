import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FASTGPT_REDIS_PREFIX, getRedisRuntime } from '@fastgpt/dal/redis/runtime';
import {
  ChatGenerateStatusEnum,
  ChatRoleEnum,
  ChatSourceTypeEnum
} from '@fastgpt/global/core/chat/constants';
import { getChatGenerationLeaseKey } from '@fastgpt/dal/redis/caches/chatGenerationLease';
import { MongoChat } from '@fastgpt/service/core/chat/chatSchema';
import { MongoChatItem } from '@fastgpt/service/core/chat/chatItemSchema';
import {
  cleanStaleGeneratingChats,
  GENERATION_INTERRUPTED_ERROR,
  STALE_GENERATING_CHAT_MINUTES
} from '@fastgpt/service/core/chat/cleanStaleGeneratingChats';

vi.mock('@fastgpt/service/core/chat/chatSchema', () => ({
  MongoChat: {
    find: vi.fn(),
    updateOne: vi.fn()
  }
}));

vi.mock('@fastgpt/service/core/chat/chatItemSchema', () => ({
  MongoChatItem: {
    updateOne: vi.fn()
  }
}));

const teamId = '507f1f77bcf86cd799439011';
const appId = '507f1f77bcf86cd799439012';
const appSource = {
  sourceType: ChatSourceTypeEnum.app,
  sourceId: appId
};
const baseNow = new Date('2026-05-13T08:00:00.000Z');

const mockGeneratingChats = (chats: any[]) => {
  vi.mocked(MongoChat.find).mockReturnValue({
    lean: () => ({
      exec: () => Promise.resolve(chats)
    })
  } as any);
};

const getLeaseRedisKey = (chatId: string) =>
  `${FASTGPT_REDIS_PREFIX}${getChatGenerationLeaseKey({ ...appSource, chatId })}`;

describe('cleanStaleGeneratingChats', () => {
  beforeEach(async () => {
    vi.useFakeTimers();
    vi.setSystemTime(baseNow);
    vi.clearAllMocks();

    const redis = getRedisRuntime().getCommandConnection() as any;
    await redis.flushdb();
    redis.call = vi.fn(async () => '1-0');
    vi.mocked(MongoChat.updateOne).mockResolvedValue({ modifiedCount: 1 } as any);
    vi.mocked(MongoChatItem.updateOne).mockResolvedValue({ modifiedCount: 1 } as any);
  });

  it('keeps a chat while the Redis runner token exists', async () => {
    mockGeneratingChats([
      {
        _id: 'redis-live-chat',
        teamId,
        appId,
        chatId: 'redis-live',
        updateTime: new Date(baseNow.getTime() - 60 * 60 * 1000),
        generationRunnerId: 'run-live'
      }
    ]);
    await (getRedisRuntime().getCommandConnection() as any).set(
      getLeaseRedisKey('redis-live'),
      'run-live',
      'PX',
      90_000
    );

    await expect(cleanStaleGeneratingChats()).resolves.toEqual({
      modifiedCount: 0,
      leaseExpiredCount: 0,
      fallbackCount: 0
    });
    expect(MongoChat.updateOne).not.toHaveBeenCalled();
  });

  it('CASes an interrupted runner to error and marks the exact AI item', async () => {
    mockGeneratingChats([
      {
        _id: 'expired-chat',
        teamId,
        appId,
        chatId: 'expired',
        updateTime: new Date(baseNow.getTime() - 60 * 60 * 1000),
        generationRunnerId: 'run-expired',
        generationResponseChatItemId: 'ai-item-id'
      }
    ]);

    await expect(cleanStaleGeneratingChats()).resolves.toEqual({
      modifiedCount: 1,
      leaseExpiredCount: 1,
      fallbackCount: 0
    });
    expect(MongoChat.updateOne).toHaveBeenCalledWith(
      {
        _id: 'expired-chat',
        chatGenerateStatus: ChatGenerateStatusEnum.generating,
        generationRunnerId: 'run-expired'
      },
      {
        $set: {
          chatGenerateStatus: ChatGenerateStatusEnum.error,
          updateTime: baseNow,
          hasBeenRead: false
        },
        $unset: {
          generationRunnerId: '',
          generationResponseChatItemId: ''
        }
      }
    );
    expect(MongoChatItem.updateOne).toHaveBeenCalledWith(
      expect.objectContaining({
        appId,
        chatId: 'expired',
        dataId: 'ai-item-id',
        obj: ChatRoleEnum.AI
      }),
      {
        $set: {
          errorMsg: GENERATION_INTERRUPTED_ERROR
        }
      }
    );
    expect((getRedisRuntime().getCommandConnection() as any).call).toHaveBeenCalledWith(
      'XADD',
      expect.stringContaining(
        `stream:resume:data:${teamId}:${appSource.sourceType}:${appId}:expired:run-expired`
      ),
      '*',
      'raw',
      expect.stringContaining('event: error')
    );
  });

  it('does not overwrite a runner that wins the CAS race', async () => {
    vi.mocked(MongoChat.updateOne).mockResolvedValue({ modifiedCount: 0 } as any);
    mockGeneratingChats([
      {
        _id: 'race-chat',
        teamId,
        appId,
        chatId: 'race',
        updateTime: new Date(baseNow.getTime() - 60 * 60 * 1000),
        generationRunnerId: 'run-race',
        generationResponseChatItemId: 'race-ai'
      }
    ]);

    await expect(cleanStaleGeneratingChats()).resolves.toEqual({
      modifiedCount: 0,
      leaseExpiredCount: 0,
      fallbackCount: 0
    });
    expect(MongoChatItem.updateOne).not.toHaveBeenCalled();
  });

  it('uses the 30 minute fallback only for legacy records without a runner token', async () => {
    const staleUpdateTime = new Date(
      baseNow.getTime() - STALE_GENERATING_CHAT_MINUTES * 60 * 1000 - 1_000
    );
    mockGeneratingChats([
      {
        _id: 'legacy-chat',
        teamId,
        appId,
        chatId: 'legacy',
        updateTime: staleUpdateTime
      },
      {
        _id: 'legacy-fresh-chat',
        teamId,
        appId,
        chatId: 'legacy-fresh',
        updateTime: new Date(baseNow.getTime() - 60 * 1000)
      }
    ]);

    await expect(cleanStaleGeneratingChats()).resolves.toEqual({
      modifiedCount: 1,
      leaseExpiredCount: 0,
      fallbackCount: 1
    });
    expect(MongoChat.updateOne).toHaveBeenCalledWith(
      expect.objectContaining({
        _id: 'legacy-chat',
        generationRunnerId: { $exists: false },
        updateTime: staleUpdateTime
      }),
      expect.any(Object)
    );
  });

  it('skips cleanup when Redis cannot acquire the cleanup token', async () => {
    mockGeneratingChats([
      {
        _id: 'redis-down-chat',
        teamId,
        appId,
        chatId: 'redis-down',
        updateTime: new Date(baseNow.getTime() - 60 * 60 * 1000),
        generationRunnerId: 'run-redis-down'
      }
    ]);

    const redis = getRedisRuntime().getCommandConnection() as any;
    redis.set.mockRejectedValueOnce(new Error('redis down'));

    await expect(cleanStaleGeneratingChats()).resolves.toEqual({
      modifiedCount: 0,
      leaseExpiredCount: 0,
      fallbackCount: 0
    });
    expect(MongoChat.updateOne).not.toHaveBeenCalled();
  });
});

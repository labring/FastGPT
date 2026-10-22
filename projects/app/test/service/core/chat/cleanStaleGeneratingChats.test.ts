import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FASTGPT_REDIS_PREFIX, getRedisRuntime } from '@fastgpt/dal/redis/runtime';
import {
  ChatGenerateStatusEnum,
  ChatRoleEnum,
  ChatSourceTypeEnum
} from '@fastgpt/global/core/chat/constants';
import { getChatGenerationLeaseKey } from '@fastgpt/dal/redis/caches';
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

  it('keeps a run while its Mongo lease is still fresh', async () => {
    mockGeneratingChats([
      {
        _id: 'fresh-chat',
        teamId,
        appId,
        chatId: 'fresh',
        updateTime: new Date(baseNow.getTime() - 60 * 60 * 1000),
        generationRunId: 'run-fresh',
        generationHeartbeatAt: new Date(baseNow.getTime() - 30_000),
        generationLeaseExpiresAt: new Date(baseNow.getTime() + 60_000)
      }
    ]);

    await expect(cleanStaleGeneratingChats()).resolves.toEqual({
      modifiedCount: 0,
      leaseExpiredCount: 0,
      fallbackCount: 0
    });
    expect(MongoChat.updateOne).not.toHaveBeenCalled();
  });

  it('keeps rolling-upgrade runs created by old instances on the legacy fallback path', async () => {
    mockGeneratingChats([
      {
        _id: 'old-instance-chat',
        teamId,
        appId,
        chatId: 'old-instance',
        updateTime: new Date(baseNow.getTime() - 60_000),
        generationRunId: 'stale-old-run',
        generationHeartbeatAt: new Date(baseNow.getTime() - 60 * 60 * 1000),
        generationLeaseExpiresAt: new Date(baseNow.getTime() - 30_000)
      }
    ]);

    await expect(cleanStaleGeneratingChats()).resolves.toEqual({
      modifiedCount: 0,
      leaseExpiredCount: 0,
      fallbackCount: 0
    });
    expect(MongoChat.updateOne).not.toHaveBeenCalled();
  });

  it('corrects an old-instance run after the 30 minute fallback', async () => {
    const updateTime = new Date(
      baseNow.getTime() - STALE_GENERATING_CHAT_MINUTES * 60 * 1000 - 1_000
    );
    mockGeneratingChats([
      {
        _id: 'old-instance-expired-chat',
        teamId,
        appId,
        chatId: 'old-instance-expired',
        updateTime,
        generationRunId: 'stale-old-run',
        generationHeartbeatAt: new Date(updateTime.getTime() - 120_000),
        generationLeaseExpiresAt: new Date(updateTime.getTime() - 30_000)
      }
    ]);

    await expect(cleanStaleGeneratingChats()).resolves.toEqual({
      modifiedCount: 1,
      leaseExpiredCount: 0,
      fallbackCount: 1
    });
    expect(MongoChat.updateOne).toHaveBeenCalledWith(
      expect.objectContaining({
        _id: 'old-instance-expired-chat',
        generationRunId: 'stale-old-run',
        generationLeaseExpiresAt: new Date(updateTime.getTime() - 30_000)
      }),
      expect.any(Object)
    );
  });

  it('falls back when a run id exists but lease fields are missing', async () => {
    const updateTime = new Date(
      baseNow.getTime() - STALE_GENERATING_CHAT_MINUTES * 60 * 1000 - 1_000
    );
    mockGeneratingChats([
      {
        _id: 'missing-lease-chat',
        teamId,
        appId,
        chatId: 'missing-lease',
        updateTime,
        generationRunId: 'legacy-run-without-lease'
      }
    ]);

    await expect(cleanStaleGeneratingChats()).resolves.toEqual({
      modifiedCount: 1,
      leaseExpiredCount: 0,
      fallbackCount: 1
    });
    expect(MongoChat.updateOne).toHaveBeenCalledWith(
      expect.objectContaining({
        _id: 'missing-lease-chat',
        generationRunId: 'legacy-run-without-lease',
        generationLeaseExpiresAt: { $exists: false }
      }),
      expect.any(Object)
    );
  });

  it('cleans a new run when heartbeat is only slightly older than its prepare time', async () => {
    const updateTime = new Date(baseNow.getTime() - 10 * 60 * 1000);
    mockGeneratingChats([
      {
        _id: 'new-run-crash-chat',
        teamId,
        appId,
        chatId: 'new-run-crash',
        updateTime,
        generationRunId: 'run-crashed',
        generationHeartbeatAt: new Date(updateTime.getTime() - 5_000),
        generationLeaseExpiresAt: new Date(baseNow.getTime() - 1_000)
      }
    ]);

    await expect(cleanStaleGeneratingChats()).resolves.toEqual({
      modifiedCount: 1,
      leaseExpiredCount: 1,
      fallbackCount: 0
    });
  });

  it('keeps a run while the Redis generation lease still exists', async () => {
    mockGeneratingChats([
      {
        _id: 'redis-live-chat',
        teamId,
        appId,
        chatId: 'redis-live',
        updateTime: new Date(baseNow.getTime() - 60 * 60 * 1000),
        generationRunId: 'run-live',
        generationHeartbeatAt: new Date(baseNow.getTime() - 91_000),
        generationLeaseExpiresAt: new Date(baseNow.getTime() - 1_000)
      }
    ]);

    await (getRedisRuntime().getCommandConnection() as any).set(
      getLeaseRedisKey('redis-live'),
      'run-live',
      'PX',
      90_000
    );

    await cleanStaleGeneratingChats();
    expect(MongoChat.updateOne).not.toHaveBeenCalled();
  });

  it('CASes an expired run to error and marks the exact AI item', async () => {
    const leaseExpiresAt = new Date(baseNow.getTime() - 1_000);
    mockGeneratingChats([
      {
        _id: 'expired-chat',
        teamId,
        appId,
        chatId: 'expired',
        updateTime: new Date(baseNow.getTime() - 60 * 60 * 1000),
        generationRunId: 'run-expired',
        generationResponseChatItemId: 'ai-item-id',
        generationHeartbeatAt: new Date(baseNow.getTime() - 91_000),
        generationLeaseExpiresAt: leaseExpiresAt
      }
    ]);

    const result = await cleanStaleGeneratingChats();

    expect(result).toEqual({
      modifiedCount: 1,
      leaseExpiredCount: 1,
      fallbackCount: 0
    });
    expect(MongoChat.updateOne).toHaveBeenCalledWith(
      {
        _id: 'expired-chat',
        chatGenerateStatus: ChatGenerateStatusEnum.generating,
        generationRunId: 'run-expired',
        generationLeaseExpiresAt: leaseExpiresAt
      },
      {
        $set: {
          chatGenerateStatus: ChatGenerateStatusEnum.error,
          updateTime: baseNow,
          hasBeenRead: false
        },
        $unset: {
          generationLeaseExpiresAt: ''
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

  it('does not overwrite a run whose heartbeat wins the CAS race', async () => {
    vi.mocked(MongoChat.updateOne).mockResolvedValue({ modifiedCount: 0 } as any);
    mockGeneratingChats([
      {
        _id: 'race-chat',
        teamId,
        appId,
        chatId: 'race',
        updateTime: new Date(baseNow.getTime() - 60 * 60 * 1000),
        generationRunId: 'run-race',
        generationResponseChatItemId: 'race-ai',
        generationHeartbeatAt: new Date(baseNow.getTime() - 91_000),
        generationLeaseExpiresAt: new Date(baseNow.getTime() - 1_000)
      }
    ]);

    await expect(cleanStaleGeneratingChats()).resolves.toEqual({
      modifiedCount: 0,
      leaseExpiredCount: 0,
      fallbackCount: 0
    });
    expect(MongoChatItem.updateOne).not.toHaveBeenCalled();
  });

  it('uses the 30 minute fallback only for legacy records without run id', async () => {
    mockGeneratingChats([
      {
        _id: 'legacy-chat',
        teamId,
        appId,
        chatId: 'legacy',
        updateTime: new Date(baseNow.getTime() - STALE_GENERATING_CHAT_MINUTES * 60 * 1000 - 1_000)
      },
      {
        _id: 'legacy-fresh-chat',
        teamId,
        appId,
        chatId: 'legacy-fresh',
        updateTime: new Date(baseNow.getTime() - 60 * 1000)
      }
    ]);

    const result = await cleanStaleGeneratingChats();

    expect(result).toEqual({
      modifiedCount: 1,
      leaseExpiredCount: 0,
      fallbackCount: 1
    });
    expect(MongoChat.updateOne).toHaveBeenCalledWith(
      expect.objectContaining({
        _id: 'legacy-chat',
        generationRunId: { $exists: false },
        updateTime: new Date(baseNow.getTime() - STALE_GENERATING_CHAT_MINUTES * 60 * 1000 - 1_000)
      }),
      expect.any(Object)
    );
  });

  it('skips quick cleanup when Redis lease lookup fails', async () => {
    mockGeneratingChats([
      {
        _id: 'redis-down-chat',
        teamId,
        appId,
        chatId: 'redis-down',
        updateTime: new Date(baseNow.getTime() - 60 * 60 * 1000),
        generationRunId: 'run-redis-down',
        generationHeartbeatAt: new Date(baseNow.getTime() - 91_000),
        generationLeaseExpiresAt: new Date(baseNow.getTime() - 1_000)
      }
    ]);

    const redis = getRedisRuntime().getCommandConnection() as any;
    redis.get.mockRejectedValueOnce(new Error('redis down'));

    await expect(cleanStaleGeneratingChats()).resolves.toEqual({
      modifiedCount: 0,
      leaseExpiredCount: 0,
      fallbackCount: 0
    });
    expect(MongoChat.updateOne).not.toHaveBeenCalled();
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ChatGenerateStatusEnum } from '@fastgpt/global/core/chat/constants';
import { MongoChat } from '@fastgpt/service/core/chat/chatSchema';
import {
  cleanStaleGeneratingChats,
  STALE_GENERATING_CHAT_MINUTES
} from '@fastgpt/service/core/chat/cleanStaleGeneratingChats';
import {
  getStreamResumeRedisKeys,
  STREAM_RESUME_INACTIVE_MS
} from '@fastgpt/service/core/chat/resume';
import { getGlobalRedisConnection } from '@fastgpt/service/common/redis';

vi.mock('@fastgpt/service/core/chat/chatSchema', () => ({
  MongoChat: {
    find: vi.fn(),
    updateOne: vi.fn()
  }
}));

const teamId = '507f1f77bcf86cd799439011';
const appId = '507f1f77bcf86cd799439012';
const baseNow = new Date('2026-05-13T08:00:00.000Z');

const mockGeneratingChats = (chats: any[]) => {
  vi.mocked(MongoChat.find).mockReturnValue({
    lean: () => ({
      exec: () => Promise.resolve(chats)
    })
  } as any);
};

describe('cleanStaleGeneratingChats', () => {
  beforeEach(async () => {
    vi.useFakeTimers();
    vi.setSystemTime(baseNow);
    vi.clearAllMocks();

    const redis = getGlobalRedisConnection() as any;
    await redis.flushdb();
    redis.get.mockClear?.();
    vi.mocked(MongoChat.updateOne).mockResolvedValue({ modifiedCount: 1 } as any);
  });

  it('should correct generating chats when stream resume activity is stale or missing', async () => {
    const activeChat = {
      _id: 'active-chat',
      teamId,
      appId,
      chatId: 'active',
      updateTime: new Date(baseNow.getTime() - STREAM_RESUME_INACTIVE_MS - 1000)
    };
    const staleChat = {
      _id: 'stale-chat',
      teamId,
      appId,
      chatId: 'stale',
      updateTime: new Date(baseNow.getTime() - STREAM_RESUME_INACTIVE_MS - 1000)
    };
    const missingChat = {
      _id: 'missing-chat',
      teamId,
      appId,
      chatId: 'missing',
      updateTime: new Date(baseNow.getTime() - STREAM_RESUME_INACTIVE_MS - 1000)
    };
    mockGeneratingChats([activeChat, staleChat, missingChat]);

    const redis = getGlobalRedisConnection() as any;
    await redis.set(
      getStreamResumeRedisKeys({ teamId, appId, chatId: activeChat.chatId }).keyOfActive,
      JSON.stringify({ updatedAt: baseNow.getTime() - STREAM_RESUME_INACTIVE_MS + 1000 }),
      'EX',
      1800
    );
    await redis.set(
      getStreamResumeRedisKeys({ teamId, appId, chatId: staleChat.chatId }).keyOfActive,
      JSON.stringify({ updatedAt: baseNow.getTime() - STREAM_RESUME_INACTIVE_MS - 1000 }),
      'EX',
      1800
    );

    const result = await cleanStaleGeneratingChats();

    expect(MongoChat.find).toHaveBeenCalledWith(
      {
        chatGenerateStatus: ChatGenerateStatusEnum.generating,
        updateTime: { $lt: new Date(baseNow.getTime() - STREAM_RESUME_INACTIVE_MS) }
      },
      {
        _id: 1,
        teamId: 1,
        appId: 1,
        chatId: 1,
        updateTime: 1
      }
    );
    expect(MongoChat.updateOne).toHaveBeenCalledTimes(2);
    expect(MongoChat.updateOne).toHaveBeenCalledWith(
      {
        _id: staleChat._id,
        chatGenerateStatus: ChatGenerateStatusEnum.generating
      },
      {
        $set: {
          chatGenerateStatus: ChatGenerateStatusEnum.done,
          updateTime: baseNow,
          hasBeenRead: false
        }
      }
    );
    expect(MongoChat.updateOne).toHaveBeenCalledWith(
      {
        _id: missingChat._id,
        chatGenerateStatus: ChatGenerateStatusEnum.generating
      },
      {
        $set: {
          chatGenerateStatus: ChatGenerateStatusEnum.done,
          updateTime: baseNow,
          hasBeenRead: false
        }
      }
    );
    expect(result).toEqual({
      modifiedCount: 2,
      inactiveCount: 2,
      fallbackCount: 0
    });
  });

  it('should keep the 30 minute fallback when redis activity lookup fails', async () => {
    const inactiveOnlyChat = {
      _id: 'inactive-only-chat',
      teamId,
      appId,
      chatId: 'inactive-only',
      updateTime: new Date(baseNow.getTime() - STREAM_RESUME_INACTIVE_MS - 1000)
    };
    const fallbackChat = {
      _id: 'fallback-chat',
      teamId,
      appId,
      chatId: 'fallback',
      updateTime: new Date(baseNow.getTime() - STALE_GENERATING_CHAT_MINUTES * 60 * 1000 - 1000)
    };
    mockGeneratingChats([inactiveOnlyChat, fallbackChat]);

    const redis = getGlobalRedisConnection() as any;
    redis.get.mockRejectedValueOnce(new Error('redis down'));

    const result = await cleanStaleGeneratingChats();

    expect(MongoChat.updateOne).toHaveBeenCalledTimes(1);
    expect(MongoChat.updateOne).toHaveBeenCalledWith(
      {
        _id: fallbackChat._id,
        chatGenerateStatus: ChatGenerateStatusEnum.generating
      },
      {
        $set: {
          chatGenerateStatus: ChatGenerateStatusEnum.done,
          updateTime: baseNow,
          hasBeenRead: false
        }
      }
    );
    expect(result).toEqual({
      modifiedCount: 1,
      inactiveCount: 0,
      fallbackCount: 1
    });
  });
});

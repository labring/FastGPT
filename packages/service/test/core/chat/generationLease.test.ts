import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FASTGPT_REDIS_PREFIX, getRedisRuntime } from '@fastgpt/dal/redis/runtime';
import { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import { getChatGenerationLeaseKey } from '@fastgpt/dal/redis/caches';
import { MongoChat } from '@fastgpt/service/core/chat/chatSchema';
import {
  CHAT_GENERATION_LEASE_RENEW_INTERVAL_MS,
  getActiveChatGenerationLease,
  getChatGenerationLeaseToken,
  startChatGenerationLease,
  stopChatGenerationLease
} from '@fastgpt/service/core/chat/generationLease';

vi.mock('@fastgpt/service/core/chat/chatSchema', () => ({
  MongoChat: {
    updateOne: vi.fn()
  }
}));

const params = {
  sourceType: ChatSourceTypeEnum.app,
  sourceId: '507f1f77bcf86cd799439012',
  chatId: 'generation-lease-chat'
};

describe('chat generation lease', () => {
  beforeEach(async () => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    vi.mocked(MongoChat.updateOne).mockResolvedValue({ matchedCount: 1 } as any);
    await (getRedisRuntime().getCommandConnection() as any).flushdb();
  });

  afterEach(async () => {
    await stopChatGenerationLease({ ...params, generationRunId: 'run-1' });
    await stopChatGenerationLease({ ...params, generationRunId: 'run-2' });
    vi.useRealTimers();
  });

  it('renews Redis and Mongo heartbeat independently from HTTP response', async () => {
    const lease = await startChatGenerationLease({ ...params, generationRunId: 'run-1' });

    await expect(getChatGenerationLeaseToken(params)).resolves.toBe('run-1');

    await vi.advanceTimersByTimeAsync(CHAT_GENERATION_LEASE_RENEW_INTERVAL_MS);

    expect(MongoChat.updateOne).toHaveBeenCalledWith(
      expect.objectContaining({
        chatId: params.chatId,
        generationRunId: 'run-1'
      }),
      {
        $set: {
          generationHeartbeatAt: expect.any(Date),
          generationLeaseExpiresAt: expect.any(Date)
        }
      }
    );
    expect(getActiveChatGenerationLease(params)?.signal.aborted).toBe(false);
    lease.assertValid();
  });

  it('releases the Redis token when the owning run stops', async () => {
    await startChatGenerationLease({ ...params, generationRunId: 'run-1' });
    await stopChatGenerationLease({ ...params, generationRunId: 'run-1' });

    await expect(getChatGenerationLeaseToken(params)).resolves.toBeNull();
    expect(getActiveChatGenerationLease(params)).toBeUndefined();
  });

  it('marks the lease lost when Mongo ownership no longer matches', async () => {
    vi.mocked(MongoChat.updateOne).mockResolvedValue({ matchedCount: 0 } as any);
    const lease = await startChatGenerationLease({ ...params, generationRunId: 'run-1' });

    await vi.advanceTimersByTimeAsync(CHAT_GENERATION_LEASE_RENEW_INTERVAL_MS);

    expect(lease.signal.aborted).toBe(true);
    expect(() => lease.assertValid()).toThrow('Chat generation lease was lost');
  });

  it('recreates a missing Redis token while Mongo ownership is still valid', async () => {
    const lease = await startChatGenerationLease({ ...params, generationRunId: 'run-1' });
    await (getRedisRuntime().getCommandConnection() as any).del(
      `${FASTGPT_REDIS_PREFIX}${getChatGenerationLeaseKey(params)}`
    );

    await vi.advanceTimersByTimeAsync(CHAT_GENERATION_LEASE_RENEW_INTERVAL_MS);

    await expect(getChatGenerationLeaseToken(params)).resolves.toBe('run-1');
    expect(lease.signal.aborted).toBe(false);
  });

  it('does not let an old run release the new run token', async () => {
    const oldLease = await startChatGenerationLease({ ...params, generationRunId: 'run-1' });
    await startChatGenerationLease({ ...params, generationRunId: 'run-2' });

    expect(oldLease.signal.aborted).toBe(true);
    expect(getActiveChatGenerationLease(params, 'run-1')).toBeUndefined();
    expect(getActiveChatGenerationLease(params, 'run-2')?.generationRunId).toBe('run-2');
    await stopChatGenerationLease({ ...params, generationRunId: 'run-1' });

    await expect(getChatGenerationLeaseToken(params)).resolves.toBe('run-2');
    await stopChatGenerationLease({ ...params, generationRunId: 'run-2' });
    await expect(getChatGenerationLeaseToken(params)).resolves.toBeNull();
  });
});

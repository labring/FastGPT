import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FASTGPT_REDIS_PREFIX, getRedisRuntime } from '@fastgpt/dal/redis/runtime';
import { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import { getChatGenerationLeaseKey } from '@fastgpt/dal/redis/caches/chatGenerationLease';
import {
  CHAT_GENERATION_LEASE_RENEW_INTERVAL_MS,
  getActiveChatGenerationLease,
  getChatGenerationLeaseToken,
  stopChatGenerationLease,
  tryStartChatGenerationLease
} from '@fastgpt/service/core/chat/generationLease';
import { getStreamResumeRedisKeys } from '@fastgpt/service/core/chat/resume';

const params = {
  sourceType: ChatSourceTypeEnum.app,
  sourceId: '507f1f77bcf86cd799439012',
  chatId: 'generation-lease-chat'
};

describe('chat generation runner lease', () => {
  beforeEach(async () => {
    vi.useFakeTimers();
    await (getRedisRuntime().getCommandConnection() as any).flushdb();
  });

  afterEach(async () => {
    await stopChatGenerationLease({ ...params, generationRunnerId: 'run-1' });
    await stopChatGenerationLease({ ...params, generationRunnerId: 'run-2' });
    vi.useRealTimers();
  });

  it('renews the Redis runner token independently from HTTP response', async () => {
    const lease = await tryStartChatGenerationLease({
      ...params,
      generationRunnerId: 'run-1'
    });

    expect(lease).toBeDefined();
    await expect(getChatGenerationLeaseToken(params)).resolves.toBe('run-1');

    await vi.advanceTimersByTimeAsync(CHAT_GENERATION_LEASE_RENEW_INTERVAL_MS);

    await expect(getChatGenerationLeaseToken(params)).resolves.toBe('run-1');
    expect(lease?.signal.aborted).toBe(false);
    lease?.assertValid();
  });

  it('refreshes the legacy active key while the runner is alive', async () => {
    const runnerParams = { ...params, teamId: 'team-1' };
    await tryStartChatGenerationLease({
      ...runnerParams,
      generationRunnerId: 'run-1'
    });
    const redis = getRedisRuntime().getCommandConnection() as any;
    const legacyActiveKey = `${FASTGPT_REDIS_PREFIX}${
      getStreamResumeRedisKeys(runnerParams).keyOfLegacyActive
    }`;

    await expect(redis.get(legacyActiveKey)).resolves.toContain('updatedAt');

    await vi.advanceTimersByTimeAsync(CHAT_GENERATION_LEASE_RENEW_INTERVAL_MS);
    await expect(redis.get(legacyActiveKey)).resolves.toContain('updatedAt');
  });

  it('rejects a second runner without disturbing the active runner', async () => {
    const firstLease = await tryStartChatGenerationLease({
      ...params,
      generationRunnerId: 'run-1'
    });
    const secondLease = await tryStartChatGenerationLease({
      ...params,
      generationRunnerId: 'run-2'
    });

    expect(secondLease).toBeUndefined();
    expect(firstLease?.signal.aborted).toBe(false);
    expect(getActiveChatGenerationLease(params, 'run-1')).toBe(firstLease);
    await expect(getChatGenerationLeaseToken(params)).resolves.toBe('run-1');
  });

  it('marks the runner lost when the Redis token disappears', async () => {
    const lease = await tryStartChatGenerationLease({
      ...params,
      generationRunnerId: 'run-1'
    });
    await (getRedisRuntime().getCommandConnection() as any).del(
      `${FASTGPT_REDIS_PREFIX}${getChatGenerationLeaseKey(params)}`
    );

    await vi.advanceTimersByTimeAsync(CHAT_GENERATION_LEASE_RENEW_INTERVAL_MS);

    expect(lease?.signal.aborted).toBe(true);
    expect(() => lease?.assertValid()).toThrow('Chat generation runner lease was lost');
  });

  it('releases the Redis token when the owning runner stops', async () => {
    await tryStartChatGenerationLease({ ...params, generationRunnerId: 'run-1' });
    await stopChatGenerationLease({ ...params, generationRunnerId: 'run-1' });

    await expect(getChatGenerationLeaseToken(params)).resolves.toBeNull();
    expect(getActiveChatGenerationLease(params)).toBeUndefined();
  });

  it('does not let an old runner release the new runner token', async () => {
    await tryStartChatGenerationLease({ ...params, generationRunnerId: 'run-1' });
    await stopChatGenerationLease({ ...params, generationRunnerId: 'run-1' });
    await tryStartChatGenerationLease({ ...params, generationRunnerId: 'run-2' });
    await stopChatGenerationLease({ ...params, generationRunnerId: 'run-1' });

    await expect(getChatGenerationLeaseToken(params)).resolves.toBe('run-2');
  });
});

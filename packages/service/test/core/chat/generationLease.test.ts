import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FASTGPT_REDIS_PREFIX, getRedisRuntime } from '@fastgpt/dal/redis/runtime';
import { ChatSourceTypeEnum, ChatGenerateStatusEnum } from '@fastgpt/global/core/chat/constants';
import {
  ChatGenerationLeaseCache,
  getChatGenerationLeaseKey
} from '@fastgpt/dal/redis/lease/chat/chatGenerationLease';
import {
  CHAT_GENERATION_LEASE_RENEW_INTERVAL_MS,
  CHAT_GENERATION_LEASE_TTL_MS,
  tryStartChatGenerationLease,
  getChatGenerationStatuses
} from '@fastgpt/service/core/chat/generationLease';
import {
  createChatStopController,
  setAgentRuntimeStop,
  shouldWorkflowStop
} from '@fastgpt/service/core/chat/stop';
import { ChatGeneratingConflictError } from '@fastgpt/global/core/chat/error';

const params = { sourceType: ChatSourceTypeEnum.app, sourceId: 'app-1', chatId: 'chat-1' };
const key = `${FASTGPT_REDIS_PREFIX}${getChatGenerationLeaseKey(params)}`;
const releases: (() => Promise<void>)[] = [];

/** 测例拥有取得的租约，统一收尾，避免续租定时器跨用例运行。 */
const startLease = async (input: Parameters<typeof tryStartChatGenerationLease>[0] = params) => {
  const release = await tryStartChatGenerationLease(input);
  if (release) releases.push(release);
  return release;
};

describe('chat generation lease', () => {
  beforeEach(async () => {
    vi.useFakeTimers();
    await (getRedisRuntime().getCommandConnection() as any).flushdb();
  });
  afterEach(async () => {
    vi.restoreAllMocks();
    for (const release of releases.splice(0)) await release();
    vi.useRealTimers();
  });

  it('keeps a long generation alive without any stream activity', async () => {
    await startLease();
    const redis = getRedisRuntime().getCommandConnection() as any;
    const token = await redis.get(key);
    expect(token).toBeTruthy();
    expect(await redis.ttl(key)).toBe(60);
    const renew = vi.spyOn(ChatGenerationLeaseCache.prototype, 'renew');
    await vi.advanceTimersByTimeAsync(9999);
    expect(renew).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(renew).toHaveBeenCalledOnce();
    expect(await redis.ttl(key)).toBe(60);
    await vi.advanceTimersByTimeAsync(CHAT_GENERATION_LEASE_TTL_MS * 2);
    expect(await redis.get(key)).toBe(token);
  });

  it('rejects the same chat while allowing a different source', async () => {
    await startLease();
    expect(await startLease()).toBeUndefined();
    expect(await startLease({ ...params, sourceId: 'app-2' })).toBeTypeOf('function');
    expect(await startLease({ ...params, sourceType: ChatSourceTypeEnum.skillEdit })).toBeTypeOf(
      'function'
    );
  });

  it('returns the actual occupied AI message ID, including interactive reuse with a different owner token', async () => {
    const release = await startLease({ ...params, responseChatItemId: 'active-A' });
    const redis = getRedisRuntime().getCommandConnection() as any;
    const firstToken = await redis.get(key);
    await expect(startLease({ ...params, responseChatItemId: 'rejected-B' })).rejects.toMatchObject(
      {
        message: 'chatIsGenerating',
        data: { responseChatItemId: 'active-A' }
      }
    );
    await release?.();
    await startLease({ ...params, responseChatItemId: 'active-A' });
    const nextToken = await redis.get(key);
    expect(nextToken).not.toBe(firstToken);
    await release?.();
    expect(await redis.get(key)).toBe(nextToken);
    await expect(startLease({ ...params, responseChatItemId: 'active-A' })).rejects.toBeInstanceOf(
      ChatGeneratingConflictError
    );
  });

  it('resets an old stop only when acquiring a new lease, preserving the active run stop on contention', async () => {
    await setAgentRuntimeStop(params);
    await startLease();
    expect(await shouldWorkflowStop(params)).toBe(false);

    await setAgentRuntimeStop(params);
    expect(await startLease()).toBeUndefined();
    expect(await shouldWorkflowStop(params)).toBe(true);
  });

  it('releases idempotently and stops renewal when the request ends', async () => {
    const release = await startLease();
    const renew = vi.spyOn(ChatGenerationLeaseCache.prototype, 'renew');
    await release?.();
    await release?.();
    await vi.advanceTimersByTimeAsync(CHAT_GENERATION_LEASE_TTL_MS * 2);
    expect(renew).not.toHaveBeenCalled();
    expect(await (getRedisRuntime().getCommandConnection() as any).get(key)).toBeNull();
    expect(await startLease()).toBeTypeOf('function');
  });

  it('does not release a replacement lease after the original expires', async () => {
    const release = await startLease();
    const redis = getRedisRuntime().getCommandConnection() as any;
    await redis.set(key, 'replacement', 'PX', CHAT_GENERATION_LEASE_TTL_MS);
    await vi.advanceTimersByTimeAsync(CHAT_GENERATION_LEASE_RENEW_INTERVAL_MS);
    await release?.();
    expect(await redis.get(key)).toBe('replacement');
    expect(await startLease()).toBeUndefined();
    await redis.del(key);
    expect(await startLease()).toBeTypeOf('function');
  });

  it('retries a transient renewal failure on the next heartbeat', async () => {
    await startLease();
    const renew = vi
      .spyOn(ChatGenerationLeaseCache.prototype, 'renew')
      .mockRejectedValueOnce(new Error('temporary Redis outage'));
    await vi.advanceTimersByTimeAsync(CHAT_GENERATION_LEASE_RENEW_INTERVAL_MS * 2);
    expect(renew).toHaveBeenCalledTimes(2);
  });

  it('does not override a completed request when release fails', async () => {
    const release = await startLease();
    vi.spyOn(ChatGenerationLeaseCache.prototype, 'release').mockRejectedValueOnce(
      new Error('redis down')
    );
    await expect(release?.()).resolves.toBeUndefined();
  });

  it('allows generation without renewal or release when acquiring the lease fails', async () => {
    vi.spyOn(ChatGenerationLeaseCache.prototype, 'tryAcquire').mockRejectedValueOnce(
      new Error('Redis unavailable')
    );
    const renew = vi.spyOn(ChatGenerationLeaseCache.prototype, 'renew');
    const releaseLease = vi.spyOn(ChatGenerationLeaseCache.prototype, 'release');
    const release = await startLease();
    expect(release).toBeTypeOf('function');
    await vi.advanceTimersByTimeAsync(CHAT_GENERATION_LEASE_TTL_MS * 2);
    await expect(release?.()).resolves.toBeUndefined();
    await expect(release?.()).resolves.toBeUndefined();
    expect(renew).not.toHaveBeenCalled();
    expect(releaseLease).not.toHaveBeenCalled();
  });

  it.each([1, 0])(
    'allows generation at the default 3-second deadline and ignores a late %j response',
    async (lateResponse) => {
      const pending = Promise.withResolvers<[number, null]>();
      const redis = getRedisRuntime().getCommandConnection() as any;
      const evalScript = vi.spyOn(redis, 'eval').mockClear().mockReturnValueOnce(pending.promise);
      const renew = vi.spyOn(ChatGenerationLeaseCache.prototype, 'renew');
      const releaseLease = vi.spyOn(ChatGenerationLeaseCache.prototype, 'release');
      let settled = false;
      const generation = startLease().then((release) => {
        settled = true;
        return release;
      });

      await vi.advanceTimersByTimeAsync(2999);
      expect(settled).toBe(false);
      await vi.advanceTimersByTimeAsync(1);
      expect(settled).toBe(true);
      const release = await generation;
      expect(release).toBeTypeOf('function');

      pending.resolve([lateResponse, null]);
      await vi.advanceTimersByTimeAsync(CHAT_GENERATION_LEASE_RENEW_INTERVAL_MS * 2);
      await expect(release?.()).resolves.toBeUndefined();
      expect(evalScript).toHaveBeenCalledOnce();
      expect(renew).not.toHaveBeenCalled();
      expect(releaseLease).not.toHaveBeenCalled();
    }
  );

  it('rejects an occupied response received just before the acquisition deadline', async () => {
    const pending = Promise.withResolvers<[number, null]>();
    const redis = getRedisRuntime().getCommandConnection() as any;
    vi.spyOn(redis, 'eval').mockReturnValueOnce(pending.promise);
    const generation = startLease();
    await vi.advanceTimersByTimeAsync(2999);
    pending.resolve([0, null]);
    await expect(generation).resolves.toBeUndefined();
    await vi.advanceTimersByTimeAsync(1);
  });

  it('allows only one renewal in flight while Redis is slow', async () => {
    await startLease();
    const pending = Promise.withResolvers<boolean>();
    const renew = vi
      .spyOn(ChatGenerationLeaseCache.prototype, 'renew')
      .mockReturnValueOnce(pending.promise);
    vi.advanceTimersByTime(CHAT_GENERATION_LEASE_RENEW_INTERVAL_MS * 2);
    expect(renew).toHaveBeenCalledOnce();
    pending.resolve(true);
    await Promise.resolve();
  });

  it('preserves a new stop when a timed-out acquisition actually executes after fail-open', async () => {
    const redis = getRedisRuntime().getCommandConnection() as any;
    const execute = redis.eval.getMockImplementation();
    const pending = Promise.withResolvers<unknown>();
    let queued: any[] = [];
    const evalScript = vi
      .spyOn(redis, 'eval')
      .mockClear()
      .mockImplementationOnce((...args: any[]) => {
        queued = args;
        return pending.promise;
      });
    const generation = startLease();
    await vi.advanceTimersByTimeAsync(3000);
    const release = await generation;
    expect(release).toBeTypeOf('function');

    await setAgentRuntimeStop(params);
    // 实际执行迟到脚本的 Redis 副作用，而非仅返回一个成功响应。
    pending.resolve(await execute(...queued));
    await pending.promise;
    await vi.advanceTimersByTimeAsync(0);
    expect(await redis.get(key)).toBeTruthy();
    expect(evalScript).toHaveBeenCalledOnce();

    const controller = await createChatStopController(params);
    try {
      expect(controller.checkIsStopping()).toBe(true);
    } finally {
      await controller.cleanup();
    }
  });

  it('preserves a replacement stop when confirmed-acquisition cleanup times out and executes late', async () => {
    await setAgentRuntimeStop(params);
    const redis = getRedisRuntime().getCommandConnection() as any;
    const execute = redis.eval.getMockImplementation();
    const pending = Promise.withResolvers<unknown>();
    let queued: any[] = [];
    vi.spyOn(redis, 'eval')
      .mockImplementationOnce((...args: any[]) => execute(...args))
      .mockImplementationOnce((...args: any[]) => {
        queued = args;
        return pending.promise;
      });
    const generation = startLease();
    await vi.advanceTimersByTimeAsync(0);
    await setAgentRuntimeStop(params);
    await vi.advanceTimersByTimeAsync(3000);
    const release = await generation;
    expect(release).toBeTypeOf('function');

    pending.resolve(await execute(...queued));
    await pending.promise;
    expect(await shouldWorkflowStop(params)).toBe(true);
    await release?.();
  });

  it('batch reads deduplicated chat IDs and isolates different resources', async () => {
    const release = await startLease();
    const redis = getRedisRuntime().getCommandConnection() as any;
    redis.mget.mockClear();
    const statuses = await getChatGenerationStatuses({
      ...params,
      chatIds: ['chat-1', 'idle', 'chat-1']
    });
    expect([...statuses]).toEqual([
      ['chat-1', ChatGenerateStatusEnum.generating],
      ['idle', ChatGenerateStatusEnum.done]
    ]);
    expect(redis.mget).toHaveBeenCalledOnce();
    expect(
      (await getChatGenerationStatuses({ ...params, sourceId: 'other', chatIds: ['chat-1'] })).get(
        'chat-1'
      )
    ).toBe(ChatGenerateStatusEnum.done);
    await release?.();
    expect(
      (await getChatGenerationStatuses({ ...params, chatIds: ['chat-1'] })).get('chat-1')
    ).toBe(ChatGenerateStatusEnum.done);
  });

  it('returns an empty status map without a Redis request', async () => {
    const redis = getRedisRuntime().getCommandConnection() as any;
    redis.mget.mockClear();
    expect((await getChatGenerationStatuses({ ...params, chatIds: [] })).size).toBe(0);
    expect(redis.mget).not.toHaveBeenCalled();
  });

  it('reports expired or unreadable leases as idle and recovers on the next read', async () => {
    const redis = getRedisRuntime().getCommandConnection() as any;
    await redis.set(key, 'abandoned', 'PX', 100);
    await vi.advanceTimersByTimeAsync(101);
    expect(
      (await getChatGenerationStatuses({ ...params, chatIds: ['chat-1'] })).get('chat-1')
    ).toBe(ChatGenerateStatusEnum.done);
    await startLease();
    vi.spyOn(ChatGenerationLeaseCache.prototype, 'getTokens').mockRejectedValueOnce(
      new Error('Redis unavailable')
    );
    const statuses = await getChatGenerationStatuses({
      ...params,
      chatIds: ['chat-1', 'idle', 'chat-1']
    });
    expect([...statuses]).toEqual([
      ['chat-1', ChatGenerateStatusEnum.done],
      ['idle', ChatGenerateStatusEnum.done]
    ]);
    expect(
      (await getChatGenerationStatuses({ ...params, chatIds: ['chat-1'] })).get('chat-1')
    ).toBe(ChatGenerateStatusEnum.generating);
  });

  it('treats an empty lease value as idle', async () => {
    await (getRedisRuntime().getCommandConnection() as any).set(key, '');
    expect(
      (await getChatGenerationStatuses({ ...params, chatIds: ['chat-1'] })).get('chat-1')
    ).toBe(ChatGenerateStatusEnum.done);
  });

  it('propagates lease read errors when fallback is disabled and recovers on the next read', async () => {
    await startLease();
    const error = new Error('Redis unavailable');
    vi.spyOn(ChatGenerationLeaseCache.prototype, 'getTokens').mockRejectedValueOnce(error);
    await expect(
      getChatGenerationStatuses({ ...params, chatIds: ['chat-1'], fallbackOnError: false })
    ).rejects.toBe(error);
    expect(
      (
        await getChatGenerationStatuses({ ...params, chatIds: ['chat-1'], fallbackOnError: false })
      ).get('chat-1')
    ).toBe(ChatGenerateStatusEnum.generating);
  });

  it('propagates Redis read timeouts after DAL retries when fallback is disabled', async () => {
    const redis = getRedisRuntime().getCommandConnection() as any;
    const pending = Promise.withResolvers<(string | null)[]>();
    vi.spyOn(redis, 'mget')
      .mockReturnValueOnce(pending.promise)
      .mockReturnValueOnce(pending.promise);
    const read = getChatGenerationStatuses({
      ...params,
      chatIds: ['chat-1'],
      fallbackOnError: false
    });
    const rejection = expect(read).rejects.toMatchObject({
      code: 'REDIS_OPERATION_TIMEOUT',
      attempt: 2
    });
    await vi.advanceTimersByTimeAsync(6000);
    await rejection;
    pending.resolve([null]);
    await pending.promise;
  });

  it('uses the same lease for equivalent Mongo source ID casing', async () => {
    await startLease({ ...params, sourceId: '507F1F77BCF86CD799439012' });
    const statuses = await getChatGenerationStatuses({
      ...params,
      sourceId: '507f1f77bcf86cd799439012',
      chatIds: [params.chatId]
    });
    expect(statuses.get(params.chatId)).toBe(ChatGenerateStatusEnum.generating);
  });
});

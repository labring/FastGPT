import handler from '@/pages/api/core/chat/history/getHistoryStatus';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import {
  ChatGenerateStatusEnum,
  ChatSourceEnum,
  ChatSourceTypeEnum
} from '@fastgpt/global/core/chat/constants';
import type {
  GetHistoryStatusBodyType,
  GetHistoryStatusResponseType
} from '@fastgpt/global/openapi/core/chat/history/api';
import {
  ChatGenerationLeaseCache,
  getChatGenerationLeaseKey
} from '@fastgpt/dal/redis/lease/chat/chatGenerationLease';
import { FASTGPT_REDIS_PREFIX, getRedisRuntime } from '@fastgpt/dal/redis/runtime';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { MongoChat } from '@fastgpt/service/core/chat/chatSchema';
import { getUser } from '@test/datas/users';
import { Call } from '@test/utils/request';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('getHistoryStatus lease polling', () => {
  let user: Awaited<ReturnType<typeof getUser>>;
  let appId: string;
  const cache = new ChatGenerationLeaseCache();
  const chatIds = ['busy-chat', 'idle-chat', 'other-member-chat'];
  const params = () => ({
    sourceType: ChatSourceTypeEnum.app,
    sourceId: appId,
    chatId: chatIds[0]
  });
  const poll = () =>
    Call<GetHistoryStatusBodyType, any, GetHistoryStatusResponseType>(handler, {
      auth: user,
      body: { appId, chatIds }
    });

  beforeEach(async () => {
    user = await getUser('lease-polling-member');
    const app = await MongoApp.create({
      name: 'Polling App',
      type: AppTypeEnum.simple,
      teamId: user.teamId,
      tmbId: user.tmbId
    });
    appId = String(app._id);
    const other = await getUser('lease-polling-other', user.teamId);
    await MongoChat.create(
      chatIds.map((chatId, index) => ({
        teamId: user.teamId,
        tmbId: index === 2 ? other.tmbId : user.tmbId,
        sourceType: ChatSourceTypeEnum.app,
        appId,
        chatId,
        source: ChatSourceEnum.online
      }))
    );
    await cache.tryAcquire({ params: params(), token: 'polling-request', ttlMs: 90_000 });
  });
  afterEach(async () => {
    vi.restoreAllMocks();
    await cache.release({ params: params(), token: 'polling-request' });
  });

  it('batch reads only authorized chats and becomes idle on the next poll after release', async () => {
    const redis = getRedisRuntime().getCommandConnection() as any;
    redis.mget.mockClear();
    const active = await poll();
    expect(active.code).toBe(200);
    expect(active.data.list).toHaveLength(2);
    expect(active.data.list.find((chat) => chat.chatId === chatIds[0])?.chatGenerateStatus).toBe(
      ChatGenerateStatusEnum.generating
    );
    expect(active.data.list.find((chat) => chat.chatId === chatIds[1])?.chatGenerateStatus).toBe(
      ChatGenerateStatusEnum.done
    );
    expect(redis.mget).toHaveBeenCalledOnce();
    expect(redis.mget.mock.calls[0]).not.toContain(
      `${FASTGPT_REDIS_PREFIX}${getChatGenerationLeaseKey({ ...params(), chatId: chatIds[2] })}`
    );

    await cache.release({ params: params(), token: 'polling-request' });
    const idle = await poll();
    expect(idle.code).toBe(200);
    expect(
      idle.data.list.every((chat) => chat.chatGenerateStatus === ChatGenerateStatusEnum.done)
    ).toBe(true);
  });

  it('returns an error without an idle snapshot when reading leases fails and recovers on retry', async () => {
    vi.spyOn(ChatGenerationLeaseCache.prototype, 'getTokens').mockRejectedValueOnce(
      new Error('Redis unavailable')
    );
    const res = await poll();
    expect(res.code).toBe(500);
    expect(res.error).toBeDefined();
    expect(res.data).toBeUndefined();

    const recovered = await poll();
    expect(recovered.code).toBe(200);
    expect(recovered.data.list.find((chat) => chat.chatId === chatIds[0])?.chatGenerateStatus).toBe(
      ChatGenerateStatusEnum.generating
    );
  });
});

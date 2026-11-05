import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { MongoChat } from '@fastgpt/service/core/chat/chatSchema';
import { MongoOpenApi } from '@fastgpt/service/support/openapi/schema';
import { ChatSourceTypeEnum, ChatSourceEnum } from '@fastgpt/global/core/chat/constants';
import { getFakeUsers } from '@test/datas/users';
import { Call } from '@test/utils/request';
import getHistories from '@/pages/api/core/chat/history/getHistories';
import updateHistory from '@/pages/api/core/chat/history/updateHistory';
import clearHistories from '@/pages/api/core/chat/history/clearHistories';
import listLogs from '@/pages/api/core/app/logs/list';
import { authChatCompletionHeaderRequest } from '@/service/support/permission/auth/chatCompletion';

// 此文件保留真实凭证、应用及会话鉴权和 Mongo 查询，只隔离本轮无关的 Redis 运行状态。
vi.unmock('@fastgpt/service/support/permission/auth/common');
vi.mock('@fastgpt/service/core/chat/generationLease', () => ({
  getChatGenerationStatuses: vi.fn(async () => new Map())
}));

let appId: string;
let otherAppId: string;
const headers = { authorization: 'Bearer app-target-fixture-key' };
let user: Awaited<ReturnType<typeof getFakeUsers>>['members'][number];

beforeEach(async () => {
  const { owner, members } = await getFakeUsers(1);
  user = members[0];
  const apps = await MongoApp.create(
    ['bound', 'other'].map((name) => ({
      teamId: owner.teamId,
      tmbId: owner.tmbId,
      name,
      type: 'simple'
    }))
  );
  [appId, otherAppId] = apps.map((app) => String(app._id));
  const key = await MongoOpenApi.create({
    teamId: user.teamId,
    tmbId: user.tmbId,
    type: 'app',
    appId,
    apiKey: 'app-target-fixture-key'
  });
  await MongoOpenApi.create({
    teamId: user.teamId,
    tmbId: user.tmbId,
    type: 'personal',
    apiKey: 'personal-target-fixture-key'
  });
  await MongoChat.create(
    [
      {
        appId,
        chatId: 'bound-api',
        source: ChatSourceEnum.api,
        publishSource: { type: ChatSourceEnum.api, id: String(key._id) }
      },
      {
        appId,
        chatId: 'bound-online',
        source: ChatSourceEnum.online,
        publishSource: { type: ChatSourceEnum.online }
      },
      {
        appId: otherAppId,
        chatId: 'other-api',
        source: ChatSourceEnum.api,
        publishSource: { type: ChatSourceEnum.api }
      }
    ].map((chat) => ({
      ...chat,
      teamId: owner.teamId,
      tmbId: owner.tmbId,
      sourceType: ChatSourceTypeEnum.app,
      title: chat.chatId,
      createTime: new Date(),
      updateTime: new Date()
    }))
  );
});

describe('app API key implicit targets through real request handlers', () => {
  it('reads and updates the bound application across authors without granting the creator ACL', async () => {
    const list = await Call(getHistories, { headers, body: {} });
    expect(list.error).toBeUndefined();
    expect(list.data.list.map((chat: { chatId: string }) => chat.chatId).sort()).toEqual([
      'bound-api',
      'bound-online'
    ]);
    const update = await Call(updateHistory, {
      headers,
      body: { chatId: 'bound-api', customTitle: 'renamed' }
    });
    expect(update.error).toBeUndefined();
    expect((await MongoChat.findOne({ appId, chatId: 'bound-api' }).lean())?.customTitle).toBe(
      'renamed'
    );
    const dates = {
      dateStart: new Date(Date.now() - 3600000).toISOString(),
      dateEnd: new Date(Date.now() + 3600000).toISOString()
    };
    const logs = await Call(listLogs, { headers, body: dates });
    expect(logs.error).toBeUndefined();
    expect(logs.data.list.map((chat: { chatId: string }) => chat.chatId).sort()).toEqual([
      'bound-api',
      'bound-online'
    ]);
  });

  it('rejects non-App targets and implicit personal/session targets', async () => {
    for (const body of [
      { skillId: otherAppId },
      { sourceType: ChatSourceTypeEnum.workflowBuilder }
    ]) {
      const result = await Call(getHistories, { headers, body });
      expect(result.error).toBeDefined();
    }
    for (const cert of [
      { headers: { authorization: 'Bearer personal-target-fixture-key' } },
      { auth: user }
    ]) {
      const result = await Call(getHistories, { ...cert, body: {} });
      expect(result.error).toBeDefined();
    }
  });

  it('uses the binding for completions, history and log requests even with a conflicting appId or SDK suffix', async () => {
    for (const authorization of [headers.authorization, `${headers.authorization}-${otherAppId}`]) {
      const auth = await authChatCompletionHeaderRequest({
        req: { headers: { authorization } } as any,
        appId: otherAppId
      });
      expect(String(auth.app._id)).toBe(appId);
    }
    const list = await Call(getHistories, { headers, body: { appId: otherAppId } });
    expect(list.error).toBeUndefined();
    expect(list.data.list.map((chat: { chatId: string }) => chat.chatId).sort()).toEqual([
      'bound-api',
      'bound-online'
    ]);
    const logs = await Call(listLogs, {
      headers,
      body: {
        appId: otherAppId,
        dateStart: new Date(Date.now() - 3600000).toISOString(),
        dateEnd: new Date(Date.now() + 3600000).toISOString()
      }
    });
    expect(logs.error).toBeUndefined();
    expect(logs.data.list.map((chat: { chatId: string }) => chat.chatId).sort()).toEqual([
      'bound-api',
      'bound-online'
    ]);
    const change = await Call(updateHistory, {
      headers,
      body: { appId: otherAppId, chatId: 'other-api', customTitle: 'forbidden' }
    });
    expect(change.error).toBeUndefined();
    expect(
      (await MongoChat.findOne({ appId: otherAppId, chatId: 'other-api' }).lean())?.customTitle
    ).toBeUndefined();
  });

  it('clears only API conversations in the bound application when the request omits appId', async () => {
    const result = await Call(clearHistories, { headers, query: {} });
    expect(result.error).toBeUndefined();
    expect(
      (await MongoChat.findOne({ appId, chatId: 'bound-api' }).select('+deleteTime').lean())
        ?.deleteTime
    ).toBeTruthy();
    expect(
      (await MongoChat.findOne({ appId, chatId: 'bound-online' }).select('+deleteTime').lean())
        ?.deleteTime
    ).toBeFalsy();
    expect(
      (
        await MongoChat.findOne({ appId: otherAppId, chatId: 'other-api' })
          .select('+deleteTime')
          .lean()
      )?.deleteTime
    ).toBeFalsy();
  });
});

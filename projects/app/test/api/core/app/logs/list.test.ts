import { ApiKeyTypeEnum } from '@fastgpt/global/support/openapi/constants';
import { MongoOpenApi } from '@fastgpt/service/support/openapi/schema';
import exportLogs from '@/pages/api/core/app/logs/exportLogs';
import { AppLogKeysEnum } from '@fastgpt/global/core/app/logs/constants';
import { MongoAppLogKeys } from '@fastgpt/service/core/app/logs/logkeysSchema';
import getLogKeys from '@/pages/api/core/app/logs/getLogKeys';
import updateLogKeys from '@/pages/api/core/app/logs/updateLogKeys';
import { describe, expect, it, beforeEach, vi } from 'vitest';
import * as listApi from '@/pages/api/core/app/logs/list';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { MongoChat } from '@fastgpt/service/core/chat/chatSchema';
import { MongoChatItem } from '@fastgpt/service/core/chat/chatItemSchema';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import { MongoTeamMember } from '@fastgpt/service/support/user/team/teamMemberSchema';
import { MongoTeam } from '@fastgpt/service/support/user/team/teamSchema';
import { MongoUser } from '@fastgpt/service/support/user/schema';
import { TeamMemberRoleEnum } from '@fastgpt/global/support/user/team/constant';
import { Call, StreamCall } from '@test/utils/request';
import type {
  getAppChatLogsBody,
  getAppChatLogsResponseType
} from '@fastgpt/global/openapi/core/app/log/api';
import { ChatRoleEnum, ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { Types } from '@fastgpt/service/common/mongo';

vi.unmock('@fastgpt/service/common/response');
vi.mock('@fastgpt/service/common/rateLimit/interface/member', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@fastgpt/service/common/rateLimit/interface/member')>()),
  // 连续导出验证查询一致性；成员导出的频控由 rateLimit 自身的用例覆盖。
  assertMemberRateLimit: vi.fn(async () => {})
}));

type EmptyQuery = Record<string, never>;

describe('logs list API - errorFilter', () => {
  let testAppId: string;
  let testTeamId: string;
  let testTmbId: string;
  let testUserId: string;
  let authUser: any;

  beforeEach(async () => {
    // Create test user
    const user = await MongoUser.create({
      username: 'test-user-logs-list',
      password: 'test-password'
    });
    testUserId = String(user._id);

    // Create test team
    const team = await MongoTeam.create({
      name: 'Test Team Logs List',
      ownerId: user._id,
      avatar: 'test-avatar',
      createTime: new Date(),
      balance: 0
    });
    testTeamId = String(team._id);

    // Create team member
    const teamMember = await MongoTeamMember.create({
      teamId: team._id,
      userId: user._id,
      name: 'Test Member Logs List',
      role: TeamMemberRoleEnum.owner,
      status: 'active',
      createTime: new Date(),
      defaultTeam: true
    });
    testTmbId = String(teamMember._id);

    // Create a test app
    const app = await MongoApp.create({
      name: 'Test App Logs List',
      type: AppTypeEnum.simple,
      teamId: team._id,
      tmbId: teamMember._id,
      avatar: 'test-avatar',
      intro: 'Test intro'
    });
    testAppId = String(app._id);

    authUser = {
      userId: testUserId,
      teamId: testTeamId,
      tmbId: testTmbId,
      isRoot: false
    };
  });

  it('历史及未知来源在未筛选列表、未知筛选和 CSV 中一致归类，且不改原记录', async () => {
    const now = new Date();
    const records = [
      { chatId: 'legacy-source' },
      { chatId: 'migrated-source', publishSource: { type: 'unknown' } },
      { chatId: 'future-source', publishSource: { type: 'future' } },
      { chatId: 'known-source', publishSource: { type: 'api' } }
    ].map((row) => ({
      ...row,
      _id: new Types.ObjectId(),
      appId: new Types.ObjectId(testAppId),
      teamId: new Types.ObjectId(testTeamId),
      tmbId: new Types.ObjectId(testTmbId),
      sourceType: ChatSourceTypeEnum.app,
      source: '历史渠道名',
      sourceName: '历史入口',
      title: '历史对话',
      createTime: now,
      updateTime: now
    }));
    await MongoChat.collection.insertMany(records as any);

    const body = { appId: testAppId, dateStart: '2020-01-01', dateEnd: '2099-01-01' };
    const result = await Call(listApi.default, {
      auth: authUser,
      headers: {},
      body
    });
    expect(result.code, String(result.error)).toBe(200);
    expect(result.data.list).toHaveLength(4);
    expect(result.data.list.every((row: any) => row.source === 'unknown')).toBe(true);
    const unknownIds = ['future-source', 'legacy-source', 'migrated-source'];
    for (const chatId of unknownIds) {
      expect(result.data.list.find((row: any) => row.chatId === chatId)?.publishSource).toEqual({
        type: 'unknown',
        name: '历史入口'
      });
    }
    const filtered = await Call(listApi.default, {
      auth: authUser,
      headers: {},
      body: { ...body, sources: ['unknown'] }
    });
    expect(filtered.code, String(filtered.error)).toBe(200);
    expect(filtered.data.total).toBe(unknownIds.length);
    expect(filtered.data.list.map((row: any) => row.chatId).sort()).toEqual(unknownIds);

    for (const sources of [undefined, ['unknown']]) {
      const exported = await StreamCall(exportLogs, {
        auth: authUser,
        headers: {},
        body: {
          ...body,
          ...(sources ? { sources } : {}),
          title: '会话,来源',
          sourcesMap: { unknown: { label: '未知' }, api: { label: 'API调用' } },
          logKeys: [AppLogKeysEnum.SESSION_ID, AppLogKeysEnum.PUBLISH_SOURCE_TYPE]
        }
      });
      expect(exported.code).toBe(200);
      for (const chatId of unknownIds) expect(exported.raw).toContain(`\n${chatId},未知,`);
      if (sources) {
        expect(exported.raw).not.toContain('known-source');
      } else {
        expect(exported.raw).toContain('\nknown-source,API调用,');
      }
    }
    for (const record of records) {
      expect(await MongoChat.collection.findOne({ _id: record._id })).toEqual(record);
    }
  });

  it('扩展渠道当前名、兼容旧名，来源筛选与CSV使用最新分类', async () => {
    const key = await MongoOpenApi.create({
      type: ApiKeyTypeEnum.personal,
      teamId: testTeamId,
      tmbId: testTmbId,
      apiKey: 'logs-source-key',
      name: '当前名称'
    });
    const now = new Date();
    await MongoChat.create(
      [
        {
          chatId: 'channel-api',
          publishSource: { type: 'api', id: key._id },
          source: 'share',
          sourceName: '旧名称'
        },
        { chatId: 'channel-old', source: 'api', sourceName: '历史入口' },
        {
          chatId: 'channel-deleted',
          publishSource: { type: 'api', id: new Types.ObjectId() },
          source: 'api',
          sourceName: ' '
        },
        { chatId: 'channel-online', publishSource: { type: 'online' }, source: 'online' },
        {
          chatId: 'channel-online-legacy',
          publishSource: { type: 'online' },
          source: 'api',
          sourceName: '不应作为渠道名的旧应用名'
        },
        {
          chatId: 'channel-test',
          publishSource: { type: 'test' },
          source: 'test',
          sourceName: '不应作为渠道名的旧应用名'
        },
        {
          chatId: 'channel-cron',
          publishSource: { type: 'cronJob' },
          source: 'cronJob',
          sourceName: '不应作为渠道名的旧应用名'
        }
      ].map((row) => ({
        ...row,
        teamId: testTeamId,
        tmbId: testTmbId,
        appId: testAppId,
        sourceType: ChatSourceTypeEnum.app,
        createTime: now,
        updateTime: now
      }))
    );
    const body = {
      appId: testAppId,
      dateStart: new Date(now.getTime() - 1000).toISOString(),
      dateEnd: new Date(now.getTime() + 1000).toISOString(),
      sources: ['api'],
      pageNum: 1,
      pageSize: 20
    };
    const result = await Call(listApi.default, { auth: authUser, headers: {}, body });
    expect(result.data.total).toBe(3);
    const rows = result.data.list;
    expect(rows.find((r: any) => r.chatId === 'channel-api')?.publishSource).toEqual({
      type: 'api',
      id: String(key._id),
      name: '当前名称'
    });
    expect(rows.find((r: any) => r.chatId === 'channel-old')?.publishSource).toEqual({
      name: '历史入口'
    });
    expect(
      rows.find((r: any) => r.chatId === 'channel-deleted')?.publishSource?.name
    ).toBeUndefined();
    const internalRows = await Call(listApi.default, {
      auth: authUser,
      headers: {},
      body: { ...body, sources: ['online', 'test', 'cronJob'] }
    });
    expect(internalRows.data.total).toBe(4);
    expect(
      internalRows.data.list.every((row: any) => !row.publishSource?.name && !row.sourceName)
    ).toBe(true);
    const exported = await StreamCall(exportLogs, {
      auth: authUser,
      headers: {},
      body: {
        ...body,
        title: 'source-test',
        sources: ['api', 'online', 'test', 'cronJob'],
        sourcesMap: {
          api: { label: 'API调用' },
          online: { label: '在线使用' },
          test: { label: '在线调试' },
          cronJob: { label: '定时任务' }
        },
        logKeys: [
          AppLogKeysEnum.SESSION_ID,
          AppLogKeysEnum.PUBLISH_SOURCE_TYPE,
          AppLogKeysEnum.SOURCE
        ]
      }
    });
    expect(exported.raw).toContain('channel-api,API调用,当前名称');
    expect(exported.raw).toContain("channel-old,'-,历史入口");
    expect(exported.raw).toContain("channel-deleted,API调用,'-");
    expect(exported.raw).toContain("channel-online,在线使用,'-");
    expect(exported.raw).toContain("channel-online-legacy,在线使用,'-");
    expect(exported.raw).toContain("channel-test,在线调试,'-");
    expect(exported.raw).toContain("channel-cron,定时任务,'-");
    expect(exported.raw).not.toContain('不应作为渠道名的旧应用名');
    expect(
      (await Call(listApi.default, { auth: authUser, headers: {}, body: { ...body, sources: [] } }))
        .data.total
    ).toBe(0);
  });

  it('should return all chats when errorFilter is not set', async () => {
    const now = new Date();

    // Create chats - some with errors, some without
    await MongoChat.create({
      chatId: 'chat-all-1',
      appId: testAppId,
      teamId: testTeamId,
      tmbId: testTmbId,
      sourceType: ChatSourceTypeEnum.app,
      source: 'online',
      updateTime: now,
      title: 'Chat without error',
      errorCount: 0
    });

    await MongoChat.create({
      chatId: 'chat-all-2',
      appId: testAppId,
      teamId: testTeamId,
      tmbId: testTmbId,
      sourceType: ChatSourceTypeEnum.app,
      source: 'online',
      updateTime: now,
      title: 'Chat with error',
      errorCount: 1
    });

    // Create chat items - one with error
    await MongoChatItem.create([
      {
        chatId: 'chat-all-1',
        teamId: testTeamId,
        tmbId: testTmbId,
        sourceType: ChatSourceTypeEnum.app,
        appId: testAppId,
        obj: ChatRoleEnum.AI,
        value: [{ text: { content: 'Normal response' } }],
        responseData: []
      },
      {
        chatId: 'chat-all-2',
        teamId: testTeamId,
        tmbId: testTmbId,
        sourceType: ChatSourceTypeEnum.app,
        appId: testAppId,
        obj: ChatRoleEnum.AI,
        value: [{ text: { content: 'Error response' } }],
        responseData: [
          {
            nodeId: 'node-1',
            moduleType: FlowNodeTypeEnum.chatNode,
            moduleName: 'Chat',
            runningTime: 1.0,
            errorText: 'API rate limit exceeded'
          }
        ]
      }
    ]);

    const dateStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const dateEnd = new Date(now.getTime() + 1000).toISOString();

    const res = await Call<getAppChatLogsBody, EmptyQuery, getAppChatLogsResponseType>(
      listApi.default,
      {
        auth: authUser,
        headers: {
          cookie: 'NEXT_LOCALE=zh-CN'
        },
        body: {
          appId: testAppId,
          dateStart,
          dateEnd
        }
      }
    );

    expect(res.code, String(res.error)).toBe(200);
    expect(res.data.total).toBe(2);
    expect(res.data.list).toHaveLength(2);
  });

  it('should return only chats with errors when errorFilter is has_error', async () => {
    const now = new Date();

    // Create chats
    await MongoChat.create([
      {
        chatId: 'chat-error-filter-1',
        appId: testAppId,
        teamId: testTeamId,
        tmbId: testTmbId,
        sourceType: ChatSourceTypeEnum.app,
        source: 'online',
        updateTime: now,
        title: 'Chat without error',
        errorCount: 0
      },
      {
        chatId: 'chat-error-filter-2',
        appId: testAppId,
        teamId: testTeamId,
        tmbId: testTmbId,
        sourceType: ChatSourceTypeEnum.app,
        source: 'online',
        updateTime: now,
        title: 'Chat with error',
        errorCount: 1
      },
      {
        chatId: 'chat-error-filter-3',
        appId: testAppId,
        teamId: testTeamId,
        tmbId: testTmbId,
        sourceType: ChatSourceTypeEnum.app,
        source: 'online',
        updateTime: now,
        title: 'Another chat without error',
        errorCount: 0
      }
    ]);

    // Create chat items
    await MongoChatItem.create([
      {
        chatId: 'chat-error-filter-1',
        teamId: testTeamId,
        tmbId: testTmbId,
        sourceType: ChatSourceTypeEnum.app,
        appId: testAppId,
        obj: ChatRoleEnum.AI,
        value: [{ text: { content: 'Normal response' } }],
        responseData: []
      },
      {
        chatId: 'chat-error-filter-2',
        teamId: testTeamId,
        tmbId: testTmbId,
        sourceType: ChatSourceTypeEnum.app,
        appId: testAppId,
        obj: ChatRoleEnum.AI,
        value: [{ text: { content: 'Error response' } }],
        responseData: [
          {
            nodeId: 'node-1',
            moduleType: FlowNodeTypeEnum.chatNode,
            moduleName: 'Chat',
            runningTime: 1.0,
            errorText: 'API rate limit exceeded'
          }
        ]
      },
      {
        chatId: 'chat-error-filter-3',
        teamId: testTeamId,
        tmbId: testTmbId,
        sourceType: ChatSourceTypeEnum.app,
        appId: testAppId,
        obj: ChatRoleEnum.AI,
        value: [{ text: { content: 'Another normal response' } }],
        responseData: []
      }
    ]);

    const dateStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const dateEnd = new Date(now.getTime() + 1000).toISOString();

    const res = await Call<getAppChatLogsBody, EmptyQuery, getAppChatLogsResponseType>(
      listApi.default,
      {
        auth: authUser,
        headers: {
          cookie: 'NEXT_LOCALE=zh-CN'
        },
        body: {
          appId: testAppId,
          dateStart,
          dateEnd,
          errorFilter: 'has_error'
        }
      }
    );

    expect(res.code, String(res.error)).toBe(200);
    expect(res.data.total).toBe(1);
    expect(res.data.list).toHaveLength(1);
    expect(res.data.list[0].chatId).toBe('chat-error-filter-2');
    expect(res.data.list[0].errorCount).toBeGreaterThan(0);
  });

  it('should return correct total count with errorFilter pagination', async () => {
    const now = new Date();

    // Create multiple chats with errors
    const chatsWithErrors = [];
    const chatsWithoutErrors = [];

    for (let i = 0; i < 5; i++) {
      chatsWithErrors.push({
        chatId: `chat-pagination-error-${i}`,
        appId: testAppId,
        teamId: testTeamId,
        tmbId: testTmbId,
        sourceType: ChatSourceTypeEnum.app,
        source: 'online',
        updateTime: new Date(now.getTime() - i * 1000),
        title: `Chat with error ${i}`,
        errorCount: 1
      });
    }

    for (let i = 0; i < 10; i++) {
      chatsWithoutErrors.push({
        chatId: `chat-pagination-normal-${i}`,
        appId: testAppId,
        teamId: testTeamId,
        tmbId: testTmbId,
        sourceType: ChatSourceTypeEnum.app,
        source: 'online',
        updateTime: new Date(now.getTime() - (i + 5) * 1000),
        title: `Chat without error ${i}`,
        errorCount: 0
      });
    }

    await MongoChat.create([...chatsWithErrors, ...chatsWithoutErrors]);

    // Create chat items
    const errorChatItems = chatsWithErrors.map((chat) => ({
      chatId: chat.chatId,
      teamId: testTeamId,
      tmbId: testTmbId,
      sourceType: ChatSourceTypeEnum.app,
      appId: testAppId,
      obj: ChatRoleEnum.AI,
      value: [{ text: { content: 'Error response' } }],
      responseData: [
        {
          nodeId: 'node-1',
          moduleType: FlowNodeTypeEnum.chatNode,
          moduleName: 'Chat',
          runningTime: 1.0,
          errorText: 'Error occurred'
        }
      ]
    }));

    const normalChatItems = chatsWithoutErrors.map((chat) => ({
      chatId: chat.chatId,
      teamId: testTeamId,
      tmbId: testTmbId,
      sourceType: ChatSourceTypeEnum.app,
      appId: testAppId,
      obj: ChatRoleEnum.AI,
      value: [{ text: { content: 'Normal response' } }],
      responseData: []
    }));

    await MongoChatItem.create([...errorChatItems, ...normalChatItems]);

    const dateStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const dateEnd = new Date(now.getTime() + 1000).toISOString();

    // Request first page with errorFilter
    const res = await Call<getAppChatLogsBody, EmptyQuery, getAppChatLogsResponseType>(
      listApi.default,
      {
        auth: authUser,
        headers: {
          cookie: 'NEXT_LOCALE=zh-CN'
        },
        body: {
          appId: testAppId,
          dateStart,
          dateEnd,
          errorFilter: 'has_error',
          pageSize: 3
        }
      }
    );

    expect(res.code, String(res.error)).toBe(200);
    expect(res.data.total).toBe(5); // Total chats with errors
    expect(res.data.list).toHaveLength(3); // First page
    res.data.list.forEach((item) => {
      expect(item.errorCount).toBeGreaterThan(0);
    });
  });

  it('should filter by both user and errorFilter', async () => {
    const now = new Date();

    // Create another team member
    const user2 = await MongoUser.create({
      username: 'test-user-2',
      password: 'test-password'
    });
    const teamMember2 = await MongoTeamMember.create({
      teamId: testTeamId,
      userId: user2._id,
      name: 'Test Member 2',
      role: TeamMemberRoleEnum.owner,
      status: 'active',
      createTime: new Date(),
      defaultTeam: false
    });

    // Create chats for different users
    await MongoChat.create([
      // User 1 with error
      {
        chatId: 'chat-user-error-1',
        appId: testAppId,
        teamId: testTeamId,
        tmbId: testTmbId,
        sourceType: ChatSourceTypeEnum.app,
        source: 'online',
        updateTime: now,
        title: 'User 1 with error',
        errorCount: 1
      },
      // User 1 without error
      {
        chatId: 'chat-user-error-2',
        appId: testAppId,
        teamId: testTeamId,
        tmbId: testTmbId,
        sourceType: ChatSourceTypeEnum.app,
        source: 'online',
        updateTime: now,
        title: 'User 1 without error',
        errorCount: 0
      },
      // User 2 with error
      {
        chatId: 'chat-user-error-3',
        appId: testAppId,
        teamId: testTeamId,
        tmbId: teamMember2._id,
        sourceType: ChatSourceTypeEnum.app,
        source: 'online',
        updateTime: now,
        title: 'User 2 with error',
        errorCount: 1
      }
    ]);

    // Create chat items
    await MongoChatItem.create([
      {
        chatId: 'chat-user-error-1',
        teamId: testTeamId,
        tmbId: testTmbId,
        sourceType: ChatSourceTypeEnum.app,
        appId: testAppId,
        obj: ChatRoleEnum.AI,
        value: [{ text: { content: 'Error' } }],
        responseData: [
          {
            nodeId: 'node-1',
            moduleType: FlowNodeTypeEnum.chatNode,
            moduleName: 'Chat',
            runningTime: 1.0,
            errorText: 'Error'
          }
        ]
      },
      {
        chatId: 'chat-user-error-2',
        teamId: testTeamId,
        tmbId: testTmbId,
        sourceType: ChatSourceTypeEnum.app,
        appId: testAppId,
        obj: ChatRoleEnum.AI,
        value: [{ text: { content: 'Normal' } }],
        responseData: []
      },
      {
        chatId: 'chat-user-error-3',
        teamId: testTeamId,
        tmbId: teamMember2._id,
        sourceType: ChatSourceTypeEnum.app,
        appId: testAppId,
        obj: ChatRoleEnum.AI,
        value: [{ text: { content: 'Error' } }],
        responseData: [
          {
            nodeId: 'node-1',
            moduleType: FlowNodeTypeEnum.chatNode,
            moduleName: 'Chat',
            runningTime: 1.0,
            errorText: 'Error'
          }
        ]
      }
    ]);

    const dateStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const dateEnd = new Date(now.getTime() + 1000).toISOString();

    // Filter by user 1 AND has_error
    const res = await Call<getAppChatLogsBody, EmptyQuery, getAppChatLogsResponseType>(
      listApi.default,
      {
        auth: authUser,
        headers: {
          cookie: 'NEXT_LOCALE=zh-CN'
        },
        body: {
          appId: testAppId,
          dateStart,
          dateEnd,
          tmbIds: [testTmbId],
          errorFilter: 'has_error'
        }
      }
    );

    expect(res.code, String(res.error)).toBe(200);
    expect(res.data.total).toBe(1);
    expect(res.data.list).toHaveLength(1);
    expect(res.data.list[0].chatId).toBe('chat-user-error-1');
  });

  it('returns empty list when user filter is unselected', async () => {
    const now = new Date();
    await MongoChat.create({
      chatId: 'chat-unselected-user',
      appId: testAppId,
      teamId: testTeamId,
      tmbId: testTmbId,
      sourceType: ChatSourceTypeEnum.app,
      source: 'online',
      updateTime: now,
      title: 'Should be hidden'
    });

    const res = await Call<getAppChatLogsBody, EmptyQuery, getAppChatLogsResponseType>(
      listApi.default,
      {
        auth: authUser,
        headers: {
          cookie: 'NEXT_LOCALE=zh-CN'
        },
        body: {
          appId: testAppId,
          dateStart: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString(),
          dateEnd: new Date(now.getTime() + 1000).toISOString(),
          tmbIds: [],
          outLinkUids: []
        }
      }
    );

    expect(res.code, String(res.error)).toBe(200);
    expect(res.data).toEqual({ list: [], total: 0 });
  });

  it('does not expose members outside the app team and keeps former share members visible', async () => {
    const foreignUser = await MongoUser.create({
      username: 'foreign-user-logs-list',
      password: 'test-password'
    });
    const foreignTeam = await MongoTeam.create({
      name: 'Foreign Team Logs List',
      ownerId: foreignUser._id,
      avatar: 'foreign-avatar',
      createTime: new Date(),
      balance: 0
    });
    const foreignMember = await MongoTeamMember.create({
      teamId: foreignTeam._id,
      userId: foreignUser._id,
      name: 'Foreign Member',
      role: TeamMemberRoleEnum.owner,
      status: 'active',
      createTime: new Date(),
      defaultTeam: true
    });
    const inactiveUser = await MongoUser.create({
      username: 'inactive-user-logs-list',
      password: 'test-password'
    });
    const inactiveMember = await MongoTeamMember.create({
      teamId: testTeamId,
      userId: inactiveUser._id,
      name: 'Inactive Member',
      status: 'leave',
      createTime: new Date(),
      defaultTeam: false
    });
    const now = new Date();
    const foreignTmbId = String(foreignMember._id);
    const inactiveTmbId = String(inactiveMember._id);
    await MongoChat.create([
      {
        chatId: 'share-foreign-member',
        appId: testAppId,
        teamId: testTeamId,
        tmbId: testTmbId,
        outLinkUid: foreignTmbId,
        sourceType: ChatSourceTypeEnum.app,
        source: 'share',
        updateTime: now,
        title: 'Foreign share chat'
      },
      {
        chatId: 'share-inactive-member',
        appId: testAppId,
        teamId: testTeamId,
        tmbId: testTmbId,
        outLinkUid: inactiveTmbId,
        sourceType: ChatSourceTypeEnum.app,
        source: 'share',
        updateTime: now,
        title: 'Inactive share chat'
      }
    ]);

    const res = await Call<getAppChatLogsBody, EmptyQuery, getAppChatLogsResponseType>(
      listApi.default,
      {
        auth: authUser,
        headers: { cookie: 'NEXT_LOCALE=zh-CN' },
        body: {
          appId: testAppId,
          dateStart: new Date(now.getTime() - 1000).toISOString(),
          dateEnd: new Date(now.getTime() + 1000).toISOString()
        }
      }
    );

    expect(res.code, String(res.error)).toBe(200);
    expect(res.data.list.find((item) => item.chatId === 'share-foreign-member')?.sourceMember).toBe(
      undefined
    );
    expect(
      res.data.list.find((item) => item.chatId === 'share-inactive-member')?.sourceMember
    ).toEqual(expect.objectContaining({ name: 'Inactive Member', status: 'leave' }));
    expect(
      res.data.list.find((item) => item.chatId === 'share-inactive-member')?.authMember
    ).toEqual(expect.objectContaining({ name: 'Test Member Logs List', status: 'active' }));
  });

  it('uses the source-member fallback for a share visitor with a missing name', async () => {
    const visitor = await MongoUser.create({
      username: 'nameless-share-visitor',
      password: 'test-password'
    });
    const visitorMember = await MongoTeamMember.create({
      teamId: testTeamId,
      userId: visitor._id,
      name: 'Temporary name',
      status: 'active',
      createTime: new Date(),
      defaultTeam: false
    });
    await MongoTeamMember.updateOne({ _id: visitorMember._id }, { $unset: { name: 1 } });

    const now = new Date();
    await MongoChat.create({
      chatId: 'share-nameless-member',
      appId: testAppId,
      teamId: testTeamId,
      tmbId: testTmbId,
      outLinkUid: String(visitorMember._id),
      sourceType: ChatSourceTypeEnum.app,
      source: 'share',
      updateTime: now,
      title: 'Nameless share chat'
    });

    const res = await Call<getAppChatLogsBody, EmptyQuery, getAppChatLogsResponseType>(
      listApi.default,
      {
        auth: authUser,
        headers: { cookie: 'NEXT_LOCALE=zh-CN' },
        body: {
          appId: testAppId,
          dateStart: new Date(now.getTime() - 1000).toISOString(),
          dateEnd: new Date(now.getTime() + 1000).toISOString()
        }
      }
    );

    expect(res.code, String(res.error)).toBe(200);
    expect(
      res.data.list.find((item) => item.chatId === 'share-nameless-member')?.sourceMember
    ).toEqual(expect.objectContaining({ name: 'unknown', status: 'active' }));
  });
  it('keeps API authorizer independent of customUid and excludes foreign authorizers', async () => {
    const foreignUser = await MongoUser.create({
      username: 'foreign-authorizer',
      password: 'password'
    });
    const foreignTeam = await MongoTeam.create({ name: 'Foreign', ownerId: foreignUser._id });
    const foreign = await MongoTeamMember.create({
      teamId: foreignTeam._id,
      userId: foreignUser._id,
      name: 'Foreign secret',
      role: 'owner',
      status: 'active'
    });
    await MongoChat.create([
      {
        chatId: 'api-custom',
        appId: testAppId,
        teamId: testTeamId,
        tmbId: testTmbId,
        sourceType: 'app',
        source: 'api',
        outLinkUid: 'customer-42'
      },
      {
        chatId: 'foreign-authorizer',
        appId: testAppId,
        teamId: testTeamId,
        tmbId: foreign._id,
        sourceType: 'app',
        source: 'api'
      }
    ]);
    const res = await Call(listApi.default, {
      auth: authUser,
      headers: {},
      body: { appId: testAppId, dateStart: '2020-01-01', dateEnd: '2099-01-01' }
    });
    expect(res.code, String(res.error)).toBe(200);
    expect(res.data.list.find((item: any) => item.chatId === 'api-custom')).toMatchObject({
      tmbId: testTmbId,
      outLinkUid: 'customer-42',
      authMember: { name: 'Test Member Logs List' }
    });
    expect(
      res.data.list.find((item: any) => item.chatId === 'foreign-authorizer').authMember
    ).toBeUndefined();
  });

  it('lists and exports the same users with feedback, search and source filters combined', async () => {
    const base = {
      appId: testAppId,
      teamId: testTeamId,
      tmbId: testTmbId,
      sourceType: 'app',
      source: 'api',
      title: 'needle',
      outLinkUid: 'customer,"42"',
      hasGoodFeedback: true,
      errorCount: 1
    };
    await MongoChat.create([
      { ...base, chatId: 'match' },
      { ...base, chatId: 'wrong-user', outLinkUid: 'another' },
      { ...base, chatId: 'no-feedback', hasGoodFeedback: false },
      { ...base, chatId: 'wrong-title', title: 'unrelated' },
      { ...base, chatId: 'wrong-source', source: 'share' },
      { ...base, chatId: 'wrong-resource', sourceType: ChatSourceTypeEnum.skillEdit }
    ]);
    const body = {
      appId: testAppId,
      dateStart: '2020-01-01',
      dateEnd: '2099-01-01',
      tmbIds: [],
      outLinkUids: ['customer,"42"'],
      chatSearch: 'needle',
      feedbackType: 'has_feedback',
      sources: ['api'],
      errorFilter: 'has_error'
    };
    const listed = await Call(listApi.default, { auth: authUser, headers: {}, body });
    expect(listed.code, String(listed.error)).toBe(200);
    expect(listed.data.list.map((item: any) => item.chatId)).toEqual(['match']);
    const exported = await StreamCall(exportLogs, {
      auth: authUser,
      headers: {},
      body: {
        ...body,
        title: 'User,Authorizer,Session,Details',
        sourcesMap: {},
        logKeys: [AppLogKeysEnum.USER, AppLogKeysEnum.AUTH_USER, AppLogKeysEnum.SESSION_ID]
      }
    });
    expect(exported.code).toBe(200);
    expect(exported.raw).toContain(`"customer,""42""",${testTmbId}:Test Member Logs List,match,`);
    expect(exported.raw).not.toMatch(/wrong-|no-feedback/);
    expect(exported.raw.split('\n')).toHaveLength(2);
  });

  it('exports identities as id:name and keeps only the ID when no member name is available', async () => {
    const missingId = String(new Types.ObjectId());
    const base = {
      appId: testAppId,
      teamId: testTeamId,
      tmbId: testTmbId,
      sourceType: ChatSourceTypeEnum.app,
      source: 'api'
    };
    await MongoChat.create([
      { ...base, chatId: 'member-identity' },
      { ...base, chatId: 'external-identity', outLinkUid: 'customer-42' },
      { ...base, chatId: 'missing-identity', tmbId: missingId }
    ]);

    const exportIdentities = () =>
      StreamCall(exportLogs, {
        auth: authUser,
        headers: {},
        body: {
          appId: testAppId,
          dateStart: '2020-01-01',
          dateEnd: '2099-01-01',
          title: 'User,Authorizer,Session,Details',
          sourcesMap: {},
          logKeys: [AppLogKeysEnum.USER, AppLogKeysEnum.AUTH_USER, AppLogKeysEnum.SESSION_ID]
        }
      });
    const named = await exportIdentities();
    expect(named.code).toBe(200);
    const memberIdentity = `${testTmbId}:Test Member Logs List`;
    expect(named.raw).toContain(`\n${memberIdentity},${memberIdentity},member-identity,`);
    expect(named.raw).toContain(`\ncustomer-42,${memberIdentity},external-identity,`);
    expect(named.raw).toContain(`\n${missingId},${missingId},missing-identity,`);

    for (const name of ['   ', undefined]) {
      await MongoTeamMember.updateOne(
        { _id: testTmbId },
        name === undefined ? { $unset: { name: 1 } } : { $set: { name } }
      );
      const nameless = await exportIdentities();
      expect(nameless.code).toBe(200);
      expect(nameless.raw).toContain(`\n${testTmbId},${testTmbId},member-identity,`);
      expect(nameless.raw).toContain(`\ncustomer-42,${testTmbId},external-identity,`);
    }
  });

  it('normalizes old team columns on read and write while retaining explicit choices', async () => {
    await MongoAppLogKeys.create({
      teamId: testTeamId,
      appId: testAppId,
      logKeys: [
        { key: 'user', enable: false },
        { key: 'title', enable: true }
      ]
    });
    const res = await Call(getLogKeys, { auth: authUser, query: { appId: testAppId } });
    expect(res.code, String(res.error)).toBe(200);
    expect(res.data.logKeys.slice(0, 3)).toEqual([
      { key: 'user', enable: false },
      { key: 'authUser', enable: false },
      { key: 'title', enable: true }
    ]);
    expect((await MongoAppLogKeys.findOne({ appId: testAppId }))?.logKeys).toHaveLength(2);
    const saved = await Call(updateLogKeys, {
      auth: authUser,
      headers: {},
      body: {
        appId: testAppId,
        logKeys: [
          { key: 'authUser', enable: true },
          { key: 'user', enable: false }
        ]
      }
    });
    expect(saved.code).toBe(200);
    const refreshed = await Call(getLogKeys, { auth: authUser, query: { appId: testAppId } });
    expect(refreshed.data.logKeys.slice(0, 2)).toEqual([
      { key: 'authUser', enable: true },
      { key: 'user', enable: false }
    ]);
  });

  it('keeps feedback and unread filters consistent in the list and CSV', async () => {
    const base = {
      appId: testAppId,
      teamId: testTeamId,
      tmbId: testTmbId,
      sourceType: ChatSourceTypeEnum.app,
      source: 'api',
      title: 'feedback needle',
      outLinkUid: 'customer-42'
    };
    await MongoChat.create([
      { ...base, chatId: 'read-good', hasGoodFeedback: true },
      { ...base, chatId: 'read-bad', hasBadFeedback: true },
      { ...base, chatId: 'unread-good', hasGoodFeedback: true, hasUnreadGoodFeedback: true },
      { ...base, chatId: 'unread-bad', hasBadFeedback: true, hasUnreadBadFeedback: true },
      { ...base, chatId: 'another-user', outLinkUid: 'another', hasUnreadBadFeedback: true }
    ]);
    // 旧数据没有 sourceType，也必须参与相同的筛选和导出。
    await MongoChat.updateOne(
      { appId: testAppId, chatId: 'read-good' },
      { $unset: { sourceType: 1 } }
    );
    for (const { feedbackType, unreadOnly, expected } of [
      { feedbackType: 'has_feedback', unreadOnly: true, expected: ['unread-bad', 'unread-good'] },
      { feedbackType: 'good', unreadOnly: false, expected: ['read-good', 'unread-good'] },
      { feedbackType: 'bad', unreadOnly: true, expected: ['unread-bad'] }
    ]) {
      const body = {
        appId: testAppId,
        dateStart: '2020-01-01',
        dateEnd: '2099-01-01',
        outLinkUids: ['customer-42'],
        chatSearch: 'needle',
        feedbackType,
        unreadOnly
      };
      const listed = await Call(listApi.default, { auth: authUser, headers: {}, body });
      expect(listed.code, String(listed.error)).toBe(200);
      expect(listed.data.list.map((item: any) => item.chatId).sort()).toEqual(expected);
      const exported = await StreamCall(exportLogs, {
        auth: authUser,
        headers: {},
        body: {
          ...body,
          title: 'Session,Details',
          sourcesMap: {},
          logKeys: [AppLogKeysEnum.SESSION_ID]
        }
      });
      expect(exported.code).toBe(200);
      expect(
        exported.raw
          .split('\n')
          .slice(1)
          .map((line) => line.split(',')[0])
          .sort()
      ).toEqual(expected);
    }
  });
});

import { describe, expect, it, beforeEach } from 'vitest';
import * as listApi from '@/pages/api/core/app/logs/list';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { MongoChat } from '@fastgpt/service/core/chat/chatSchema';
import { MongoChatItem } from '@fastgpt/service/core/chat/chatItemSchema';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import { MongoTeamMember } from '@fastgpt/service/support/user/team/teamMemberSchema';
import { MongoTeam } from '@fastgpt/service/support/user/team/teamSchema';
import { MongoUser } from '@fastgpt/service/support/user/schema';
import { TeamMemberRoleEnum } from '@fastgpt/global/support/user/team/constant';
import { Call } from '@test/utils/request';
import type {
  getAppChatLogsBody,
  getAppChatLogsResponseType
} from '@fastgpt/global/openapi/core/app/log/api';
import { ChatRoleEnum, ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';

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

    expect(res.code).toBe(200);
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

    expect(res.code).toBe(200);
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

    expect(res.code).toBe(200);
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

    expect(res.code).toBe(200);
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

    expect(res.code).toBe(200);
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

    expect(res.code).toBe(200);
    expect(res.data.list.find((item) => item.chatId === 'share-foreign-member')?.sourceMember).toBe(
      undefined
    );
    expect(
      res.data.list.find((item) => item.chatId === 'share-inactive-member')?.sourceMember
    ).toEqual(expect.objectContaining({ name: 'Inactive Member', status: 'leave' }));
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

    expect(res.code).toBe(200);
    expect(
      res.data.list.find((item) => item.chatId === 'share-nameless-member')?.sourceMember
    ).toEqual(expect.objectContaining({ name: 'unknown', status: 'active' }));
  });
});

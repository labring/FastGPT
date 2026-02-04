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
import { ChatItemValueTypeEnum, ChatRoleEnum } from '@fastgpt/global/core/chat/constants';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';

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
      balance: 0,
      teamDomain: 'test-domain-logs-list'
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
    const chat1 = await MongoChat.create({
      chatId: 'chat-all-1',
      appId: testAppId,
      teamId: testTeamId,
      tmbId: testTmbId,
      source: 'online',
      updateTime: now,
      title: 'Chat without error'
    });

    const chat2 = await MongoChat.create({
      chatId: 'chat-all-2',
      appId: testAppId,
      teamId: testTeamId,
      tmbId: testTmbId,
      source: 'online',
      updateTime: now,
      title: 'Chat with error'
    });

    // Create chat items - one with error
    await MongoChatItem.create([
      {
        chatId: 'chat-all-1',
        teamId: testTeamId,
        tmbId: testTmbId,
        appId: testAppId,
        obj: ChatRoleEnum.AI,
        value: [{ type: ChatItemValueTypeEnum.text, text: { content: 'Normal response' } }],
        responseData: []
      },
      {
        chatId: 'chat-all-2',
        teamId: testTeamId,
        tmbId: testTmbId,
        appId: testAppId,
        obj: ChatRoleEnum.AI,
        value: [{ type: ChatItemValueTypeEnum.text, text: { content: 'Error response' } }],
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

    const res = await Call<getAppChatLogsBody, {}, getAppChatLogsResponseType>(listApi.default, {
      auth: authUser,
      cookies: {
        NEXT_LOCALE: 'zh-CN'
      },
      body: {
        appId: testAppId,
        dateStart,
        dateEnd
      }
    });

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
        source: 'online',
        updateTime: now,
        title: 'Chat without error'
      },
      {
        chatId: 'chat-error-filter-2',
        appId: testAppId,
        teamId: testTeamId,
        tmbId: testTmbId,
        source: 'online',
        updateTime: now,
        title: 'Chat with error'
      },
      {
        chatId: 'chat-error-filter-3',
        appId: testAppId,
        teamId: testTeamId,
        tmbId: testTmbId,
        source: 'online',
        updateTime: now,
        title: 'Another chat without error'
      }
    ]);

    // Create chat items
    await MongoChatItem.create([
      {
        chatId: 'chat-error-filter-1',
        teamId: testTeamId,
        tmbId: testTmbId,
        appId: testAppId,
        obj: ChatRoleEnum.AI,
        value: [{ type: ChatItemValueTypeEnum.text, text: { content: 'Normal response' } }],
        responseData: []
      },
      {
        chatId: 'chat-error-filter-2',
        teamId: testTeamId,
        tmbId: testTmbId,
        appId: testAppId,
        obj: ChatRoleEnum.AI,
        value: [{ type: ChatItemValueTypeEnum.text, text: { content: 'Error response' } }],
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
        appId: testAppId,
        obj: ChatRoleEnum.AI,
        value: [{ type: ChatItemValueTypeEnum.text, text: { content: 'Another normal response' } }],
        responseData: []
      }
    ]);

    const dateStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const dateEnd = new Date(now.getTime() + 1000).toISOString();

    const res = await Call<getAppChatLogsBody, {}, getAppChatLogsResponseType>(listApi.default, {
      auth: authUser,
      cookies: {
        NEXT_LOCALE: 'zh-CN'
      },
      body: {
        appId: testAppId,
        dateStart,
        dateEnd,
        errorFilter: 'has_error'
      }
    });

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
        source: 'online',
        updateTime: new Date(now.getTime() - i * 1000),
        title: `Chat with error ${i}`
      });
    }

    for (let i = 0; i < 10; i++) {
      chatsWithoutErrors.push({
        chatId: `chat-pagination-normal-${i}`,
        appId: testAppId,
        teamId: testTeamId,
        tmbId: testTmbId,
        source: 'online',
        updateTime: new Date(now.getTime() - (i + 5) * 1000),
        title: `Chat without error ${i}`
      });
    }

    await MongoChat.create([...chatsWithErrors, ...chatsWithoutErrors]);

    // Create chat items
    const errorChatItems = chatsWithErrors.map((chat) => ({
      chatId: chat.chatId,
      teamId: testTeamId,
      tmbId: testTmbId,
      appId: testAppId,
      obj: ChatRoleEnum.AI,
      value: [{ type: ChatItemValueTypeEnum.text, text: { content: 'Error response' } }],
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
      appId: testAppId,
      obj: ChatRoleEnum.AI,
      value: [{ type: ChatItemValueTypeEnum.text, text: { content: 'Normal response' } }],
      responseData: []
    }));

    await MongoChatItem.create([...errorChatItems, ...normalChatItems]);

    const dateStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const dateEnd = new Date(now.getTime() + 1000).toISOString();

    // Request first page with errorFilter
    const res = await Call<getAppChatLogsBody, {}, getAppChatLogsResponseType>(listApi.default, {
      auth: authUser,
      cookies: {
        NEXT_LOCALE: 'zh-CN'
      },
      body: {
        appId: testAppId,
        dateStart,
        dateEnd,
        errorFilter: 'has_error',
        pageSize: 3
      }
    });

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
      role: TeamMemberRoleEnum.member,
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
        source: 'online',
        updateTime: now,
        title: 'User 1 with error'
      },
      // User 1 without error
      {
        chatId: 'chat-user-error-2',
        appId: testAppId,
        teamId: testTeamId,
        tmbId: testTmbId,
        source: 'online',
        updateTime: now,
        title: 'User 1 without error'
      },
      // User 2 with error
      {
        chatId: 'chat-user-error-3',
        appId: testAppId,
        teamId: testTeamId,
        tmbId: teamMember2._id,
        source: 'online',
        updateTime: now,
        title: 'User 2 with error'
      }
    ]);

    // Create chat items
    await MongoChatItem.create([
      {
        chatId: 'chat-user-error-1',
        teamId: testTeamId,
        tmbId: testTmbId,
        appId: testAppId,
        obj: ChatRoleEnum.AI,
        value: [{ type: ChatItemValueTypeEnum.text, text: { content: 'Error' } }],
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
        appId: testAppId,
        obj: ChatRoleEnum.AI,
        value: [{ type: ChatItemValueTypeEnum.text, text: { content: 'Normal' } }],
        responseData: []
      },
      {
        chatId: 'chat-user-error-3',
        teamId: testTeamId,
        tmbId: teamMember2._id,
        appId: testAppId,
        obj: ChatRoleEnum.AI,
        value: [{ type: ChatItemValueTypeEnum.text, text: { content: 'Error' } }],
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
    const res = await Call<getAppChatLogsBody, {}, getAppChatLogsResponseType>(listApi.default, {
      auth: authUser,
      cookies: {
        NEXT_LOCALE: 'zh-CN'
      },
      body: {
        appId: testAppId,
        dateStart,
        dateEnd,
        tmbIds: [testTmbId],
        errorFilter: 'has_error'
      }
    });

    expect(res.code).toBe(200);
    expect(res.data.total).toBe(1);
    expect(res.data.list).toHaveLength(1);
    expect(res.data.list[0].chatId).toBe('chat-user-error-1');
  });
});

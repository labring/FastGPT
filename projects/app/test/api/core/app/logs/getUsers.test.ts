import { describe, expect, it, beforeEach } from 'vitest';
import * as getUsers from '@/pages/api/core/app/logs/getUsers';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { MongoAppChatLog } from '@fastgpt/service/core/app/logs/chatLogsSchema';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import { MongoTeamMember } from '@fastgpt/service/support/user/team/teamMemberSchema';
import { MongoTeam } from '@fastgpt/service/support/user/team/teamSchema';
import { MongoUser } from '@fastgpt/service/support/user/schema';
import {
  TeamMemberRoleEnum,
  UNSET_TEAM_MEMBER_NAME
} from '@fastgpt/global/support/user/team/constant';
import { Call } from '@test/utils/request';
import type {
  GetLogUsersBody,
  GetLogUsersResponse
} from '@fastgpt/global/openapi/core/app/log/api';
import { ChatSourceEnum } from '@fastgpt/global/core/chat/constants';

type EmptyQuery = Record<string, never>;
type TestChatLog = {
  chatId: string;
  userId: string;
  source: ChatSourceEnum;
};

describe('getUsers API', () => {
  let testAppId: string;
  let testTeamId: string;
  let testTmbId: string;
  let testUserId: string;
  let authUser: any;

  const createAppChatLogs = (logs: TestChatLog[], updateTime: Date) =>
    MongoAppChatLog.create(
      logs.map((log) => ({
        ...log,
        appId: testAppId,
        teamId: testTeamId,
        createTime: updateTime,
        updateTime
      }))
    );

  beforeEach(async () => {
    // Create test user
    const user = await MongoUser.create({
      username: 'test-user-logs',
      password: 'test-password'
    });
    testUserId = String(user._id);

    // Create test team
    const team = await MongoTeam.create({
      name: 'Test Team Logs',
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
      name: 'Test Member Logs',
      role: TeamMemberRoleEnum.owner,
      status: 'active',
      createTime: new Date(),
      defaultTeam: true
    });
    testTmbId = String(teamMember._id);

    // Create a test app
    const app = await MongoApp.create({
      name: 'Test App Logs',
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

  it('should return empty list when no chats exist', async () => {
    const now = new Date();
    const dateStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const dateEnd = now.toISOString();

    const res = await Call<GetLogUsersBody, EmptyQuery, GetLogUsersResponse>(getUsers.default, {
      auth: authUser,
      body: {
        appId: testAppId,
        dateStart,
        dateEnd
      }
    });

    expect(res.code).toBe(200);
    expect(res.data.list).toHaveLength(0);
  });

  it('should return users with chat counts', async () => {
    const now = new Date();

    // Create chats with different users
    await createAppChatLogs(
      [
        {
          chatId: 'chat-1',
          userId: testTmbId,
          source: ChatSourceEnum.online
        },
        {
          chatId: 'chat-2',
          userId: testTmbId,
          source: ChatSourceEnum.online
        },
        {
          chatId: 'chat-3',
          userId: 'external-user-1',
          source: ChatSourceEnum.share
        }
      ],
      now
    );

    const dateStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const dateEnd = new Date(now.getTime() + 1000).toISOString();

    const res = await Call<GetLogUsersBody, EmptyQuery, GetLogUsersResponse>(getUsers.default, {
      auth: authUser,
      body: {
        appId: testAppId,
        dateStart,
        dateEnd
      }
    });

    expect(res.code).toBe(200);
    expect(res.data.list.length).toBeGreaterThan(0);

    // Check tmbId user has count 2
    const tmbUser = res.data.list.find((u) => u.tmbId === testTmbId);
    expect(tmbUser).toBeDefined();
    expect(tmbUser?.count).toBe(2);

    // Check outLinkUid user
    const outLinkUser = res.data.list.find((u) => u.outLinkUid === 'external-user-1');
    expect(outLinkUser).toBeDefined();
    expect(outLinkUser?.count).toBe(1);
  });

  it('should filter users by searchKey', async () => {
    const now = new Date();

    // Create another team member
    const user2 = await MongoUser.create({
      username: 'john-doe',
      password: 'test-password'
    });
    const teamMember2 = await MongoTeamMember.create({
      teamId: testTeamId,
      userId: user2._id,
      name: 'John Doe',
      role: TeamMemberRoleEnum.owner,
      status: 'active',
      createTime: new Date(),
      defaultTeam: false
    });

    // Create chats
    await createAppChatLogs(
      [
        {
          chatId: 'chat-search-1',
          userId: String(teamMember2._id),
          source: ChatSourceEnum.online
        },
        {
          chatId: 'chat-search-2',
          userId: 'alice-user',
          source: ChatSourceEnum.share
        }
      ],
      now
    );

    const dateStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const dateEnd = new Date(now.getTime() + 1000).toISOString();

    // Search for "John"
    const res = await Call<GetLogUsersBody, EmptyQuery, GetLogUsersResponse>(getUsers.default, {
      auth: authUser,
      body: {
        appId: testAppId,
        dateStart,
        dateEnd,
        searchKey: 'John'
      }
    });

    expect(res.code).toBe(200);
    // Should find John Doe
    const johnUser = res.data.list.find((u) => u.name === 'John Doe');
    expect(johnUser).toBeDefined();

    // Search for "alice"
    const res2 = await Call<GetLogUsersBody, EmptyQuery, GetLogUsersResponse>(getUsers.default, {
      auth: authUser,
      body: {
        appId: testAppId,
        dateStart,
        dateEnd,
        searchKey: 'alice'
      }
    });

    expect(res2.code).toBe(200);
    const aliceUser = res2.data.list.find((u) => u.outLinkUid === 'alice-user');
    expect(aliceUser).toBeDefined();
  });

  it('should find pending-name team members by username or contact', async () => {
    const now = new Date();
    const user = await MongoUser.create({
      username: 'first-login-user',
      contact: 'first-login@example.com',
      password: 'test-password'
    });
    const teamMember = await MongoTeamMember.create({
      teamId: testTeamId,
      userId: user._id,
      name: UNSET_TEAM_MEMBER_NAME,
      role: TeamMemberRoleEnum.owner,
      status: 'active',
      createTime: new Date(),
      defaultTeam: false
    });

    await createAppChatLogs(
      [
        {
          chatId: 'first-login-user-chat',
          userId: String(teamMember._id),
          source: ChatSourceEnum.online
        }
      ],
      now
    );

    const request = {
      appId: testAppId,
      dateStart: new Date(now.getTime() - 1000).toISOString(),
      dateEnd: new Date(now.getTime() + 1000).toISOString()
    };
    const byUsername = await Call<GetLogUsersBody, EmptyQuery, GetLogUsersResponse>(
      getUsers.default,
      { auth: authUser, body: { ...request, searchKey: 'first-login-user' } }
    );
    const byContact = await Call<GetLogUsersBody, EmptyQuery, GetLogUsersResponse>(
      getUsers.default,
      { auth: authUser, body: { ...request, searchKey: 'first-login@example.com' } }
    );

    expect(byUsername.code).toBe(200);
    expect(byUsername.data.total).toBe(1);
    expect(byUsername.data.list[0]).toMatchObject({
      tmbId: String(teamMember._id),
      name: 'first-login-user'
    });
    expect(byContact.code).toBe(200);
    expect(byContact.data.total).toBe(1);
    expect(byContact.data.list[0].tmbId).toBe(String(teamMember._id));
  });

  it('should sort users by chat count descending', async () => {
    const now = new Date();

    // Create chats with different frequencies
    await createAppChatLogs(
      [
        // User A: 3 chats
        {
          chatId: 'sort-1',
          userId: 'user-a',
          source: ChatSourceEnum.share
        },
        {
          chatId: 'sort-2',
          userId: 'user-a',
          source: ChatSourceEnum.share
        },
        {
          chatId: 'sort-3',
          userId: 'user-a',
          source: ChatSourceEnum.share
        },
        // User B: 1 chat
        {
          chatId: 'sort-4',
          userId: 'user-b',
          source: ChatSourceEnum.share
        }
      ],
      now
    );

    const dateStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const dateEnd = new Date(now.getTime() + 1000).toISOString();

    const res = await Call<GetLogUsersBody, EmptyQuery, GetLogUsersResponse>(getUsers.default, {
      auth: authUser,
      body: {
        appId: testAppId,
        dateStart,
        dateEnd
      }
    });

    expect(res.code).toBe(200);
    // First user should have the highest count
    const userA = res.data.list.find((u) => u.outLinkUid === 'user-a');
    const userB = res.data.list.find((u) => u.outLinkUid === 'user-b');

    expect(userA).toBeDefined();
    expect(userB).toBeDefined();
    expect(userA!.count).toBeGreaterThan(userB!.count);
  });

  it('should filter users by sources', async () => {
    const now = new Date();

    // Create chats with different sources
    await createAppChatLogs(
      [
        {
          chatId: 'source-1',
          userId: 'online-user',
          source: ChatSourceEnum.online
        },
        {
          chatId: 'source-2',
          userId: 'share-user',
          source: ChatSourceEnum.share
        },
        {
          chatId: 'source-3',
          userId: 'api-user',
          source: ChatSourceEnum.api
        }
      ],
      now
    );

    const dateStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const dateEnd = new Date(now.getTime() + 1000).toISOString();

    // Filter by 'share' source only
    const res = await Call<GetLogUsersBody, EmptyQuery, GetLogUsersResponse>(getUsers.default, {
      auth: authUser,
      body: {
        appId: testAppId,
        dateStart,
        dateEnd,
        sources: ['share']
      }
    });

    expect(res.code).toBe(200);
    // Should only find share-user
    const shareUser = res.data.list.find((u) => u.outLinkUid === 'share-user');
    expect(shareUser).toBeDefined();

    // Should not find online-user or api-user
    const onlineUser = res.data.list.find((u) => u.outLinkUid === 'online-user');
    const apiUser = res.data.list.find((u) => u.outLinkUid === 'api-user');
    expect(onlineUser).toBeUndefined();
    expect(apiUser).toBeUndefined();

    // Filter by multiple sources
    const res2 = await Call<GetLogUsersBody, EmptyQuery, GetLogUsersResponse>(getUsers.default, {
      auth: authUser,
      body: {
        appId: testAppId,
        dateStart,
        dateEnd,
        sources: ['online', 'api']
      }
    });

    expect(res2.code).toBe(200);
    // Should find online-user and api-user
    const onlineUser2 = res2.data.list.find((u) => u.outLinkUid === 'online-user');
    const apiUser2 = res2.data.list.find((u) => u.outLinkUid === 'api-user');
    expect(onlineUser2).toBeDefined();
    expect(apiUser2).toBeDefined();

    // Should not find share-user
    const shareUser2 = res2.data.list.find((u) => u.outLinkUid === 'share-user');
    expect(shareUser2).toBeUndefined();
  });

  it('should paginate users and search beyond the first 100 users', async () => {
    const now = new Date();
    const logs = Array.from({ length: 101 }, (_, index) => {
      const userId = `bulk-user-${String(index).padStart(3, '0')}`;
      return [
        {
          chatId: `bulk-${index}-1`,
          userId,
          source: ChatSourceEnum.share
        },
        {
          chatId: `bulk-${index}-2`,
          userId,
          source: ChatSourceEnum.share
        }
      ];
    }).flat();
    logs.push({
      chatId: 'search-target',
      userId: 'search-target-user',
      source: ChatSourceEnum.share
    });
    await createAppChatLogs(logs, now);

    const page1 = await Call<GetLogUsersBody, EmptyQuery, GetLogUsersResponse>(getUsers.default, {
      auth: authUser,
      body: {
        appId: testAppId,
        dateStart: new Date(now.getTime() - 1000).toISOString(),
        dateEnd: new Date(now.getTime() + 1000).toISOString(),
        pageSize: 1,
        offset: 0
      }
    });
    expect(page1.code).toBe(200);
    expect(page1.data.total).toBe(102);
    expect(page1.data.list).toHaveLength(1);

    const page2 = await Call<GetLogUsersBody, EmptyQuery, GetLogUsersResponse>(getUsers.default, {
      auth: authUser,
      body: {
        appId: testAppId,
        dateStart: new Date(now.getTime() - 1000).toISOString(),
        dateEnd: new Date(now.getTime() + 1000).toISOString(),
        pageSize: 1,
        offset: 1
      }
    });
    expect(page2.code).toBe(200);
    expect(page2.data.total).toBe(102);
    expect(page2.data.list).toHaveLength(1);
    expect(page2.data.list[0].outLinkUid).not.toBe(page1.data.list[0].outLinkUid);

    const searched = await Call<GetLogUsersBody, EmptyQuery, GetLogUsersResponse>(
      getUsers.default,
      {
        auth: authUser,
        body: {
          appId: testAppId,
          dateStart: new Date(now.getTime() - 1000).toISOString(),
          dateEnd: new Date(now.getTime() + 1000).toISOString(),
          searchKey: 'search-target-user',
          pageSize: 1,
          offset: 0
        }
      }
    );
    expect(searched.code).toBe(200);
    expect(searched.data.total).toBe(1);
    expect(searched.data.list[0].outLinkUid).toBe('search-target-user');
  });
});

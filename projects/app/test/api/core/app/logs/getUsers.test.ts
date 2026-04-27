import { describe, expect, it, beforeEach } from 'vitest';
import * as getUsers from '@/pages/api/core/app/logs/getUsers';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { MongoChat } from '@fastgpt/service/core/chat/chatSchema';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import { MongoTeamMember } from '@fastgpt/service/support/user/team/teamMemberSchema';
import { MongoTeam } from '@fastgpt/service/support/user/team/teamSchema';
import { MongoUser } from '@fastgpt/service/support/user/schema';
import { TeamMemberRoleEnum } from '@fastgpt/global/support/user/team/constant';
import { Call } from '@test/utils/request';
import type {
  GetLogUsersBody,
  GetLogUsersResponse
} from '@fastgpt/global/openapi/core/app/log/api';

describe('getUsers API', () => {
  let testAppId: string;
  let testTeamId: string;
  let testTmbId: string;
  let testUserId: string;
  let authUser: any;

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
      balance: 0,
      teamDomain: 'test-domain-logs'
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

    const res = await Call<GetLogUsersBody, {}, GetLogUsersResponse>(getUsers.default, {
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
    await MongoChat.create([
      {
        chatId: 'chat-1',
        appId: testAppId,
        teamId: testTeamId,
        tmbId: testTmbId,
        source: 'online',
        updateTime: now,
        title: 'Chat 1'
      },
      {
        chatId: 'chat-2',
        appId: testAppId,
        teamId: testTeamId,
        tmbId: testTmbId,
        source: 'online',
        updateTime: now,
        title: 'Chat 2'
      },
      {
        chatId: 'chat-3',
        appId: testAppId,
        teamId: testTeamId,
        tmbId: testTmbId,
        outLinkUid: 'external-user-1',
        source: 'share',
        updateTime: now,
        title: 'Chat 3'
      }
    ]);

    const dateStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const dateEnd = new Date(now.getTime() + 1000).toISOString();

    const res = await Call<GetLogUsersBody, {}, GetLogUsersResponse>(getUsers.default, {
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
    await MongoChat.create([
      {
        chatId: 'chat-search-1',
        appId: testAppId,
        teamId: testTeamId,
        tmbId: teamMember2._id,
        source: 'online',
        updateTime: now,
        title: 'Chat Search 1'
      },
      {
        chatId: 'chat-search-2',
        appId: testAppId,
        teamId: testTeamId,
        tmbId: testTmbId,
        outLinkUid: 'alice-user',
        source: 'share',
        updateTime: now,
        title: 'Chat Search 2'
      }
    ]);

    const dateStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const dateEnd = new Date(now.getTime() + 1000).toISOString();

    // Search for "John"
    const res = await Call<GetLogUsersBody, {}, GetLogUsersResponse>(getUsers.default, {
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
    const res2 = await Call<GetLogUsersBody, {}, GetLogUsersResponse>(getUsers.default, {
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

  it('should sort users by chat count descending', async () => {
    const now = new Date();

    // Create chats with different frequencies
    await MongoChat.create([
      // User A: 3 chats
      {
        chatId: 'sort-1',
        appId: testAppId,
        teamId: testTeamId,
        tmbId: testTmbId,
        outLinkUid: 'user-a',
        source: 'share',
        updateTime: now,
        title: 'Sort 1'
      },
      {
        chatId: 'sort-2',
        appId: testAppId,
        teamId: testTeamId,
        tmbId: testTmbId,
        outLinkUid: 'user-a',
        source: 'share',
        updateTime: now,
        title: 'Sort 2'
      },
      {
        chatId: 'sort-3',
        appId: testAppId,
        teamId: testTeamId,
        tmbId: testTmbId,
        outLinkUid: 'user-a',
        source: 'share',
        updateTime: now,
        title: 'Sort 3'
      },
      // User B: 1 chat
      {
        chatId: 'sort-4',
        appId: testAppId,
        teamId: testTeamId,
        tmbId: testTmbId,
        outLinkUid: 'user-b',
        source: 'share',
        updateTime: now,
        title: 'Sort 4'
      }
    ]);

    const dateStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const dateEnd = new Date(now.getTime() + 1000).toISOString();

    const res = await Call<GetLogUsersBody, {}, GetLogUsersResponse>(getUsers.default, {
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
    await MongoChat.create([
      {
        chatId: 'source-1',
        appId: testAppId,
        teamId: testTeamId,
        tmbId: testTmbId,
        outLinkUid: 'online-user',
        source: 'online',
        updateTime: now,
        title: 'Online Chat'
      },
      {
        chatId: 'source-2',
        appId: testAppId,
        teamId: testTeamId,
        tmbId: testTmbId,
        outLinkUid: 'share-user',
        source: 'share',
        updateTime: now,
        title: 'Share Chat'
      },
      {
        chatId: 'source-3',
        appId: testAppId,
        teamId: testTeamId,
        tmbId: testTmbId,
        outLinkUid: 'api-user',
        source: 'api',
        updateTime: now,
        title: 'API Chat'
      }
    ]);

    const dateStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const dateEnd = new Date(now.getTime() + 1000).toISOString();

    // Filter by 'share' source only
    const res = await Call<GetLogUsersBody, {}, GetLogUsersResponse>(getUsers.default, {
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
    const res2 = await Call<GetLogUsersBody, {}, GetLogUsersResponse>(getUsers.default, {
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
});

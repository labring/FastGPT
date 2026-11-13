import { beforeEach, describe, expect, it } from 'vitest';
import * as listTeamsApi from '@/pages/api/admin/team/list';
import { ERROR_ENUM } from '@fastgpt/global/common/error/errorCode';
import { CommonErrEnum } from '@fastgpt/global/common/error/code/common';
import { UserStatusEnum } from '@fastgpt/global/support/user/constant';
import {
  TeamMemberRoleEnum,
  TeamMemberStatusEnum
} from '@fastgpt/global/support/user/team/constant';
import { MongoUser } from '@fastgpt/service/support/user/schema';
import { MongoTeamMember } from '@fastgpt/service/support/user/team/teamMemberSchema';
import { MongoTeam } from '@fastgpt/service/support/user/team/teamSchema';
import { Call } from '@test/utils/request';

describe('GET /api/admin/team/list', () => {
  let rootUser: any;
  let normalUser: any;
  let rootTeam: any;
  let alphaTeam: any;
  let betaTeam: any;
  let normalTmb: any;

  beforeEach(async () => {
    [rootUser, normalUser] = await MongoUser.create([
      { username: 'root', password: 'password', status: UserStatusEnum.active },
      { username: 'bob', password: 'password', status: UserStatusEnum.active }
    ]);

    rootTeam = await MongoTeam.create({
      name: 'Root Base Team',
      ownerId: rootUser._id,
      createTime: new Date('2025-01-01T00:00:00Z')
    });
    alphaTeam = await MongoTeam.create({
      name: 'Alpha [Prod] Team',
      ownerId: normalUser._id,
      createTime: new Date('2026-01-01T00:00:00Z')
    });
    betaTeam = await MongoTeam.create({
      name: 'Beta Staging Team',
      ownerId: normalUser._id,
      createTime: new Date('2026-06-01T00:00:00Z')
    });
    await MongoTeam.create({
      name: 'Deleted Legacy Team',
      ownerId: normalUser._id,
      deleteTime: new Date()
    });

    normalTmb = await MongoTeamMember.create({
      teamId: alphaTeam._id,
      userId: normalUser._id,
      name: 'Bob',
      role: TeamMemberRoleEnum.owner,
      status: TeamMemberStatusEnum.active
    });
  });

  it('paginates all active teams without duplicates or skips while pinning current team first', async () => {
    const rootAuth = {
      userId: String(rootUser._id),
      teamId: String(rootTeam._id),
      tmbId: String(normalTmb._id),
      isRoot: true,
      sessionId: 'root-session'
    } as any;

    const allRes = await Call(listTeamsApi.default, {
      method: 'GET',
      query: {},
      auth: rootAuth
    });
    expect(allRes.code).toBe(200);
    expect(allRes.data.total).toBe(3);
    expect(
      allRes.data.list.map((t: any) => ({ teamName: t.teamName, isOwner: t.isOwner }))
    ).toEqual([
      { teamName: 'Root Base Team', isOwner: true },
      { teamName: 'Beta Staging Team', isOwner: false },
      { teamName: 'Alpha [Prod] Team', isOwner: false }
    ]);

    // 分页滚动：pageSize=1 连续按 offset=0,1,2 拉取全部 3 页，当前所在团队置顶且无遗漏、无重复；
    // 同时传入有效 offset 与无效 pageNum 时应忽略 pageNum 而非返回 400
    const page1 = await Call(listTeamsApi.default, {
      method: 'GET',
      query: { offset: '0', pageSize: '1', pageNum: '0' } as any,
      auth: rootAuth
    });
    const page2 = await Call(listTeamsApi.default, {
      method: 'GET',
      query: { offset: '1', pageSize: '1', pageNum: 'invalid' } as any,
      auth: rootAuth
    });
    const page3 = await Call(listTeamsApi.default, {
      method: 'GET',
      query: { pageNum: '3', pageSize: '1' },
      auth: rootAuth
    });
    expect(page1.data.total).toBe(3);
    expect(page1.data.list.map((t: any) => t.teamId)).toEqual([String(rootTeam._id)]);
    expect(page2.data.list.map((t: any) => t.teamId)).toEqual([String(betaTeam._id)]);
    expect(page3.data.list.map((t: any) => t.teamId)).toEqual([String(alphaTeam._id)]);

    // 即使切换到其他团队，自己作为 Owner 的团队仍然置顶，当前所在团队紧随其后
    const switchedAuth = {
      ...rootAuth,
      teamId: String(alphaTeam._id)
    };
    const switchedRes = await Call(listTeamsApi.default, {
      method: 'GET',
      query: {},
      auth: switchedAuth
    });
    expect(switchedRes.code).toBe(200);
    expect(
      switchedRes.data.list.map((t: any) => ({ teamName: t.teamName, isOwner: t.isOwner }))
    ).toEqual([
      { teamName: 'Root Base Team', isOwner: true },
      { teamName: 'Alpha [Prod] Team', isOwner: false },
      { teamName: 'Beta Staging Team', isOwner: false }
    ]);

    const searchRes = await Call(listTeamsApi.default, {
      method: 'GET',
      query: { search: '[Prod]' },
      auth: rootAuth
    });
    expect(searchRes.code).toBe(200);
    expect(searchRes.data.total).toBe(1);
    expect(searchRes.data.list).toHaveLength(1);
    expect(searchRes.data.list[0].teamId).toBe(String(alphaTeam._id));
    expect(searchRes.data.list[0].isOwner).toBe(false);

    // 搜索关键词同时命中自有团队与非自有团队时，自有团队仍置顶
    const searchTeamRes = await Call(listTeamsApi.default, {
      method: 'GET',
      query: { search: 'Team' },
      auth: rootAuth
    });
    expect(searchTeamRes.code).toBe(200);
    expect(
      searchTeamRes.data.list.map((t: any) => ({ teamName: t.teamName, isOwner: t.isOwner }))
    ).toEqual([
      { teamName: 'Root Base Team', isOwner: true },
      { teamName: 'Beta Staging Team', isOwner: false },
      { teamName: 'Alpha [Prod] Team', isOwner: false }
    ]);
  });

  it('rejects non-root callers and non-GET methods', async () => {
    const forbidden = await Call(listTeamsApi.default, {
      method: 'GET',
      query: {},
      auth: {
        userId: String(normalUser._id),
        teamId: String(alphaTeam._id),
        tmbId: String(normalTmb._id),
        isRoot: false,
        sessionId: 'bob-session'
      } as any
    });
    expect(forbidden.code).toBe(500);
    expect(forbidden.error).toBe(ERROR_ENUM.unAuthorization);

    const wrongMethod = await Call(listTeamsApi.default, {
      method: 'POST',
      query: {},
      auth: {
        userId: String(rootUser._id),
        teamId: String(rootTeam._id),
        tmbId: String(normalTmb._id),
        isRoot: true,
        sessionId: 'root-session'
      } as any
    });
    expect(wrongMethod.code).toBe(500);
    expect(wrongMethod.error).toBe(CommonErrEnum.invalidParams);
  });
});

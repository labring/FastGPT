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

  it('lists all active teams, filters safely with special regex chars and prepends active team when truncated', async () => {
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
    expect(allRes.data.list.map((t: any) => t.teamName)).toEqual([
      'Alpha [Prod] Team',
      'Root Base Team'
    ]);

    const searchRes = await Call(listTeamsApi.default, {
      method: 'GET',
      query: { search: '[Prod]' },
      auth: rootAuth
    });
    expect(searchRes.code).toBe(200);
    expect(searchRes.data.list).toHaveLength(1);
    expect(searchRes.data.list[0].teamId).toBe(String(alphaTeam._id));

    // limit=1 时最新是 Alpha Team，但当前所在团队是 Root Base Team，应置顶保留当前团队
    const truncatedRes = await Call(listTeamsApi.default, {
      method: 'GET',
      query: { limit: '1' },
      auth: rootAuth
    });
    expect(truncatedRes.code).toBe(200);
    expect(truncatedRes.data.list).toHaveLength(1);
    expect(truncatedRes.data.list[0].teamId).toBe(String(rootTeam._id));
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

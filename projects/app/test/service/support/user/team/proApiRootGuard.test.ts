import { beforeEach, describe, expect, it } from 'vitest';
import {
  filterProApiTeamReadPayload,
  isRootMemberForbiddenError,
  normalizeProApiSubPath,
  prepareProApiRootGuard
} from '@/service/support/user/team/proApiRootGuard';
import { TeamErrEnum } from '@fastgpt/global/common/error/code/team';
import {
  TeamMemberRoleEnum,
  TeamMemberStatusEnum
} from '@fastgpt/global/support/user/team/constant';
import { MongoUser } from '@fastgpt/service/support/user/schema';
import { ensureRootTeamMember } from '@fastgpt/service/support/user/team/controller';
import { MongoTeamMember } from '@fastgpt/service/support/user/team/teamMemberSchema';
import { MongoTeam } from '@fastgpt/service/support/user/team/teamSchema';

describe('proApiRootGuard', () => {
  let rootUser: any;
  let tenantOwner: any;
  let tenantTeam: any;
  let tenantOwnerTmb: any;
  let rootTmb: any;

  beforeEach(async () => {
    [rootUser, tenantOwner] = await MongoUser.create([
      { username: 'root', password: 'password' },
      { username: 'tenant-owner', password: 'password' }
    ]);
    tenantTeam = await MongoTeam.create({
      ownerId: tenantOwner._id,
      name: 'Tenant Team'
    });
    tenantOwnerTmb = await MongoTeamMember.create({
      teamId: tenantTeam._id,
      userId: tenantOwner._id,
      name: 'Owner',
      role: TeamMemberRoleEnum.owner,
      status: TeamMemberStatusEnum.active
    });
    const ensured = await ensureRootTeamMember({
      targetTeamId: String(tenantTeam._id),
      rootUserId: String(rootUser._id)
    });
    rootTmb = ensured.tmb;
  });

  it('normalizes proApi subPaths cleanly', () => {
    expect(normalizeProApiSubPath(['support', 'user', 'team', 'member', 'list'])).toBe(
      'support/user/team/member/list'
    );
    expect(normalizeProApiSubPath('support/user/team/member/count')).toBe(
      'support/user/team/member/count'
    );
    expect(normalizeProApiSubPath(undefined)).toBe('');
  });

  it('blocks tenant owner from deleting, mutating, changing permission or transferring ownership to root', async () => {
    const tenantAuth = {
      userId: String(tenantOwner._id),
      teamId: String(tenantTeam._id),
      tmbId: String(tenantOwnerTmb._id),
      isRoot: false,
      sessionId: 'tenant-session'
    };

    await expect(
      prepareProApiRootGuard({
        req: {
          method: 'DELETE',
          query: { tmbId: String(rootTmb._id) },
          auth: tenantAuth
        } as any,
        subPath: 'support/user/team/member/delete'
      })
    ).rejects.toBe(TeamErrEnum.unPermission);

    await expect(
      prepareProApiRootGuard({
        req: {
          method: 'PUT',
          query: {},
          body: { tmbId: String(rootTmb._id), name: 'hacked' },
          auth: tenantAuth
        } as any,
        subPath: 'support/user/team/member/updateNameByManager'
      })
    ).rejects.toBe(TeamErrEnum.unPermission);

    await expect(
      prepareProApiRootGuard({
        req: {
          method: 'POST',
          query: {},
          body: { collaborators: [{ tmbId: String(rootTmb._id), permission: 0 }] },
          auth: tenantAuth
        } as any,
        subPath: 'support/user/team/collaborator/update'
      })
    ).rejects.toBe(TeamErrEnum.unPermission);

    await expect(
      prepareProApiRootGuard({
        req: {
          method: 'PUT',
          query: {},
          body: { userId: String(rootUser._id) },
          auth: tenantAuth
        } as any,
        subPath: 'support/user/team/changeOwner'
      })
    ).rejects.toBe(TeamErrEnum.unPermission);

    expect(isRootMemberForbiddenError(TeamErrEnum.unPermission)).toBe(true);
    expect(isRootMemberForbiddenError(new Error('other'))).toBe(false);

    // 修改普通成员正常放行
    const allowedPlan = await prepareProApiRootGuard({
      req: {
        method: 'PUT',
        query: {},
        body: { tmbId: String(tenantOwnerTmb._id), name: 'New Name' },
        auth: tenantAuth
      } as any,
      subPath: 'support/user/team/member/updateNameByManager'
    });
    expect(allowedPlan.kind).toBe('guarded');
  });

  it('filters root out of member list, count, search and collaborator payloads for non-root callers while keeping passthrough for root', async () => {
    const tenantAuth = {
      userId: String(tenantOwner._id),
      teamId: String(tenantTeam._id),
      tmbId: String(tenantOwnerTmb._id),
      isRoot: false,
      sessionId: 'tenant-session'
    };

    const listPlan = await prepareProApiRootGuard({
      req: {
        method: 'POST',
        query: {},
        body: { pageNum: 1, pageSize: 20 },
        auth: tenantAuth
      } as any,
      subPath: 'support/user/team/member/list'
    });
    expect(listPlan.kind).toBe('guarded');
    if (listPlan.kind !== 'guarded' || !listPlan.transformJsonResponse) {
      throw new Error('Expected transformJsonResponse');
    }

    const filteredListJson = JSON.parse(
      listPlan.transformJsonResponse(
        JSON.stringify({
          code: 200,
          data: {
            total: 2,
            list: [
              {
                userId: String(tenantOwner._id),
                tmbId: String(tenantOwnerTmb._id),
                memberName: 'Owner'
              },
              { userId: String(rootUser._id), tmbId: String(rootTmb._id), memberName: 'root' }
            ]
          }
        })
      )
    );
    expect(filteredListJson.data.total).toBe(1);
    expect(filteredListJson.data.list).toEqual([
      { userId: String(tenantOwner._id), tmbId: String(tenantOwnerTmb._id), memberName: 'Owner' }
    ]);

    const foreignRoot = {
      rootUserId: String(rootUser._id),
      rootTmbId: String(rootTmb._id),
      rootStatus: TeamMemberStatusEnum.active
    };

    expect(
      filterProApiTeamReadPayload({
        subPath: 'support/user/team/member/count',
        payload: { code: 200, data: { count: 4 } },
        foreignRoot
      })
    ).toEqual({ code: 200, data: { count: 3 } });

    expect(
      filterProApiTeamReadPayload({
        subPath: 'support/user/team/searchMembersOrgsGroups',
        payload: {
          code: 200,
          data: {
            members: [
              { userId: String(rootUser._id), tmbId: String(rootTmb._id) },
              { userId: String(tenantOwner._id), tmbId: String(tenantOwnerTmb._id) }
            ],
            orgs: [],
            groups: []
          }
        },
        foreignRoot
      }).data.members
    ).toHaveLength(1);

    expect(
      filterProApiTeamReadPayload({
        subPath: 'support/user/team/collaborator/list',
        payload: {
          code: 200,
          data: {
            clbs: [
              { tmbId: String(rootTmb._id), permission: 4 },
              { tmbId: String(tenantOwnerTmb._id), permission: 4 }
            ]
          }
        },
        foreignRoot
      }).data.clbs
    ).toHaveLength(1);

    // root 本人请求直接 passthrough，不做隐藏或拦截
    const rootPlan = await prepareProApiRootGuard({
      req: {
        method: 'POST',
        query: {},
        body: { pageNum: 1, pageSize: 20 },
        auth: {
          userId: String(rootUser._id),
          teamId: String(tenantTeam._id),
          tmbId: String(rootTmb._id),
          isRoot: true,
          sessionId: 'root-session'
        }
      } as any,
      subPath: 'support/user/team/member/list'
    });
    expect(rootPlan.kind).toBe('passthrough');
  });
});

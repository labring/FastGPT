import { serviceEnv } from '@fastgpt/service/env';
import {
  TeamApikeyCreateRoleVal,
  TeamAppCreateRoleVal,
  TeamDatasetCreateRoleVal,
  TeamSkillCreateRoleVal
} from '@fastgpt/global/support/permission/user/constant';

import { DefaultGroupName } from '@fastgpt/global/support/user/team/group/constant';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';

import { MongoMemberGroupModel } from '@fastgpt/service/support/permission/memberGroup/memberGroupSchema';
import { MongoOrgModel } from '@fastgpt/service/support/permission/org/orgSchema';
import { resourcePermissionRepo } from '@fastgpt/service/support/permission/repository/resourcePermissionRepo';
import { MongoResourcePermission } from '@fastgpt/service/support/permission/schema';
import { MongoUser } from '@fastgpt/service/support/user/schema';
import {
  assertTargetMemberNotRoot,
  countEffectiveTeamMembers,
  createDefaultTeam,
  createUserLoginTeam,
  ensureRootTeamMember,
  getForeignRootMemberInfo,
  getTeamOwner,
  getTmbInfoByTmbId,
  updateTeam
} from '@fastgpt/service/support/user/team/controller';
import { checkTeamMemberLimit } from '@fastgpt/service/support/permission/teamLimit';
import * as walletSubUtils from '@fastgpt/service/support/wallet/sub/utils';
import { CommonErrEnum } from '@fastgpt/global/common/error/code/common';
import { TeamErrEnum } from '@fastgpt/global/common/error/code/team';
import {
  TeamMemberRoleEnum,
  TeamMemberStatusEnum
} from '@fastgpt/global/support/user/team/constant';
import { MongoTeamMember } from '@fastgpt/service/support/user/team/teamMemberSchema';
import { MongoTeam } from '@fastgpt/service/support/user/team/teamSchema';
import { MongoTeamSub } from '@fastgpt/service/support/wallet/sub/schema';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.unmock(import('@fastgpt/service/common/mongo/sessionRun'));

const originalDefaultPermissionsEnabled = serviceEnv.DEFAULT_TEAM_BASIC_PERMISSIONS_ENABLED;
const defaultBasicRole =
  TeamAppCreateRoleVal |
  TeamSkillCreateRoleVal |
  TeamDatasetCreateRoleVal |
  TeamApikeyCreateRoleVal;
const setDefaultPermissionsEnabled = (enabled: boolean) =>
  Reflect.set(serviceEnv, 'DEFAULT_TEAM_BASIC_PERMISSIONS_ENABLED', enabled);

describe('createDefaultTeam', () => {
  beforeEach(() => {
    setDefaultPermissionsEnabled(true);
  });

  afterEach(() => {
    setDefaultPermissionsEnabled(originalDefaultPermissionsEnabled);
    vi.restoreAllMocks();
  });

  it('creates the root team and initializes its default group permissions', async () => {
    const owner = await MongoUser.create({
      username: 'root-team-owner',
      password: 'password'
    });

    const member = await mongoSessionRun((session) =>
      createDefaultTeam({
        userId: String(owner._id),
        teamName: 'Root team',
        avatar: '/root-team.svg',
        session
      })
    );
    const teamId = String(member?.teamId);
    const [team, group, rootOrg] = await Promise.all([
      MongoTeam.findById(teamId).lean(),
      MongoMemberGroupModel.findOne({ teamId, name: DefaultGroupName }).lean(),
      MongoOrgModel.findOne({ teamId, path: '' }).lean()
    ]);
    const permission = await MongoResourcePermission.findOne({
      teamId,
      groupId: group?._id,
      resourceType: 'team',
      resourceId: null
    }).lean();

    expect(member).toMatchObject({ name: 'Owner', role: 'owner', status: 'active' });
    expect(team).toMatchObject({ name: 'Root team', avatar: '/root-team.svg' });
    expect(String(team?.ownerId)).toBe(String(owner._id));
    expect(group).toMatchObject({ name: DefaultGroupName, avatar: '/root-team.svg' });
    expect(rootOrg).not.toBeNull();
    expect(permission?.permission).toBe(defaultBasicRole);
  });

  it('rolls back the root team when default permission initialization fails', async () => {
    const owner = await MongoUser.create({
      username: 'root-team-rollback-owner',
      password: 'password'
    });
    vi.spyOn(resourcePermissionRepo, 'updateCollaborator').mockRejectedValueOnce(
      new Error('permission write failed')
    );

    await expect(
      mongoSessionRun((session) =>
        createDefaultTeam({
          userId: String(owner._id),
          teamName: 'Rollback root team',
          session
        })
      )
    ).rejects.toThrow('permission write failed');

    await expect(
      Promise.all([
        MongoTeam.findOne({ ownerId: owner._id }).lean(),
        MongoTeamMember.findOne({ userId: owner._id }).lean(),
        MongoMemberGroupModel.findOne({ teamId: { $ne: null } }).lean(),
        MongoResourcePermission.findOne({ teamId: { $ne: null } }).lean(),
        MongoOrgModel.findOne({ teamId: { $ne: null } }).lean()
      ])
    ).resolves.toEqual([null, null, null, null, null]);
  });
});

describe('createUserLoginTeam', () => {
  afterEach(() => {
    setDefaultPermissionsEnabled(originalDefaultPermissionsEnabled);
  });

  it.each([true, false])(
    'applies default group creation permissions to ordinary members when enabled is %s',
    async (enabled) => {
      setDefaultPermissionsEnabled(enabled);
      const owner = await MongoUser.create({ username: 'fallback-owner', password: 'password' });
      const user = await MongoUser.create({ username: 'fallback-member', password: 'password' });

      const ownerTmbId = await mongoSessionRun((session) =>
        createUserLoginTeam({ userId: String(owner._id), username: owner.username, session })
      );
      const ownerTmb = await MongoTeamMember.findById(ownerTmbId).orFail().lean();
      const teamId = String(ownerTmb.teamId);
      const group = await MongoMemberGroupModel.findOne({ teamId, name: DefaultGroupName })
        .orFail()
        .lean();
      const acl = await MongoResourcePermission.findOne({
        teamId,
        groupId: group._id,
        resourceType: 'team',
        resourceId: null
      }).lean();
      const member = await MongoTeamMember.create({
        teamId,
        userId: user._id,
        name: 'Member',
        status: 'active'
      });
      const { permission } = await getTmbInfoByTmbId({ tmbId: String(member._id) });

      expect(acl?.permission ?? null).toBe(enabled ? defaultBasicRole : null);
      expect(permission).toMatchObject({
        hasAppCreatePer: enabled,
        hasSkillCreatePer: enabled,
        hasDatasetCreatePer: enabled,
        hasApikeyCreatePer: enabled,
        hasManagePer: false
      });
    }
  );

  it('rolls back the fallback team and default permissions with the caller transaction', async () => {
    setDefaultPermissionsEnabled(true);
    const owner = await MongoUser.create({ username: 'fallback-rollback', password: 'password' });

    await expect(
      mongoSessionRun(async (session) => {
        await createUserLoginTeam({ userId: String(owner._id), username: owner.username, session });
        throw new Error('caller transaction failed');
      })
    ).rejects.toThrow('caller transaction failed');

    await expect(
      Promise.all([
        MongoTeam.findOne({ ownerId: owner._id }).lean(),
        MongoTeamMember.findOne({ userId: owner._id }).lean(),
        MongoMemberGroupModel.findOne({}).lean(),
        MongoResourcePermission.findOne({}).lean(),
        MongoOrgModel.findOne({}).lean(),
        MongoTeamSub.findOne({}).lean()
      ])
    ).resolves.toEqual([null, null, null, null, null, null]);
  });
});

describe('updateTeam', () => {
  afterEach(() => vi.restoreAllMocks());

  it('clears the AI account without an empty $set', async () => {
    const team = await MongoTeam.create({
      name: 'AI account team',
      openaiAccount: { key: 'existing-key', baseUrl: 'https://api.openai.com/v1' }
    });
    const update = vi.spyOn(MongoTeam, 'findByIdAndUpdate');

    await updateTeam({ teamId: String(team._id), openaiAccount: { key: '', baseUrl: '' } });

    expect(update).toHaveBeenCalledExactlyOnceWith(
      String(team._id),
      { $unset: { openaiAccount: 1 } },
      { session: expect.anything() }
    );
    expect((await MongoTeam.findById(team._id).lean())?.openaiAccount).toBeUndefined();
  });

  it('clears a workflow variable without an empty $set', async () => {
    const team = await MongoTeam.create({
      name: 'Workflow variable team',
      externalWorkflowVariables: { testVar: 'existing-value' }
    });
    const update = vi.spyOn(MongoTeam, 'findByIdAndUpdate');

    await updateTeam({
      teamId: String(team._id),
      externalWorkflowVariable: { key: 'testVar', value: '' }
    });

    expect(update).toHaveBeenCalledExactlyOnceWith(
      String(team._id),
      { $unset: { 'externalWorkflowVariables.testVar': 1 } },
      { session: expect.anything() }
    );
    expect(
      (await MongoTeam.findById(team._id).lean())?.externalWorkflowVariables
    ).not.toHaveProperty('testVar');
  });

  it('reads the team without issuing an empty update', async () => {
    const team = await MongoTeam.create({ name: 'Unchanged team' });
    const update = vi.spyOn(MongoTeam, 'findByIdAndUpdate');
    const read = vi.spyOn(MongoTeam, 'findById');

    await updateTeam({ teamId: String(team._id) });

    expect(update).not.toHaveBeenCalled();
    expect(read).toHaveBeenCalledExactlyOnceWith(String(team._id));
    expect((await MongoTeam.findById(team._id).lean())?.name).toBe('Unchanged team');
  });

  it('preserves non-empty team updates', async () => {
    const team = await MongoTeam.create({ name: 'Original team' });
    const update = vi.spyOn(MongoTeam, 'findByIdAndUpdate');

    await updateTeam({ teamId: String(team._id), name: 'Renamed team' });

    expect(update).toHaveBeenCalledExactlyOnceWith(
      String(team._id),
      { $set: { name: 'Renamed team' } },
      { session: expect.anything() }
    );
    expect((await MongoTeam.findById(team._id).lean())?.name).toBe('Renamed team');
  });
});

describe('root cross-team member helpers', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('provisions a persistent JIT root member without overwriting tenant team owner', async () => {
    const [rootUser, tenantOwner] = await MongoUser.create([
      { username: 'root', password: 'password' },
      { username: 'tenant-alice', password: 'password' }
    ]);
    const tenantTeam = await MongoTeam.create({
      ownerId: tenantOwner._id,
      name: 'Alice Tenant Team'
    });
    const tenantOwnerTmb = await MongoTeamMember.create({
      teamId: tenantTeam._id,
      userId: tenantOwner._id,
      name: 'Alice',
      role: TeamMemberRoleEnum.owner,
      status: TeamMemberStatusEnum.active,
      isSetMemberName: true
    });

    const { team, tmb } = await ensureRootTeamMember({
      targetTeamId: String(tenantTeam._id),
      rootUserId: String(rootUser._id)
    });

    expect(String(team._id)).toBe(String(tenantTeam._id));
    expect(tmb.status).toBe(TeamMemberStatusEnum.active);
    expect(tmb.name).toBe('root');
    expect(tmb.isSetMemberName).toBe(true);
    // 跨租户团队不应持久化写入 role='owner'，保证真实 owner 唯一
    expect(tmb.role).toBeUndefined();

    const resolvedOwner = await getTeamOwner(String(tenantTeam._id));
    expect(String(resolvedOwner?._id)).toBe(String(tenantOwnerTmb._id));

    const rootTmbInfo = await getTmbInfoByTmbId({ tmbId: String(tmb._id) });
    expect(rootTmbInfo.permission.isOwner).toBe(true);
    expect(rootTmbInfo.permission.hasManagePer).toBe(true);
  });

  it('reactivates non-active root member and preserves owner role on root own team', async () => {
    const rootUser = await MongoUser.create({ username: 'root', password: 'password' });
    const rootOwnTeam = await MongoTeam.create({
      ownerId: rootUser._id,
      name: 'Root Own Team'
    });
    await MongoTeamMember.create({
      teamId: rootOwnTeam._id,
      userId: rootUser._id,
      name: 'Owner',
      role: TeamMemberRoleEnum.owner,
      status: TeamMemberStatusEnum.forbidden,
      isSetMemberName: true
    });

    const { tmb } = await ensureRootTeamMember({
      targetTeamId: String(rootOwnTeam._id),
      rootUserId: String(rootUser._id)
    });

    expect(tmb.status).toBe(TeamMemberStatusEnum.active);
    expect(tmb.role).toBe(TeamMemberRoleEnum.owner);
  });

  it('rejects deleted or missing teams and recovers from duplicate-key race', async () => {
    const [rootUser, tenantOwner] = await MongoUser.create([
      { username: 'root', password: 'password' },
      { username: 'race-owner', password: 'password' }
    ]);
    const deletedTeam = await MongoTeam.create({
      ownerId: tenantOwner._id,
      name: 'Deleted Team',
      deleteTime: new Date()
    });

    await expect(
      ensureRootTeamMember({
        targetTeamId: String(deletedTeam._id),
        rootUserId: String(rootUser._id)
      })
    ).rejects.toBe(CommonErrEnum.invalidResource);

    const activeTeam = await MongoTeam.create({
      ownerId: tenantOwner._id,
      name: 'Race Team'
    });
    await MongoTeamMember.create({
      teamId: activeTeam._id,
      userId: rootUser._id,
      name: 'root',
      status: TeamMemberStatusEnum.leave,
      isSetMemberName: true
    });

    const origFindOneAndUpdate = MongoTeamMember.findOneAndUpdate.bind(MongoTeamMember);
    vi.spyOn(MongoTeamMember, 'findOneAndUpdate')
      .mockImplementationOnce((() => ({
        lean: () => Promise.reject(Object.assign(new Error('dup key'), { code: 11000 }))
      })) as any)
      .mockImplementation(origFindOneAndUpdate as any);

    const recovered = await ensureRootTeamMember({
      targetTeamId: String(activeTeam._id),
      rootUserId: String(rootUser._id)
    });
    expect(recovered.tmb.status).toBe(TeamMemberStatusEnum.active);
  });

  it('excludes foreign root JIT member from seat counts and quota limits', async () => {
    const [rootUser, tenantOwner, memberB] = await MongoUser.create([
      { username: 'root', password: 'password' },
      { username: 'quota-owner', password: 'password' },
      { username: 'quota-member', password: 'password' }
    ]);
    const tenantTeam = await MongoTeam.create({
      ownerId: tenantOwner._id,
      name: 'Quota Team'
    });
    await MongoTeamMember.create([
      {
        teamId: tenantTeam._id,
        userId: tenantOwner._id,
        name: 'Owner',
        role: TeamMemberRoleEnum.owner,
        status: TeamMemberStatusEnum.active
      },
      {
        teamId: tenantTeam._id,
        userId: memberB._id,
        name: 'Bob',
        status: TeamMemberStatusEnum.active
      }
    ]);

    // 即使团队套餐上限为 2（已满员），root 仍可进入，且有效席位数仍为 2
    vi.spyOn(walletSubUtils, 'getTeamStandPlan').mockResolvedValue({
      standard: { maxTeamMember: 2 }
    } as any);

    await ensureRootTeamMember({
      targetTeamId: String(tenantTeam._id),
      rootUserId: String(rootUser._id)
    });

    expect(await countEffectiveTeamMembers(String(tenantTeam._id))).toBe(2);
    await expect(checkTeamMemberLimit(String(tenantTeam._id), 0)).resolves.toBeUndefined();
    await expect(checkTeamMemberLimit(String(tenantTeam._id), 1)).rejects.toBe(
      TeamErrEnum.teamOverSize
    );
  });

  it('protects root member from mutation and identifies foreign root info accurately', async () => {
    const [rootUser, tenantOwner] = await MongoUser.create([
      { username: 'root', password: 'password' },
      { username: 'guard-owner', password: 'password' }
    ]);
    const [rootTeam, tenantTeam] = await MongoTeam.create([
      { ownerId: rootUser._id, name: 'Root Team' },
      { ownerId: tenantOwner._id, name: 'Guard Tenant Team' }
    ]);
    const tenantOwnerTmb = await MongoTeamMember.create({
      teamId: tenantTeam._id,
      userId: tenantOwner._id,
      name: 'Guard Owner',
      role: TeamMemberRoleEnum.owner,
      status: TeamMemberStatusEnum.active
    });
    const { tmb: rootTmb } = await ensureRootTeamMember({
      targetTeamId: String(tenantTeam._id),
      rootUserId: String(rootUser._id)
    });

    expect(await getForeignRootMemberInfo(String(rootTeam._id))).toBeNull();
    expect(await getForeignRootMemberInfo(String(tenantTeam._id))).toEqual({
      rootUserId: String(rootUser._id),
      rootTmbId: String(rootTmb._id),
      rootStatus: TeamMemberStatusEnum.active
    });

    await expect(
      assertTargetMemberNotRoot({ tmbIds: [String(tenantOwnerTmb._id)] })
    ).resolves.toBeUndefined();
    await expect(assertTargetMemberNotRoot({ tmbIds: [String(rootTmb._id)] })).rejects.toBe(
      TeamErrEnum.unPermission
    );
    await expect(assertTargetMemberNotRoot({ userIds: [String(rootUser._id)] })).rejects.toBe(
      TeamErrEnum.unPermission
    );
  });
});

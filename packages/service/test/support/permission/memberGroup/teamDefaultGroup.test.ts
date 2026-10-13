import { TeamPermission } from '@fastgpt/global/support/permission/user/controller';
import {
  TeamAppCreateRoleVal,
  TeamDatasetCreateRoleVal,
  TeamSkillCreateRoleVal
} from '@fastgpt/global/support/permission/user/constant';
import { DefaultGroupName } from '@fastgpt/global/support/user/team/group/constant';
import { PerResourceTypeEnum } from '@fastgpt/global/support/permission/constant';
import { Types } from '@fastgpt/service/common/mongo';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { serviceEnv } from '@fastgpt/service/env';
import { getTmbPermission } from '@fastgpt/service/support/permission/controller';
import { MongoMemberGroupModel } from '@fastgpt/service/support/permission/memberGroup/memberGroupSchema';
import { createTeamDefaultGroup } from '@fastgpt/service/support/permission/memberGroup/teamDefaultGroup';
import { resourcePermissionRepo } from '@fastgpt/service/support/permission/repository/resourcePermissionRepo';
import { MongoResourcePermission } from '@fastgpt/service/support/permission/schema';
import { MongoTeamMember } from '@fastgpt/service/support/user/team/teamMemberSchema';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.unmock(import('@fastgpt/service/common/mongo/sessionRun'));

const originalDefaultPermissionsEnabled = serviceEnv.DEFAULT_TEAM_BASIC_PERMISSIONS_ENABLED;
const defaultBasicRole = TeamAppCreateRoleVal | TeamSkillCreateRoleVal | TeamDatasetCreateRoleVal;
const setDefaultPermissionsEnabled = (enabled: boolean) =>
  Reflect.set(serviceEnv, 'DEFAULT_TEAM_BASIC_PERMISSIONS_ENABLED', enabled);

describe('createTeamDefaultGroup', () => {
  beforeEach(() => {
    setDefaultPermissionsEnabled(false);
  });

  afterEach(() => {
    setDefaultPermissionsEnabled(originalDefaultPermissionsEnabled);
    vi.restoreAllMocks();
  });

  it('creates only the default group when basic permissions are disabled', async () => {
    const teamId = String(new Types.ObjectId());

    const group = await createTeamDefaultGroup({
      teamId,
      avatar: '/default-team.svg'
    });

    expect(group).toMatchObject({
      name: DefaultGroupName,
      avatar: '/default-team.svg'
    });
    await expect(MongoResourcePermission.findOne({ teamId }).lean()).resolves.toBeNull();
  });

  it('grants the configured basic roles using the caller transaction', async () => {
    setDefaultPermissionsEnabled(true);
    const teamId = String(new Types.ObjectId());

    const group = await mongoSessionRun((session) => createTeamDefaultGroup({ teamId, session }));
    const permissionRow = await MongoResourcePermission.findOne({
      teamId,
      groupId: group._id,
      resourceType: 'team',
      resourceId: null
    }).lean();

    expect(permissionRow?.permission).toBe(defaultBasicRole);

    const permission = new TeamPermission({ role: permissionRow?.permission });
    expect(permission.hasAppCreatePer).toBe(true);
    expect(permission.hasSkillCreatePer).toBe(true);
    expect(permission.hasDatasetCreatePer).toBe(true);
    expect(permission.hasApikeyCreatePer).toBe(false);
    expect(permission.hasManagePer).toBe(false);
  });

  it('allows an ordinary member to inherit the default group basic permissions', async () => {
    setDefaultPermissionsEnabled(true);
    const teamId = String(new Types.ObjectId());
    const member = await MongoTeamMember.create({
      teamId,
      userId: new Types.ObjectId(),
      name: 'Member',
      status: 'active'
    });
    await createTeamDefaultGroup({ teamId });

    const role = await getTmbPermission({
      resourceType: PerResourceTypeEnum.team,
      teamId,
      tmbId: String(member._id)
    });
    const permission = new TeamPermission({ role });

    expect(role).toBe(defaultBasicRole);
    expect(permission.hasAppCreatePer).toBe(true);
    expect(permission.hasSkillCreatePer).toBe(true);
    expect(permission.hasDatasetCreatePer).toBe(true);
    expect(permission.hasApikeyCreatePer).toBe(false);
    expect(permission.hasManagePer).toBe(false);
  });

  it('rolls back the group and permissions when the caller transaction fails', async () => {
    setDefaultPermissionsEnabled(true);
    const teamId = String(new Types.ObjectId());

    await expect(
      mongoSessionRun(async (session) => {
        await createTeamDefaultGroup({ teamId, session });
        throw new Error('caller transaction failed');
      })
    ).rejects.toThrow('caller transaction failed');

    await expect(
      Promise.all([
        MongoMemberGroupModel.findOne({ teamId, name: DefaultGroupName }).lean(),
        MongoResourcePermission.findOne({ teamId, resourceType: 'team' }).lean()
      ])
    ).resolves.toEqual([null, null]);
  });

  it('rolls back the default group when permission initialization fails', async () => {
    setDefaultPermissionsEnabled(true);
    const teamId = String(new Types.ObjectId());
    vi.spyOn(resourcePermissionRepo, 'updateCollaborator').mockRejectedValueOnce(
      new Error('permission write failed')
    );

    await expect(createTeamDefaultGroup({ teamId })).rejects.toThrow('permission write failed');
    await expect(
      MongoMemberGroupModel.findOne({ teamId, name: DefaultGroupName }).lean()
    ).resolves.toBeNull();
  });
});

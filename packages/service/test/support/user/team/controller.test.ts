import {
  getTestInstanceConfig,
  createDefaultInstanceConfig
} from '@test/utils/instanceConfigSnapshot';
import {
  TeamApikeyCreateRoleVal,
  TeamAppCreateRoleVal,
  TeamDatasetCreateRoleVal,
  TeamSkillCreateRoleVal
} from '@fastgpt/global/support/permission/user/constant';

(global as any).systemInstanceConfig = createDefaultInstanceConfig();

import { DefaultGroupName } from '@fastgpt/global/support/user/team/group/constant';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';

import { MongoMemberGroupModel } from '@fastgpt/service/support/permission/memberGroup/memberGroupSchema';
import { MongoOrgModel } from '@fastgpt/service/support/permission/org/orgSchema';
import { resourcePermissionRepo } from '@fastgpt/service/support/permission/repository/resourcePermissionRepo';
import { MongoResourcePermission } from '@fastgpt/service/support/permission/schema';
import { MongoUser } from '@fastgpt/service/support/user/schema';
import { createDefaultTeam, updateTeam } from '@fastgpt/service/support/user/team/controller';
import { MongoTeamMember } from '@fastgpt/service/support/user/team/teamMemberSchema';
import { MongoTeam } from '@fastgpt/service/support/user/team/teamSchema';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.unmock(import('@fastgpt/service/common/mongo/sessionRun'));

const originalDefaultPermissionsEnabled =
  getTestInstanceConfig().auth.defaultTeamBasicPermissionsEnabled;
const defaultBasicRole =
  TeamAppCreateRoleVal |
  TeamSkillCreateRoleVal |
  TeamDatasetCreateRoleVal |
  TeamApikeyCreateRoleVal;
const setDefaultPermissionsEnabled = (enabled: boolean) =>
  (getTestInstanceConfig().auth.defaultTeamBasicPermissionsEnabled = enabled);

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

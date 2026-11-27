import { AgentSkillSourceEnum, AgentSkillTypeEnum } from '@fastgpt/global/core/ai/skill/constants';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import { DatasetCollectionTypeEnum, DatasetTypeEnum } from '@fastgpt/global/core/dataset/constants';
import { TeamErrEnum } from '@fastgpt/global/common/error/code/team';
import { ApiKeyTypeEnum } from '@fastgpt/global/support/openapi/constants';
import { PublishChannelEnum } from '@fastgpt/global/support/outLink/constant';
import { AppReadChatLogRoleVal } from '@fastgpt/global/support/permission/app/constant';
import {
  ManagePermissionVal,
  NullRoleVal,
  OwnerRoleVal,
  PerResourceTypeEnum,
  ReadPermissionVal,
  WritePermissionVal
} from '@fastgpt/global/support/permission/constant';
import { GroupMemberRole } from '@fastgpt/global/support/permission/memberGroup/constant';
import {
  TeamAppCreatePermissionVal,
  TeamManagePermissionVal
} from '@fastgpt/global/support/permission/user/constant';
import { sumPer } from '@fastgpt/global/support/permission/utils';
import { TeamMemberStatusEnum } from '@fastgpt/global/support/user/team/constant';
import { MongoAgentSkills } from '@fastgpt/service/core/ai/skill/model/schema';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { MongoDatasetCollection } from '@fastgpt/service/core/dataset/collection/schema';
import { MongoDataset } from '@fastgpt/service/core/dataset/schema';
import { MongoOpenApi } from '@fastgpt/service/support/openapi/schema';
import { MongoOutLink } from '@fastgpt/service/support/outLink/schema';
import { MongoGroupMemberModel } from '@fastgpt/service/support/permission/memberGroup/groupMemberSchema';
import { MongoMemberGroupModel } from '@fastgpt/service/support/permission/memberGroup/memberGroupSchema';
import { MongoResourcePermission } from '@fastgpt/service/support/permission/schema';
import { MongoTeamMember } from '@fastgpt/service/support/user/team/teamMemberSchema';
import { MongoTeam } from '@fastgpt/service/support/user/team/teamSchema';
import { MongoUser } from '@fastgpt/service/support/user/schema';
import { transferTeamMemberResources } from '@fastgpt/service/support/user/team/transfer';
import { getFakeUsers } from '@test/datas/users';
import { describe, expect, it } from 'vitest';

describe('transferTeamMemberResources', () => {
  it('transfers owned resources, merges resource permissions, disables personal keys, and hands over app keys to app owners', async () => {
    const {
      owner,
      members: [leavingMember, targetMember]
    } = await getFakeUsers(2);
    const teamId = owner.teamId;

    // 成员组：groupA 接收人已是普通成员；groupB 接收人尚未加入。
    const [groupA, groupB] = await MongoMemberGroupModel.create([
      { teamId, name: 'Group A' },
      { teamId, name: 'Group B' }
    ]);
    await MongoGroupMemberModel.create([
      { groupId: groupA._id, tmbId: leavingMember.tmbId, role: GroupMemberRole.owner },
      { groupId: groupA._id, tmbId: targetMember.tmbId, role: GroupMemberRole.member },
      { groupId: groupB._id, tmbId: leavingMember.tmbId, role: GroupMemberRole.owner }
    ]);

    // 应用、外链、知识库（开启集合权限 / 关闭集合权限 / 托管同步）、集合与技能。
    const [ownedApp, ownerApp, deniedApp] = await MongoApp.create([
      { teamId, tmbId: leavingMember.tmbId, name: 'Leaving App', type: AppTypeEnum.simple },
      { teamId, tmbId: owner.tmbId, name: 'Owner Shared App', type: AppTypeEnum.simple },
      { teamId, tmbId: owner.tmbId, name: 'Denied App', type: AppTypeEnum.simple }
    ]);
    const [ownAppOutLink, otherAppOutLink] = await MongoOutLink.create([
      {
        shareId: `share-own-${Date.now()}`,
        teamId,
        tmbId: leavingMember.tmbId,
        appId: ownedApp._id,
        type: PublishChannelEnum.share,
        name: 'Own App Share'
      },
      {
        shareId: `share-other-${Date.now()}`,
        teamId,
        tmbId: leavingMember.tmbId,
        appId: ownerApp._id,
        type: PublishChannelEnum.share,
        name: 'Other App Share'
      }
    ]);

    const [enabledDataset, disabledDataset, managedDataset, ownerSharedDataset] =
      await MongoDataset.create([
        {
          teamId,
          tmbId: leavingMember.tmbId,
          name: 'Enabled Collection Dataset',
          type: DatasetTypeEnum.dataset,
          collectionPermissionEnabled: true
        },
        {
          teamId,
          tmbId: leavingMember.tmbId,
          name: 'Disabled Collection Dataset',
          type: DatasetTypeEnum.dataset,
          collectionPermissionEnabled: false
        },
        {
          teamId,
          tmbId: leavingMember.tmbId,
          name: 'Managed Sync Dataset',
          type: DatasetTypeEnum.feishu,
          collectionPermissionEnabled: true,
          apiDatasetServer: { permissionSync: true }
        },
        {
          teamId,
          tmbId: owner.tmbId,
          name: 'Owner Shared Dataset',
          type: DatasetTypeEnum.dataset
        }
      ]);

    const [enabledCol, disabledCol, managedCol] = await MongoDatasetCollection.create([
      {
        teamId,
        tmbId: leavingMember.tmbId,
        datasetId: enabledDataset._id,
        type: DatasetCollectionTypeEnum.virtual,
        name: 'Enabled Col'
      },
      {
        teamId,
        tmbId: leavingMember.tmbId,
        datasetId: disabledDataset._id,
        type: DatasetCollectionTypeEnum.virtual,
        name: 'Disabled Col'
      },
      {
        teamId,
        tmbId: leavingMember.tmbId,
        datasetId: managedDataset._id,
        type: DatasetCollectionTypeEnum.virtual,
        name: 'Managed Col'
      }
    ]);

    const ownedSkill = await MongoAgentSkills.create({
      teamId,
      tmbId: leavingMember.tmbId,
      name: 'Leaving Skill',
      source: AgentSkillSourceEnum.personal,
      type: AgentSkillTypeEnum.skill
    });

    const [personalKey, ownAppKey, otherAppKey] = await MongoOpenApi.create([
      {
        teamId,
        tmbId: leavingMember.tmbId,
        type: ApiKeyTypeEnum.personal,
        apiKey: `fastgpt-personal-${Date.now()}`,
        name: 'Personal Key'
      },
      {
        teamId,
        tmbId: leavingMember.tmbId,
        type: ApiKeyTypeEnum.app,
        appId: ownedApp._id,
        apiKey: `fastgpt-own-app-${Date.now()}`,
        name: 'Own App Key'
      },
      {
        teamId,
        tmbId: leavingMember.tmbId,
        type: ApiKeyTypeEnum.app,
        appId: ownerApp._id,
        apiKey: `fastgpt-other-app-${Date.now()}`,
        name: 'Other App Key'
      }
    ]);

    // 权限：重叠权限合并、OwnerRoleVal 无溢出合并、NullRoleVal 不转移、团队权限不转移、模型权限合并。
    await MongoResourcePermission.create([
      {
        teamId,
        tmbId: leavingMember.tmbId,
        resourceType: PerResourceTypeEnum.app,
        resourceId: ownedApp._id,
        permission: OwnerRoleVal
      },
      {
        teamId,
        tmbId: targetMember.tmbId,
        resourceType: PerResourceTypeEnum.app,
        resourceId: ownedApp._id,
        permission: ReadPermissionVal
      },
      {
        teamId,
        tmbId: leavingMember.tmbId,
        resourceType: PerResourceTypeEnum.app,
        resourceId: ownerApp._id,
        permission: WritePermissionVal
      },
      {
        teamId,
        tmbId: targetMember.tmbId,
        resourceType: PerResourceTypeEnum.app,
        resourceId: ownerApp._id,
        permission: sumPer(ReadPermissionVal, AppReadChatLogRoleVal)
      },
      {
        teamId,
        tmbId: leavingMember.tmbId,
        resourceType: PerResourceTypeEnum.app,
        resourceId: deniedApp._id,
        permission: NullRoleVal
      },
      {
        teamId,
        tmbId: leavingMember.tmbId,
        resourceType: PerResourceTypeEnum.dataset,
        resourceId: ownerSharedDataset._id,
        permission: ManagePermissionVal
      },
      {
        teamId,
        tmbId: leavingMember.tmbId,
        resourceType: PerResourceTypeEnum.collection,
        resourceId: managedCol._id,
        permission: WritePermissionVal
      },
      {
        teamId,
        tmbId: leavingMember.tmbId,
        resourceType: PerResourceTypeEnum.model,
        resourceName: 'gpt-4o-mini',
        permission: ReadPermissionVal
      },
      {
        teamId,
        tmbId: leavingMember.tmbId,
        resourceType: PerResourceTypeEnum.team,
        resourceId: null,
        permission: sumPer(TeamManagePermissionVal, TeamAppCreatePermissionVal)
      }
    ]);

    const result = await transferTeamMemberResources({
      teamId,
      fromTmbId: leavingMember.tmbId,
      toTmbId: targetMember.tmbId
    });

    expect(result.targetTmbId).toBe(targetMember.tmbId);
    expect(result.isTargetTeamOwner).toBe(false);
    expect(result.disabledPersonalApiKeyCount).toBe(1);
    expect(result.appKeyChanges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          keyId: String(ownAppKey._id),
          fromTmbId: leavingMember.tmbId,
          toTmbId: targetMember.tmbId
        }),
        expect.objectContaining({
          keyId: String(otherAppKey._id),
          fromTmbId: leavingMember.tmbId,
          toTmbId: owner.tmbId
        })
      ])
    );

    // 成员组所有权完整转移且不留双 owner。
    const groupARows = await MongoGroupMemberModel.find({ groupId: groupA._id }).lean();
    expect(groupARows).toHaveLength(1);
    expect(String(groupARows[0].tmbId)).toBe(targetMember.tmbId);
    expect(groupARows[0].role).toBe(GroupMemberRole.owner);

    const groupBRows = await MongoGroupMemberModel.find({ groupId: groupB._id }).lean();
    expect(groupBRows).toHaveLength(1);
    expect(String(groupBRows[0].tmbId)).toBe(targetMember.tmbId);
    expect(groupBRows[0].role).toBe(GroupMemberRole.owner);

    // 资源所有权归属校验。
    expect(String((await MongoApp.findById(ownedApp._id).lean())?.tmbId)).toBe(targetMember.tmbId);
    expect(String((await MongoOutLink.findById(ownAppOutLink._id).lean())?.tmbId)).toBe(
      targetMember.tmbId
    );
    expect(String((await MongoOutLink.findById(otherAppOutLink._id).lean())?.tmbId)).toBe(
      owner.tmbId
    );
    expect(String((await MongoDataset.findById(enabledDataset._id).lean())?.tmbId)).toBe(
      targetMember.tmbId
    );
    expect(String((await MongoDataset.findById(disabledDataset._id).lean())?.tmbId)).toBe(
      targetMember.tmbId
    );
    expect(String((await MongoDataset.findById(managedDataset._id).lean())?.tmbId)).toBe(
      targetMember.tmbId
    );
    expect(String((await MongoDatasetCollection.findById(enabledCol._id).lean())?.tmbId)).toBe(
      targetMember.tmbId
    );
    expect(String((await MongoDatasetCollection.findById(disabledCol._id).lean())?.tmbId)).toBe(
      targetMember.tmbId
    );
    // 托管知识库的集合归属不本地改写。
    expect(String((await MongoDatasetCollection.findById(managedCol._id).lean())?.tmbId)).toBe(
      leavingMember.tmbId
    );
    expect(String((await MongoAgentSkills.findById(ownedSkill._id).lean())?.tmbId)).toBe(
      targetMember.tmbId
    );

    // 个人 API Key 不删不转、直接停用；应用 API Key 分别转给对应应用 owner。
    const personalKeyAfter = await MongoOpenApi.findById(personalKey._id).lean();
    expect(personalKeyAfter).toMatchObject({
      disabled: true
    });
    expect(String(personalKeyAfter?.tmbId)).toBe(leavingMember.tmbId);
    expect(String((await MongoOpenApi.findById(ownAppKey._id).lean())?.tmbId)).toBe(
      targetMember.tmbId
    );
    expect(String((await MongoOpenApi.findById(otherAppKey._id).lean())?.tmbId)).toBe(owner.tmbId);

    // 权限合并与边界不变量。
    expect(
      await MongoResourcePermission.countDocuments({ teamId, tmbId: leavingMember.tmbId })
    ).toBe(0);

    // 1. ownedApp 的 OwnerRoleVal 与 target 原有 Read 合并后仍为 OwnerRoleVal（无符号溢出）。
    await expect(
      MongoResourcePermission.findOne({
        teamId,
        tmbId: targetMember.tmbId,
        resourceType: PerResourceTypeEnum.app,
        resourceId: ownedApp._id
      }).lean()
    ).resolves.toMatchObject({ permission: OwnerRoleVal });

    // 2. ownerApp 的 Write 与 target 的 Read|ReadChatLog 按位合并。
    await expect(
      MongoResourcePermission.findOne({
        teamId,
        tmbId: targetMember.tmbId,
        resourceType: PerResourceTypeEnum.app,
        resourceId: ownerApp._id
      }).lean()
    ).resolves.toMatchObject({
      permission: sumPer(WritePermissionVal, ReadPermissionVal, AppReadChatLogRoleVal)
    });

    // 3. deniedApp 的 0 权限拒绝记录未转移。
    await expect(
      MongoResourcePermission.findOne({
        teamId,
        tmbId: targetMember.tmbId,
        resourceType: PerResourceTypeEnum.app,
        resourceId: deniedApp._id
      }).lean()
    ).resolves.toBeNull();

    // 4. 知识库与模型协作者权限转移；开启集合权限的集合补齐 OwnerRoleVal；关闭态与托管库不写入集合 ACL。
    await expect(
      MongoResourcePermission.findOne({
        teamId,
        tmbId: targetMember.tmbId,
        resourceType: PerResourceTypeEnum.dataset,
        resourceId: ownerSharedDataset._id
      }).lean()
    ).resolves.toMatchObject({ permission: ManagePermissionVal });
    await expect(
      MongoResourcePermission.findOne({
        teamId,
        tmbId: targetMember.tmbId,
        resourceType: PerResourceTypeEnum.model,
        resourceName: 'gpt-4o-mini'
      }).lean()
    ).resolves.toMatchObject({ permission: ReadPermissionVal });
    await expect(
      MongoResourcePermission.findOne({
        teamId,
        tmbId: targetMember.tmbId,
        resourceType: PerResourceTypeEnum.collection,
        resourceId: enabledCol._id
      }).lean()
    ).resolves.toMatchObject({ permission: OwnerRoleVal });
    await expect(
      MongoResourcePermission.findOne({
        teamId,
        tmbId: targetMember.tmbId,
        resourceType: PerResourceTypeEnum.collection,
        resourceId: disabledCol._id
      }).lean()
    ).resolves.toBeNull();
    await expect(
      MongoResourcePermission.findOne({
        teamId,
        tmbId: targetMember.tmbId,
        resourceType: PerResourceTypeEnum.collection,
        resourceId: managedCol._id
      }).lean()
    ).resolves.toBeNull();
    await expect(
      MongoResourcePermission.findOne({
        teamId,
        tmbId: targetMember.tmbId,
        resourceType: PerResourceTypeEnum.agentSkill,
        resourceId: ownedSkill._id
      }).lean()
    ).resolves.toMatchObject({ permission: OwnerRoleVal });

    // 5. 团队级管理/创建权限绝不随离职转移，防止越权提升。
    await expect(
      MongoResourcePermission.findOne({
        teamId,
        tmbId: targetMember.tmbId,
        resourceType: PerResourceTypeEnum.team
      }).lean()
    ).resolves.toBeNull();
  });

  it('defaults to the team owner and cleans up non-owned collaborator rows without copying them', async () => {
    const {
      owner,
      members: [leavingMember, otherMember]
    } = await getFakeUsers(2);
    const teamId = owner.teamId;

    const [ownedApp, otherApp] = await MongoApp.create([
      { teamId, tmbId: leavingMember.tmbId, name: 'Own App', type: AppTypeEnum.simple },
      { teamId, tmbId: otherMember.tmbId, name: 'Other Member App', type: AppTypeEnum.simple }
    ]);
    const [personalKey, otherAppKey] = await MongoOpenApi.create([
      {
        teamId,
        tmbId: leavingMember.tmbId,
        type: ApiKeyTypeEnum.personal,
        apiKey: `fastgpt-owner-default-personal-${Date.now()}`,
        name: 'Personal Key'
      },
      {
        teamId,
        tmbId: leavingMember.tmbId,
        type: ApiKeyTypeEnum.app,
        appId: otherApp._id,
        apiKey: `fastgpt-owner-default-app-${Date.now()}`,
        name: 'Other App Key'
      }
    ]);
    await MongoResourcePermission.create({
      teamId,
      tmbId: leavingMember.tmbId,
      resourceType: PerResourceTypeEnum.app,
      resourceId: otherApp._id,
      permission: WritePermissionVal
    });

    const result = await transferTeamMemberResources({
      teamId,
      fromTmbId: leavingMember.tmbId
    });

    expect(result.targetTmbId).toBe(owner.tmbId);
    expect(result.isTargetTeamOwner).toBe(true);
    expect(result.disabledPersonalApiKeyCount).toBe(1);

    expect(String((await MongoApp.findById(ownedApp._id).lean())?.tmbId)).toBe(owner.tmbId);
    await expect(
      MongoResourcePermission.findOne({
        teamId,
        tmbId: owner.tmbId,
        resourceType: PerResourceTypeEnum.app,
        resourceId: ownedApp._id
      }).lean()
    ).resolves.toMatchObject({ permission: OwnerRoleVal });
    // 转给团队 owner 时无需继承对他人资源的协作者权限行。
    await expect(
      MongoResourcePermission.findOne({
        teamId,
        tmbId: owner.tmbId,
        resourceType: PerResourceTypeEnum.app,
        resourceId: otherApp._id
      }).lean()
    ).resolves.toBeNull();
    expect(
      await MongoResourcePermission.countDocuments({ teamId, tmbId: leavingMember.tmbId })
    ).toBe(0);
    expect((await MongoOpenApi.findById(personalKey._id).lean())?.disabled).toBe(true);
    // 他人应用的应用 Key 仍转给对应应用的 owner（otherMember），而非团队 owner。
    expect(String((await MongoOpenApi.findById(otherAppKey._id).lean())?.tmbId)).toBe(
      otherMember.tmbId
    );
  });

  it('rejects self-transfer, inactive target, and cross-team target without mutating data', async () => {
    const teamA = await getFakeUsers(2);
    const otherUser = await MongoUser.create({
      username: `cross-team-user-${Date.now()}`,
      password: 'password'
    });
    const otherTeam = await MongoTeam.create({ name: 'Other Team', ownerId: otherUser._id });
    const otherTeamMember = await MongoTeamMember.create({
      teamId: otherTeam._id,
      userId: otherUser._id,
      name: 'Other Team Owner',
      role: 'owner',
      status: TeamMemberStatusEnum.active
    });
    const [leavingMember, inactiveMember] = teamA.members;
    await MongoTeamMember.updateOne(
      { _id: inactiveMember.tmbId },
      { $set: { status: TeamMemberStatusEnum.leave } }
    );

    const app = await MongoApp.create({
      teamId: teamA.owner.teamId,
      tmbId: leavingMember.tmbId,
      name: 'Protected App',
      type: AppTypeEnum.simple
    });
    const personalKey = await MongoOpenApi.create({
      teamId: teamA.owner.teamId,
      tmbId: leavingMember.tmbId,
      type: ApiKeyTypeEnum.personal,
      apiKey: `fastgpt-rollback-${Date.now()}`,
      name: 'Protected Personal Key'
    });

    await expect(
      transferTeamMemberResources({
        teamId: teamA.owner.teamId,
        fromTmbId: leavingMember.tmbId,
        toTmbId: leavingMember.tmbId
      })
    ).rejects.toThrow('Cannot transfer resources to the leaving member');

    await expect(
      transferTeamMemberResources({
        teamId: teamA.owner.teamId,
        fromTmbId: leavingMember.tmbId,
        toTmbId: inactiveMember.tmbId
      })
    ).rejects.toBe(TeamErrEnum.userNotActive);

    await expect(
      transferTeamMemberResources({
        teamId: teamA.owner.teamId,
        fromTmbId: leavingMember.tmbId,
        toTmbId: String(otherTeamMember._id)
      })
    ).rejects.toBe(TeamErrEnum.userNotActive);

    expect(String((await MongoApp.findById(app._id).lean())?.tmbId)).toBe(leavingMember.tmbId);
    expect((await MongoOpenApi.findById(personalKey._id).lean())?.disabled).toBe(false);
  });
});

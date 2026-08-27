import { beforeEach, describe, expect, it, vi } from 'vitest';
import { OwnerRoleVal, PerResourceTypeEnum } from '@fastgpt/global/support/permission/constant';
import { Types } from '@fastgpt/service/common/mongo';
import { MongoAgentSkills } from '@fastgpt/service/core/ai/skill/model/schema';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { MongoDataset } from '@fastgpt/service/core/dataset/schema';
import { cleanupDanglingResourcePermissions } from '@/service/admin/4162/permissionCleanup';
import { MongoMemberGroupModel } from '@fastgpt/service/support/permission/memberGroup/memberGroupSchema';
import { MongoOrgModel } from '@fastgpt/service/support/permission/org/orgSchema';
import { MongoResourcePermission } from '@fastgpt/service/support/permission/schema';
import { getUser } from '@test/datas/users';

const objectId = () => new Types.ObjectId();

describe('cleanupDanglingResourcePermissions', () => {
  let expectedDanglingPermissionIds: string[];
  let validAppId: Types.ObjectId;
  let concurrentlyAssignedAppId: Types.ObjectId;
  let invalidCollaboratorAppId: Types.ObjectId;
  let targetTeamId: string;

  beforeEach(async () => {
    const user = await getUser(`permission-cleanup-${objectId()}`);
    const otherTeamUser = await getUser(`permission-cleanup-other-${objectId()}`);
    targetTeamId = user.teamId;

    validAppId = objectId();
    concurrentlyAssignedAppId = objectId();
    invalidCollaboratorAppId = objectId();
    const validDatasetId = objectId();
    const validSkillId = objectId();
    const crossTeamAppId = objectId();
    const validGroupId = objectId();
    const validOrgId = objectId();

    await Promise.all([
      MongoApp.collection.insertOne({ _id: validAppId, teamId: user.teamId }),
      MongoApp.collection.insertOne({ _id: concurrentlyAssignedAppId, teamId: user.teamId }),
      MongoApp.collection.insertOne({ _id: invalidCollaboratorAppId, teamId: user.teamId }),
      MongoDataset.collection.insertOne({ _id: validDatasetId, teamId: user.teamId }),
      MongoAgentSkills.collection.insertOne({ _id: validSkillId, teamId: user.teamId }),
      MongoApp.collection.insertOne({ _id: crossTeamAppId, teamId: otherTeamUser.teamId }),
      MongoMemberGroupModel.collection.insertOne({ _id: validGroupId, teamId: user.teamId }),
      MongoOrgModel.collection.insertOne({ _id: validOrgId, teamId: user.teamId })
    ]);

    const createPermission = ({
      teamId = user.teamId,
      tmbId,
      groupId,
      orgId,
      resourceType,
      resourceId,
      resourceName
    }: {
      teamId?: string;
      tmbId?: string;
      groupId?: Types.ObjectId;
      orgId?: Types.ObjectId;
      resourceType: PerResourceTypeEnum;
      resourceId?: unknown;
      resourceName?: string;
    }) => ({
      _id: objectId(),
      teamId: new Types.ObjectId(teamId),
      ...(tmbId !== undefined ? { tmbId: new Types.ObjectId(tmbId) } : {}),
      ...(groupId !== undefined ? { groupId } : {}),
      ...(orgId !== undefined ? { orgId } : {}),
      resourceType,
      ...(resourceId !== undefined ? { resourceId } : {}),
      ...(resourceName ? { resourceName } : {}),
      permission: OwnerRoleVal
    });

    const validPermissions = [
      createPermission({ tmbId: user.tmbId, resourceType: PerResourceTypeEnum.team }),
      createPermission({
        tmbId: user.tmbId,
        resourceType: PerResourceTypeEnum.model,
        resourceName: 'gpt-4o'
      }),
      createPermission({
        tmbId: user.tmbId,
        resourceType: PerResourceTypeEnum.app,
        resourceId: validAppId
      }),
      createPermission({
        groupId: validGroupId,
        resourceType: PerResourceTypeEnum.dataset,
        resourceId: validDatasetId
      }),
      createPermission({
        orgId: validOrgId,
        resourceType: PerResourceTypeEnum.agentSkill,
        resourceId: validSkillId
      })
    ];

    const danglingPermissions = [
      createPermission({ teamId: String(objectId()), resourceType: PerResourceTypeEnum.team }),
      createPermission({ tmbId: String(objectId()), resourceType: PerResourceTypeEnum.team }),
      createPermission({ groupId: objectId(), resourceType: PerResourceTypeEnum.team }),
      createPermission({ orgId: objectId(), resourceType: PerResourceTypeEnum.team }),
      createPermission({
        tmbId: user.tmbId,
        resourceType: PerResourceTypeEnum.app,
        resourceId: objectId()
      }),
      createPermission({
        tmbId: user.tmbId,
        resourceType: PerResourceTypeEnum.dataset,
        resourceId: objectId()
      }),
      createPermission({
        tmbId: user.tmbId,
        resourceType: PerResourceTypeEnum.agentSkill,
        resourceId: objectId()
      }),
      createPermission({ tmbId: user.tmbId, resourceType: PerResourceTypeEnum.app }),
      createPermission({ tmbId: otherTeamUser.tmbId, resourceType: PerResourceTypeEnum.team }),
      createPermission({
        tmbId: user.tmbId,
        resourceType: PerResourceTypeEnum.app,
        resourceId: crossTeamAppId
      })
    ];
    const malformedPermission = {
      _id: objectId(),
      teamId: 'invalid-team-id',
      tmbId: 'invalid-team-member-id',
      groupId: 'invalid-group-id',
      orgId: 'invalid-org-id',
      resourceType: PerResourceTypeEnum.app,
      resourceId: 'invalid-app-id',
      permission: OwnerRoleVal
    };
    const malformedFalsyPermission = {
      _id: objectId(),
      teamId: new Types.ObjectId(user.teamId),
      tmbId: '',
      groupId: 0,
      orgId: null,
      resourceType: PerResourceTypeEnum.app,
      resourceId: '',
      permission: OwnerRoleVal
    };
    const invalidCollaboratorPermissions = [
      createPermission({
        resourceType: PerResourceTypeEnum.app,
        resourceId: invalidCollaboratorAppId
      }),
      createPermission({
        tmbId: user.tmbId,
        groupId: validGroupId,
        resourceType: PerResourceTypeEnum.app,
        resourceId: invalidCollaboratorAppId
      })
    ];

    expectedDanglingPermissionIds = [
      ...danglingPermissions,
      malformedPermission,
      malformedFalsyPermission,
      ...invalidCollaboratorPermissions
    ].map((permission) => String(permission._id));
    await MongoResourcePermission.collection.insertMany([
      ...validPermissions,
      ...danglingPermissions,
      malformedPermission,
      malformedFalsyPermission,
      ...invalidCollaboratorPermissions
    ]);
  });

  it('reports every dangling reference without deleting permissions during dry-run', async () => {
    const result = await cleanupDanglingResourcePermissions({
      dryRun: true,
      batchSize: 2,
      sampleLimit: 20
    });

    expect(result).toMatchObject({
      dryRun: true,
      scannedPermissionCount: 19,
      danglingPermissionCount: 14,
      danglingReferencePermissionCount: 12,
      invalidCollaboratorPermissionCount: 5,
      deletedPermissionCount: 0,
      reasonCounts: {
        missingTeam: 2,
        missingTeamMember: 4,
        missingGroup: 3,
        missingOrg: 3,
        missingApp: 3,
        missingDataset: 1,
        missingAgentSkill: 1,
        missingResourceId: 2,
        missingCollaboratorTarget: 3,
        multipleCollaboratorTargets: 2
      }
    });
    expect(result.samples.map((sample) => sample.permissionId).sort()).toEqual(
      expectedDanglingPermissionIds.sort()
    );
    expect(await MongoResourcePermission.countDocuments()).toBe(19);
  });

  it('deletes only dangling permissions in apply mode', async () => {
    const result = await cleanupDanglingResourcePermissions({
      dryRun: false,
      batchSize: 3,
      sampleLimit: 2
    });

    expect(result).toMatchObject({
      dryRun: false,
      scannedPermissionCount: 19,
      danglingPermissionCount: 14,
      danglingReferencePermissionCount: 12,
      invalidCollaboratorPermissionCount: 5,
      deletedPermissionCount: 14,
      sampleLimit: 2
    });
    expect(result.samples).toHaveLength(2);
    expect(
      await MongoResourcePermission.countDocuments({
        _id: { $in: expectedDanglingPermissionIds }
      })
    ).toBe(0);
    expect(await MongoResourcePermission.countDocuments()).toBe(5);
  });

  it('keeps a permission that becomes valid after validation', async () => {
    const permissionId = new Types.ObjectId(expectedDanglingPermissionIds[4]);
    const originalDeleteMany = MongoResourcePermission.collection.deleteMany.bind(
      MongoResourcePermission.collection
    );
    vi.spyOn(MongoResourcePermission.collection, 'deleteMany').mockImplementationOnce(
      async (filter, options) => {
        await MongoResourcePermission.collection.updateOne(
          { _id: permissionId },
          { $set: { resourceId: concurrentlyAssignedAppId } }
        );
        return originalDeleteMany(filter, options);
      }
    );

    const result = await cleanupDanglingResourcePermissions({
      dryRun: false,
      batchSize: 100,
      sampleLimit: 0
    });

    expect(result.deletedPermissionCount).toBe(13);
    expect(await MongoResourcePermission.countDocuments({ _id: permissionId })).toBe(1);
  });

  it('limits cleanup to the requested team', async () => {
    const result = await cleanupDanglingResourcePermissions({
      dryRun: true,
      teamId: targetTeamId,
      batchSize: 2,
      sampleLimit: 0
    });

    expect(result.scannedPermissionCount).toBe(17);
    expect(result.danglingPermissionCount).toBe(12);
    expect(await MongoResourcePermission.countDocuments()).toBe(19);
  });
});

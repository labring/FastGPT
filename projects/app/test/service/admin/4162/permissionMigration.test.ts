import { describe, expect, it, vi } from 'vitest';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import { AgentSkillSourceEnum, AgentSkillTypeEnum } from '@fastgpt/global/core/ai/skill/constants';
import { DatasetTypeEnum } from '@fastgpt/global/core/dataset/constants';
import {
  OwnerRoleVal,
  PerResourceTypeEnum,
  ReadRoleVal,
  WriteRoleVal
} from '@fastgpt/global/support/permission/constant';
import { getCollaboratorId } from '@fastgpt/global/support/permission/utils';
import type { CollaboratorItemType } from '@fastgpt/global/support/permission/collaborator';
import {
  materializeResourcePermissions,
  resolveMaterializedResourcePermissions,
  type MigrationResource
} from '@/service/admin/4162/permissionMigration';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { MongoDataset } from '@fastgpt/service/core/dataset/schema';
import { MongoAgentSkills } from '@fastgpt/service/core/ai/skill/model/schema';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { resourcePermissionRepo } from '@fastgpt/service/support/permission/repository/resourcePermissionRepo';
import { getFakeUsers, getUser } from '@test/datas/users';

const user = (tmbId: string, permission: number): CollaboratorItemType => ({
  tmbId,
  permission
});

const toPermissionMap = (collaborators: CollaboratorItemType[]) =>
  new Map(
    collaborators.map((collaborator) => [getCollaboratorId(collaborator), collaborator.permission])
  );

const resolve = (resources: MigrationResource[], currentPermissions: CollaboratorItemType[]) =>
  resolveMaterializedResourcePermissions({
    resources,
    currentPermissions: currentPermissions as (CollaboratorItemType & { resourceId: unknown })[],
    resourceType: PerResourceTypeEnum.app
  });

describe('resolveMaterializedResourcePermissions', () => {
  it('materializes a normal child from its parent ACL', () => {
    const resources = [
      { _id: 'parent', teamId: 'team', tmbId: 'owner' },
      { _id: 'child', teamId: 'team', parentId: 'parent', tmbId: 'owner' }
    ];
    const currentPermissions = [
      { resourceId: 'parent', ...user('owner', OwnerRoleVal) },
      { resourceId: 'parent', ...user('reader', ReadRoleVal) }
    ];

    const result = resolve(resources, currentPermissions);

    expect(result.errors).toEqual([]);
    expect(result.changes).toHaveLength(1);
    expect(toPermissionMap(result.changes[0].collaborators)).toEqual(
      new Map([
        ['owner', OwnerRoleVal],
        ['reader', ReadRoleVal]
      ])
    );
  });

  it('preserves child-only permission bits and independent subtrees', () => {
    const resources = [
      { _id: 'parent', teamId: 'team', tmbId: 'owner' },
      { _id: 'child', teamId: 'team', parentId: 'parent', tmbId: 'owner' },
      {
        _id: 'independent',
        teamId: 'team',
        parentId: 'parent',
        tmbId: 'owner',
        inheritPermission: false
      }
    ];
    const currentPermissions = [
      { resourceId: 'parent', ...user('owner', OwnerRoleVal) },
      { resourceId: 'parent', ...user('reader', ReadRoleVal) },
      { resourceId: 'child', ...user('extra', WriteRoleVal) },
      { resourceId: 'independent', ...user('owner', OwnerRoleVal) }
    ];

    const result = resolve(resources, currentPermissions);

    expect(result.errors).toEqual([]);
    expect(result.changes).toHaveLength(1);
    expect(result.changes[0].resourceId).toBe('child');
    expect(toPermissionMap(result.changes[0].collaborators)).toEqual(
      new Map([
        ['owner', OwnerRoleVal],
        ['reader', ReadRoleVal],
        ['extra', WriteRoleVal]
      ])
    );
  });

  it('is idempotent after applying the generated changes', () => {
    const resources = [
      { _id: 'parent', teamId: 'team', tmbId: 'owner' },
      { _id: 'child', teamId: 'team', parentId: 'parent', tmbId: 'owner' }
    ];
    const currentPermissions = [
      { resourceId: 'parent', ...user('owner', OwnerRoleVal) },
      { resourceId: 'parent', ...user('reader', ReadRoleVal) }
    ];
    const first = resolve(resources, currentPermissions);
    const materializedPermissions = [
      ...currentPermissions.filter((permission) => permission.resourceId !== 'child'),
      ...(first.changes[0]?.collaborators ?? []).map((collaborator) => ({
        resourceId: 'child',
        ...collaborator
      }))
    ];

    const second = resolve(resources, materializedPermissions);

    expect(second.changes).toEqual([]);
    expect(second.errors).toEqual([]);
  });

  it('only reports target resources when ancestors are loaded for a batch', () => {
    const resources = [
      { _id: 'parent', teamId: 'team', tmbId: 'owner' },
      { _id: 'child', teamId: 'team', parentId: 'parent', tmbId: 'owner' }
    ];
    const result = resolveMaterializedResourcePermissions({
      resources,
      currentPermissions: [],
      resourceType: PerResourceTypeEnum.app,
      targetResourceIds: ['child']
    });

    expect(result.errors).toEqual([]);
    expect(result.skippedResourceCount).toBe(0);
    expect(result.changes.map((change) => change.resourceId)).toEqual(['child']);
  });

  it('reports orphan parents and cycles without writing changes', () => {
    const resources = [
      { _id: 'a', teamId: 'team', parentId: 'b', tmbId: 'owner' },
      { _id: 'b', teamId: 'team', parentId: 'a', tmbId: 'owner' },
      { _id: 'orphan', teamId: 'team', parentId: 'missing', tmbId: 'owner' }
    ];

    const result = resolve(resources, []);

    expect(result.changes).toEqual([]);
    expect(result.skippedResourceCount).toBe(3);
    expect(result.errors).toEqual(
      expect.arrayContaining([
        'app:a: parent cycle',
        'app:b: missing parent a',
        'app:a: missing parent b',
        'app:orphan: missing parent missing'
      ])
    );
  });

  it('resolves a deep legacy tree when inheritPermission is missing', () => {
    const resources = [
      { _id: 'grandparent', teamId: 'team', tmbId: 'owner' },
      { _id: 'parent', teamId: 'team', parentId: 'grandparent', tmbId: 'owner' },
      { _id: 'child', teamId: 'team', parentId: 'parent', tmbId: 'owner' }
    ];
    const currentPermissions = [
      { resourceId: 'grandparent', ...user('owner', OwnerRoleVal) },
      { resourceId: 'grandparent', ...user('reader', ReadRoleVal) }
    ];

    const result = resolve(resources, currentPermissions);

    expect(result.errors).toEqual([]);
    expect(result.changes.map(({ resourceId }) => resourceId)).toEqual(['parent', 'child']);
    expect(toPermissionMap(result.changes[1].collaborators)).toEqual(
      new Map([
        ['owner', OwnerRoleVal],
        ['reader', ReadRoleVal]
      ])
    );
  });
});

describe('materializeResourcePermissions', () => {
  it('writes inherited ACLs when parent and child are processed in separate batches', async () => {
    const findByResourceIdsSpy = vi.spyOn(resourcePermissionRepo, 'findByResourceIds');
    const users = await getFakeUsers(2);
    const parent = await MongoApp.create({
      teamId: users.owner.teamId,
      tmbId: users.owner.tmbId,
      name: 'migration-parent',
      type: AppTypeEnum.folder
    });
    const child = await MongoApp.create({
      teamId: users.owner.teamId,
      tmbId: users.owner.tmbId,
      parentId: parent._id,
      name: 'migration-child',
      type: AppTypeEnum.simple
    });

    await mongoSessionRun(async (session) => {
      await resourcePermissionRepo.replaceResource({
        teamId: String(users.owner.teamId),
        resourceType: PerResourceTypeEnum.app,
        resourceId: String(parent._id),
        collaborators: [
          { tmbId: String(users.owner.tmbId), permission: OwnerRoleVal },
          { tmbId: String(users.members[0].tmbId), permission: ReadRoleVal }
        ],
        session
      });
      await resourcePermissionRepo.replaceResource({
        teamId: String(users.owner.teamId),
        resourceType: PerResourceTypeEnum.app,
        resourceId: String(child._id),
        collaborators: [{ tmbId: String(users.owner.tmbId), permission: OwnerRoleVal }],
        session
      });
    });

    const replaceResourcesSpy = vi.spyOn(resourcePermissionRepo, 'replaceResources');

    const result = await materializeResourcePermissions({
      dryRun: false,
      teamId: String(users.owner.teamId),
      batchSize: 1,
      teamConcurrency: 10
    });

    expect(result.errors).toEqual([]);
    expect(result.resourceCount).toBe(2);
    expect(result.updatedResourceCount).toBe(1);
    expect(replaceResourcesSpy).toHaveBeenCalledTimes(1);
    expect(replaceResourcesSpy.mock.calls[0][0].resources).toHaveLength(1);
    const aclQueryCalls = findByResourceIdsSpy.mock.calls as Array<[{ session?: unknown }]>;
    expect(aclQueryCalls).toHaveLength(2);
    expect(aclQueryCalls.map(([query]) => query.resourceIds)).toEqual([
      [String(parent._id)],
      [String(child._id), String(parent._id)]
    ]);

    const childPermissions = await resourcePermissionRepo.findByResource({
      teamId: String(users.owner.teamId),
      resourceType: PerResourceTypeEnum.app,
      resourceId: String(child._id)
    });
    expect(childPermissions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          tmbId: String(users.members[0].tmbId),
          permission: ReadRoleVal
        })
      ])
    );
  });

  it('keeps dry-run read-only and filters resources by team', async () => {
    const users = await getFakeUsers(1);
    const otherTeamUser = await getUser('materialize-other-team');
    const [dataset, skill, otherDataset] = await Promise.all([
      MongoDataset.create({
        teamId: users.owner.teamId,
        tmbId: users.owner.tmbId,
        name: 'migration-dataset',
        type: DatasetTypeEnum.dataset
      }),
      MongoAgentSkills.create({
        teamId: users.owner.teamId,
        tmbId: users.owner.tmbId,
        name: 'migration-skill',
        source: AgentSkillSourceEnum.personal
      }),
      MongoDataset.create({
        teamId: otherTeamUser.teamId,
        tmbId: otherTeamUser.tmbId,
        name: 'other-team-dataset',
        type: DatasetTypeEnum.dataset
      })
    ]);

    const result = await materializeResourcePermissions({
      dryRun: true,
      teamId: String(users.owner.teamId),
      batchSize: 1,
      teamConcurrency: 10
    });

    expect(result).toMatchObject({
      dryRun: true,
      teamCount: 1,
      resourceCount: 2,
      updatedResourceCount: 2,
      skippedResourceCount: 0,
      errors: []
    });
    await expect(
      resourcePermissionRepo.findByResource({
        teamId: String(users.owner.teamId),
        resourceType: PerResourceTypeEnum.dataset,
        resourceId: String(dataset._id)
      })
    ).resolves.toEqual([]);
    await expect(
      resourcePermissionRepo.findByResource({
        teamId: String(users.owner.teamId),
        resourceType: PerResourceTypeEnum.agentSkill,
        resourceId: String(skill._id)
      })
    ).resolves.toEqual([]);
    await expect(
      resourcePermissionRepo.findByResource({
        teamId: String(otherTeamUser.teamId),
        resourceType: PerResourceTypeEnum.dataset,
        resourceId: String(otherDataset._id)
      })
    ).resolves.toEqual([]);
  });

  it('materializes Dataset and Agent Skill owner ACLs', async () => {
    const users = await getFakeUsers(1);
    const [dataset, skill] = await Promise.all([
      MongoDataset.create({
        teamId: users.owner.teamId,
        tmbId: users.owner.tmbId,
        name: 'migration-dataset-write',
        type: DatasetTypeEnum.dataset
      }),
      MongoAgentSkills.create({
        teamId: users.owner.teamId,
        tmbId: users.owner.tmbId,
        name: 'migration-skill-write',
        source: AgentSkillSourceEnum.personal
      })
    ]);

    const result = await materializeResourcePermissions({
      dryRun: false,
      teamId: String(users.owner.teamId),
      batchSize: 100,
      teamConcurrency: 10
    });

    expect(result).toMatchObject({
      resourceCount: 2,
      updatedResourceCount: 2,
      skippedResourceCount: 0,
      errors: []
    });
    await expect(
      resourcePermissionRepo.findOne({
        teamId: String(users.owner.teamId),
        resourceType: PerResourceTypeEnum.dataset,
        resourceId: String(dataset._id),
        collaborator: { tmbId: String(users.owner.tmbId) }
      })
    ).resolves.toMatchObject({ permission: OwnerRoleVal });
    await expect(
      resourcePermissionRepo.findOne({
        teamId: String(users.owner.teamId),
        resourceType: PerResourceTypeEnum.agentSkill,
        resourceId: String(skill._id),
        collaborator: { tmbId: String(users.owner.tmbId) }
      })
    ).resolves.toMatchObject({ permission: OwnerRoleVal });
  });

  it('materializes inherited ACLs for Dataset and Agent Skill children', async () => {
    const users = await getFakeUsers(2);
    const [datasetParent, datasetChild] = await MongoDataset.create([
      {
        teamId: users.owner.teamId,
        tmbId: users.owner.tmbId,
        name: 'migration-dataset-parent',
        type: DatasetTypeEnum.folder
      },
      {
        teamId: users.owner.teamId,
        tmbId: users.owner.tmbId,
        name: 'migration-dataset-child',
        type: DatasetTypeEnum.dataset,
        parentId: undefined
      }
    ]);
    const [skillParent, skillChild] = await MongoAgentSkills.create([
      {
        teamId: users.owner.teamId,
        tmbId: users.owner.tmbId,
        name: 'migration-skill-parent',
        type: AgentSkillTypeEnum.folder,
        source: AgentSkillSourceEnum.personal
      },
      {
        teamId: users.owner.teamId,
        tmbId: users.owner.tmbId,
        name: 'migration-skill-child',
        type: AgentSkillTypeEnum.skill,
        source: AgentSkillSourceEnum.personal,
        parentId: undefined
      }
    ]);

    await MongoDataset.updateOne({ _id: datasetChild._id }, { parentId: datasetParent._id });
    await MongoAgentSkills.updateOne({ _id: skillChild._id }, { parentId: skillParent._id });

    const parentCollaborators = [
      { tmbId: String(users.owner.tmbId), permission: OwnerRoleVal },
      { tmbId: String(users.members[0].tmbId), permission: ReadRoleVal }
    ];
    await mongoSessionRun(async (session) => {
      await resourcePermissionRepo.replaceResource({
        teamId: String(users.owner.teamId),
        resourceType: PerResourceTypeEnum.dataset,
        resourceId: String(datasetParent._id),
        collaborators: parentCollaborators,
        session
      });
      await resourcePermissionRepo.replaceResource({
        teamId: String(users.owner.teamId),
        resourceType: PerResourceTypeEnum.agentSkill,
        resourceId: String(skillParent._id),
        collaborators: parentCollaborators,
        session
      });
    });

    const result = await materializeResourcePermissions({
      dryRun: false,
      teamId: String(users.owner.teamId),
      batchSize: 100,
      teamConcurrency: 10
    });

    expect(result).toMatchObject({
      resourceCount: 4,
      updatedResourceCount: 2,
      skippedResourceCount: 0,
      errors: []
    });
    await expect(
      resourcePermissionRepo.findByResource({
        teamId: String(users.owner.teamId),
        resourceType: PerResourceTypeEnum.dataset,
        resourceId: String(datasetChild._id)
      })
    ).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          tmbId: String(users.owner.tmbId),
          permission: OwnerRoleVal
        }),
        expect.objectContaining({
          tmbId: String(users.members[0].tmbId),
          permission: ReadRoleVal
        })
      ])
    );
    await expect(
      resourcePermissionRepo.findByResource({
        teamId: String(users.owner.teamId),
        resourceType: PerResourceTypeEnum.agentSkill,
        resourceId: String(skillChild._id)
      })
    ).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          tmbId: String(users.owner.tmbId),
          permission: OwnerRoleVal
        }),
        expect.objectContaining({
          tmbId: String(users.members[0].tmbId),
          permission: ReadRoleVal
        })
      ])
    );
  });

  it('records a resource type failure and continues materializing the remaining types', async () => {
    const users = await getFakeUsers(1);
    const [app, dataset, skill] = await Promise.all([
      MongoApp.create({
        teamId: users.owner.teamId,
        tmbId: users.owner.tmbId,
        name: 'migration-failed-app',
        type: AppTypeEnum.simple
      }),
      MongoDataset.create({
        teamId: users.owner.teamId,
        tmbId: users.owner.tmbId,
        name: 'migration-dataset-after-failure',
        type: DatasetTypeEnum.dataset
      }),
      MongoAgentSkills.create({
        teamId: users.owner.teamId,
        tmbId: users.owner.tmbId,
        name: 'migration-skill-after-failure',
        source: AgentSkillSourceEnum.personal
      })
    ]);
    vi.spyOn(resourcePermissionRepo, 'findByResourceIds').mockRejectedValueOnce(
      new Error('mock app migration failure')
    );

    const result = await materializeResourcePermissions({
      dryRun: false,
      teamId: String(users.owner.teamId),
      batchSize: 100,
      teamConcurrency: 10
    });

    expect(result).toMatchObject({
      resourceCount: 2,
      updatedResourceCount: 2,
      skippedResourceCount: 0
    });
    expect(result.errors).toEqual([
      `${PerResourceTypeEnum.app}:${users.owner.teamId}: migration failed: mock app migration failure`
    ]);
    await expect(
      resourcePermissionRepo.findByResource({
        teamId: String(users.owner.teamId),
        resourceType: PerResourceTypeEnum.app,
        resourceId: String(app._id)
      })
    ).resolves.toEqual([]);
    await expect(
      resourcePermissionRepo.findByResource({
        teamId: String(users.owner.teamId),
        resourceType: PerResourceTypeEnum.dataset,
        resourceId: String(dataset._id)
      })
    ).resolves.toEqual([
      expect.objectContaining({
        tmbId: String(users.owner.tmbId),
        permission: OwnerRoleVal
      })
    ]);
    await expect(
      resourcePermissionRepo.findByResource({
        teamId: String(users.owner.teamId),
        resourceType: PerResourceTypeEnum.agentSkill,
        resourceId: String(skill._id)
      })
    ).resolves.toEqual([
      expect.objectContaining({
        tmbId: String(users.owner.tmbId),
        permission: OwnerRoleVal
      })
    ]);
  });
});

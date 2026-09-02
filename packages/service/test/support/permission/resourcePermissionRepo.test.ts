import {
  ManagePermissionVal,
  OwnerPermissionVal,
  PerResourceTypeEnum,
  ReadPermissionVal,
  WritePermissionVal
} from '@fastgpt/global/support/permission/constant';
import { AppReadChatLogRoleVal } from '@fastgpt/global/support/permission/app/constant';
import { Types } from '@fastgpt/service/common/mongo';
import { resourcePermissionRepo } from '@fastgpt/service/support/permission/repository/resourcePermissionRepo';
import { MongoResourcePermission } from '@fastgpt/service/support/permission/schema';
import { beforeEach, describe, expect, it } from 'vitest';

const objectId = () => new Types.ObjectId();

describe('resourcePermissionRepo resource filters', () => {
  const teamId = objectId();

  beforeEach(async () => {
    await MongoResourcePermission.deleteMany({});
  });

  it('matches team permissions stored with null or missing resourceId', async () => {
    const nullResourceIdTmbId = objectId();
    const missingResourceIdTmbId = objectId();

    await MongoResourcePermission.collection.insertMany([
      {
        teamId,
        tmbId: nullResourceIdTmbId,
        resourceType: PerResourceTypeEnum.team,
        resourceId: null,
        permission: ManagePermissionVal
      },
      {
        teamId,
        tmbId: missingResourceIdTmbId,
        resourceType: PerResourceTypeEnum.team,
        permission: ManagePermissionVal
      }
    ]);

    await expect(
      resourcePermissionRepo.findOne({
        teamId: String(teamId),
        resourceType: PerResourceTypeEnum.team,
        collaborator: { tmbId: String(nullResourceIdTmbId) }
      })
    ).resolves.toMatchObject({ permission: ManagePermissionVal });

    await expect(
      resourcePermissionRepo.findOne({
        teamId: String(teamId),
        resourceType: PerResourceTypeEnum.team,
        collaborator: { tmbId: String(missingResourceIdTmbId) }
      })
    ).resolves.toMatchObject({ permission: ManagePermissionVal });
  });

  it('ignores invalid collaborator IDs without triggering ObjectId casting errors', async () => {
    const groupId = objectId();
    await MongoResourcePermission.collection.insertOne({
      teamId,
      resourceType: PerResourceTypeEnum.team,
      resourceId: null,
      groupId,
      permission: ManagePermissionVal
    });

    await expect(
      resourcePermissionRepo.findByCollaborators({
        teamId: String(teamId),
        resourceType: PerResourceTypeEnum.team,
        collaborators: [{ groupId: 'undefined' }]
      })
    ).resolves.toEqual([]);

    await expect(
      resourcePermissionRepo.findByCollaborators({
        teamId: String(teamId),
        resourceType: PerResourceTypeEnum.team,
        collaborators: [{ groupId: 'undefined' }, { groupId: String(groupId) }]
      })
    ).resolves.toHaveLength(1);
  });

  it('finds both resourceId and legacy resourceName rows by team', async () => {
    await MongoResourcePermission.collection.insertMany([
      {
        teamId,
        resourceType: PerResourceTypeEnum.model,
        resourceId: objectId(),
        permission: ReadPermissionVal
      },
      {
        teamId,
        resourceType: PerResourceTypeEnum.model,
        resourceName: 'legacy-model',
        permission: ReadPermissionVal
      },
      {
        teamId,
        resourceType: PerResourceTypeEnum.model,
        permission: ReadPermissionVal
      }
    ]);

    const permissions = await resourcePermissionRepo.findByTeam({
      teamId: String(teamId),
      resourceType: PerResourceTypeEnum.model
    });

    expect(permissions).toHaveLength(2);
    expect(permissions.map((permission) => permission.resourceName)).toContain('legacy-model');
  });

  it('finds only the requested resource IDs in a batch', async () => {
    const resourceId = objectId();
    const otherResourceId = objectId();
    await MongoResourcePermission.collection.insertMany([
      {
        teamId,
        resourceType: PerResourceTypeEnum.app,
        resourceId,
        permission: ReadPermissionVal
      },
      {
        teamId,
        resourceType: PerResourceTypeEnum.app,
        resourceId: otherResourceId,
        permission: ReadPermissionVal
      }
    ]);

    const permissions = await resourcePermissionRepo.findByResourceIds({
      teamId: String(teamId),
      resourceType: PerResourceTypeEnum.app,
      resourceIds: [String(resourceId)]
    });

    expect(permissions).toHaveLength(1);
    expect(String(permissions[0].resourceId)).toBe(String(resourceId));
  });

  it('finds only affected collaborators and projects the required ACL fields', async () => {
    const resourceId = objectId();
    const otherResourceId = objectId();
    const affectedTmbId = objectId();
    const unaffectedTmbId = objectId();

    await MongoResourcePermission.collection.insertMany([
      {
        teamId,
        resourceType: PerResourceTypeEnum.app,
        resourceId,
        tmbId: affectedTmbId,
        permission: ReadPermissionVal
      },
      {
        teamId,
        resourceType: PerResourceTypeEnum.app,
        resourceId,
        tmbId: unaffectedTmbId,
        permission: WritePermissionVal
      },
      {
        teamId,
        resourceType: PerResourceTypeEnum.app,
        resourceId: otherResourceId,
        tmbId: affectedTmbId,
        permission: ManagePermissionVal
      }
    ]);

    const permissions = await resourcePermissionRepo.findByResourceIdsAndCollaborators({
      teamId: String(teamId),
      resourceType: PerResourceTypeEnum.app,
      resourceIds: [String(resourceId)],
      collaborators: [{ tmbId: String(affectedTmbId) }]
    });

    expect(permissions).toHaveLength(1);
    expect(String(permissions[0].resourceId)).toBe(String(resourceId));
    expect(String(permissions[0].tmbId)).toBe(String(affectedTmbId));
    expect(permissions[0]).toMatchObject({ permission: ReadPermissionVal });
    expect(permissions[0]).not.toHaveProperty('teamId');
  });

  it('patches only the requested ACL rows with insert, update, and delete actions', async () => {
    const resourceId = objectId();
    const tmbId = objectId();
    const groupId = objectId();
    const orgId = objectId();

    await MongoResourcePermission.collection.insertMany([
      {
        teamId,
        resourceType: PerResourceTypeEnum.app,
        resourceId,
        tmbId,
        permission: ReadPermissionVal
      },
      {
        teamId,
        resourceType: PerResourceTypeEnum.app,
        resourceId,
        groupId,
        permission: ManagePermissionVal
      }
    ]);

    await resourcePermissionRepo.patchResources({
      teamId: String(teamId),
      resourceType: PerResourceTypeEnum.app,
      patches: [
        {
          resourceId: String(resourceId),
          collaborator: { tmbId: String(tmbId) },
          action: 'update',
          permission: WritePermissionVal
        },
        {
          resourceId: String(resourceId),
          collaborator: { groupId: String(groupId) },
          action: 'delete'
        },
        {
          resourceId: String(resourceId),
          collaborator: { orgId: String(orgId) },
          action: 'insert',
          permission: ReadPermissionVal
        }
      ]
    });

    const rows = await resourcePermissionRepo.findByResourceIds({
      teamId: String(teamId),
      resourceType: PerResourceTypeEnum.app,
      resourceIds: [String(resourceId)]
    });

    expect(rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ permission: WritePermissionVal }),
        expect.objectContaining({ permission: ReadPermissionVal })
      ])
    );
    expect(rows).toHaveLength(2);
    expect(rows.some((row) => String(row.groupId) === String(groupId))).toBe(false);
  });
});

describe('resourcePermissionRepo.findResourceKeysByCollaboratorsPermission', () => {
  const teamId = objectId();
  const tmbId = objectId();
  const groupId = objectId();
  const orgId = objectId();

  beforeEach(async () => {
    await MongoResourcePermission.deleteMany({});
  });

  it('matches merged group and org permissions with or and and logic', async () => {
    const resourceWithReadAndWrite = objectId();
    const resourceWithReadOnly = objectId();
    const resourceWithChatLogRole = objectId();

    await MongoResourcePermission.collection.insertMany([
      {
        teamId,
        groupId,
        resourceType: PerResourceTypeEnum.app,
        resourceId: resourceWithReadAndWrite,
        permission: ReadPermissionVal
      },
      {
        teamId,
        orgId,
        resourceType: PerResourceTypeEnum.app,
        resourceId: resourceWithReadAndWrite,
        permission: WritePermissionVal
      },
      {
        teamId,
        groupId,
        resourceType: PerResourceTypeEnum.app,
        resourceId: resourceWithReadOnly,
        permission: ReadPermissionVal
      },
      {
        teamId,
        tmbId,
        resourceType: PerResourceTypeEnum.app,
        resourceId: resourceWithChatLogRole,
        permission: AppReadChatLogRoleVal
      }
    ]);

    const commonOptions = {
      teamId: String(teamId),
      resourceType: PerResourceTypeEnum.app,
      tmbId: String(tmbId),
      groupIds: [String(groupId)],
      orgIds: [String(orgId)],
      personalPermissionPriority: false
    } as const;

    await expect(
      resourcePermissionRepo.findResourceKeysByCollaboratorsPermission({
        ...commonOptions,
        permission: ReadPermissionVal | WritePermissionVal,
        matchLogic: 'or'
      })
    ).resolves.toEqual(
      expect.arrayContaining([
        String(resourceWithReadAndWrite),
        String(resourceWithReadOnly),
        String(resourceWithChatLogRole)
      ])
    );

    await expect(
      resourcePermissionRepo.findResourceKeysByCollaboratorsPermission({
        ...commonOptions,
        permission: ReadPermissionVal | WritePermissionVal,
        matchLogic: 'and'
      })
    ).resolves.toEqual([String(resourceWithReadAndWrite)]);
  });

  it('lets personal permission override group and org permissions only when requested', async () => {
    const resourceWithPersonalRead = objectId();
    const resourceWithPersonalNone = objectId();

    await MongoResourcePermission.collection.insertMany([
      {
        teamId,
        tmbId,
        resourceType: PerResourceTypeEnum.app,
        resourceId: resourceWithPersonalRead,
        permission: ReadPermissionVal
      },
      {
        teamId,
        orgId,
        resourceType: PerResourceTypeEnum.app,
        resourceId: resourceWithPersonalRead,
        permission: WritePermissionVal
      },
      {
        teamId,
        tmbId,
        resourceType: PerResourceTypeEnum.app,
        resourceId: resourceWithPersonalNone,
        permission: 0
      },
      {
        teamId,
        orgId,
        resourceType: PerResourceTypeEnum.app,
        resourceId: resourceWithPersonalNone,
        permission: ReadPermissionVal
      }
    ]);

    const baseOptions = {
      teamId: String(teamId),
      resourceType: PerResourceTypeEnum.app,
      tmbId: String(tmbId),
      groupIds: [String(groupId)],
      orgIds: [String(orgId)],
      permission: WritePermissionVal,
      matchLogic: 'or' as const
    };

    await expect(
      resourcePermissionRepo.findResourceKeysByCollaboratorsPermission({
        ...baseOptions,
        personalPermissionPriority: true
      })
    ).resolves.toEqual([]);

    await expect(
      resourcePermissionRepo.findResourceKeysByCollaboratorsPermission({
        ...baseOptions,
        personalPermissionPriority: false
      })
    ).resolves.toEqual([String(resourceWithPersonalRead)]);

    const readOptions = {
      ...baseOptions,
      permission: ReadPermissionVal
    } as const;

    await expect(
      resourcePermissionRepo.findResourceKeysByCollaboratorsPermission({
        ...readOptions,
        personalPermissionPriority: true
      })
    ).resolves.toEqual([String(resourceWithPersonalRead)]);

    await expect(
      resourcePermissionRepo.findResourceKeysByCollaboratorsPermission({
        ...readOptions,
        personalPermissionPriority: false
      })
    ).resolves.toEqual(
      expect.arrayContaining([String(resourceWithPersonalRead), String(resourceWithPersonalNone)])
    );
  });

  it('uses resourceId for model permissions', async () => {
    await MongoResourcePermission.collection.insertMany([
      {
        teamId,
        tmbId,
        resourceType: PerResourceTypeEnum.model,
        resourceId: 'model-with-manage',
        permission: ManagePermissionVal
      },
      {
        teamId,
        groupId,
        resourceType: PerResourceTypeEnum.model,
        resourceId: 'model-with-read',
        permission: ReadPermissionVal
      }
    ]);

    const modelIds = await resourcePermissionRepo.findResourceKeysByCollaboratorsPermission({
      teamId: String(teamId),
      resourceType: PerResourceTypeEnum.model,
      tmbId: String(tmbId),
      groupIds: [String(groupId)],
      orgIds: [],
      permission: ReadPermissionVal,
      matchLogic: 'or',
      personalPermissionPriority: true
    });

    expect(modelIds.toSorted()).toEqual(['model-with-manage', 'model-with-read']);
  });

  it('rejects owner and invalid permission queries before reading Mongo', async () => {
    await expect(
      resourcePermissionRepo.findResourceKeysByCollaboratorsPermission({
        teamId: String(teamId),
        resourceType: PerResourceTypeEnum.app,
        tmbId: String(tmbId),
        groupIds: [],
        orgIds: [],
        permission: OwnerPermissionVal,
        matchLogic: 'or',
        personalPermissionPriority: false
      })
    ).rejects.toThrow('Owner permission');

    await expect(
      resourcePermissionRepo.findResourceKeysByCollaboratorsPermission({
        teamId: String(teamId),
        resourceType: PerResourceTypeEnum.app,
        tmbId: String(tmbId),
        groupIds: [],
        orgIds: [],
        permission: 0,
        matchLogic: 'or',
        personalPermissionPriority: false
      })
    ).rejects.toThrow('Permission mask');

    await expect(
      resourcePermissionRepo.findResourceKeysByCollaboratorsPermission({
        teamId: String(teamId),
        resourceType: PerResourceTypeEnum.team,
        tmbId: String(tmbId),
        groupIds: [],
        orgIds: [],
        permission: ReadPermissionVal,
        matchLogic: 'or',
        personalPermissionPriority: false
      })
    ).rejects.toThrow('does not support resource list queries');
  });
});

describe('resourcePermissionRepo mutation helpers', () => {
  const teamId = objectId();

  beforeEach(async () => {
    await MongoResourcePermission.deleteMany({});
  });

  it('replaces team and model ACLs through the repository', async () => {
    const oldTmbId = objectId();
    const newTmbId = objectId();

    await MongoResourcePermission.collection.insertMany([
      {
        teamId,
        resourceType: PerResourceTypeEnum.team,
        resourceId: null,
        tmbId: oldTmbId,
        permission: ManagePermissionVal
      },
      {
        teamId,
        resourceType: PerResourceTypeEnum.team,
        tmbId: newTmbId,
        permission: ReadPermissionVal
      }
    ]);

    await resourcePermissionRepo.replaceTeam({
      teamId: String(teamId),
      collaborators: [{ tmbId: String(newTmbId), permission: WritePermissionVal }]
    });

    const teamRows = await resourcePermissionRepo.findByResource({
      teamId: String(teamId),
      resourceType: PerResourceTypeEnum.team
    });
    expect(teamRows).toHaveLength(1);
    expect(String(teamRows[0].tmbId)).toBe(String(newTmbId));
    expect(teamRows[0].permission).toBe(WritePermissionVal);

    await resourcePermissionRepo.replaceResourceByName({
      teamId: String(teamId),
      resourceType: PerResourceTypeEnum.model,
      resourceName: 'model-a',
      collaborators: [{ tmbId: String(newTmbId), permission: ReadPermissionVal }]
    });

    const modelRows = await resourcePermissionRepo.findByResourceName({
      teamId: String(teamId),
      resourceType: PerResourceTypeEnum.model,
      resourceName: 'model-a'
    });
    expect(modelRows).toHaveLength(1);
    expect(String(modelRows[0].tmbId)).toBe(String(newTmbId));
    expect(modelRows[0].permission).toBe(ReadPermissionVal);
  });

  it('transfers member permissions and merges duplicate resources', async () => {
    const oldTmbId = objectId();
    const newTmbId = objectId();
    const resourceId = objectId();
    const otherResourceId = objectId();

    await MongoResourcePermission.collection.insertMany([
      {
        teamId,
        resourceType: PerResourceTypeEnum.app,
        resourceId,
        tmbId: oldTmbId,
        permission: ReadPermissionVal
      },
      {
        teamId,
        resourceType: PerResourceTypeEnum.app,
        resourceId,
        tmbId: newTmbId,
        permission: WritePermissionVal
      },
      {
        teamId,
        resourceType: PerResourceTypeEnum.app,
        resourceId: otherResourceId,
        tmbId: oldTmbId,
        permission: ManagePermissionVal
      }
    ]);

    await resourcePermissionRepo.transferTmbPermissions({
      teamId: String(teamId),
      oldTmbId: String(oldTmbId),
      newTmbId: String(newTmbId),
      resourceType: PerResourceTypeEnum.app,
      resourceIds: [String(resourceId), String(otherResourceId)]
    });

    const rows = await resourcePermissionRepo.findByResourceIds({
      teamId: String(teamId),
      resourceType: PerResourceTypeEnum.app,
      resourceIds: [String(resourceId), String(otherResourceId)]
    });

    expect(rows).toHaveLength(2);
    expect(rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ permission: ReadPermissionVal | WritePermissionVal }),
        expect.objectContaining({ permission: ManagePermissionVal })
      ])
    );
    expect(rows.every((row) => String(row.tmbId) === String(newTmbId))).toBe(true);
  });

  it('migrates organization permissions and merges target collisions', async () => {
    const oldOrgId = objectId();
    const newOrgId = objectId();
    const removedOrgId = objectId();
    const resourceId = objectId();

    await MongoResourcePermission.collection.insertMany([
      {
        teamId,
        resourceType: PerResourceTypeEnum.app,
        resourceId,
        orgId: oldOrgId,
        permission: ReadPermissionVal
      },
      {
        teamId,
        resourceType: PerResourceTypeEnum.app,
        resourceId,
        orgId: newOrgId,
        permission: ManagePermissionVal
      },
      {
        teamId,
        resourceType: PerResourceTypeEnum.app,
        resourceId: objectId(),
        orgId: removedOrgId,
        permission: ReadPermissionVal
      }
    ]);

    await resourcePermissionRepo.migrateOrgPermissions({
      teamId: String(teamId),
      orgIdMap: new Map([
        [String(oldOrgId), String(newOrgId)],
        [String(removedOrgId), undefined]
      ])
    });

    const rows = await MongoResourcePermission.find({ teamId }).lean();
    expect(rows).toHaveLength(1);
    expect(String(rows[0].orgId)).toBe(String(newOrgId));
    expect(rows[0].permission).toBe(ReadPermissionVal | ManagePermissionVal);
  });

  it('replaces multiple resource snapshots in batches', async () => {
    const firstResourceId = objectId();
    const secondResourceId = objectId();
    const staleCollaboratorId = objectId();
    const activeCollaborators = Array.from({ length: 1001 }, (_, index) => ({
      tmbId: String(objectId()),
      permission: index === 0 ? WritePermissionVal : ReadPermissionVal
    }));

    await MongoResourcePermission.collection.insertMany([
      {
        teamId,
        resourceType: PerResourceTypeEnum.app,
        resourceId: firstResourceId,
        tmbId: staleCollaboratorId,
        permission: ReadPermissionVal
      },
      {
        teamId,
        resourceType: PerResourceTypeEnum.app,
        resourceId: secondResourceId,
        tmbId: staleCollaboratorId,
        permission: ManagePermissionVal
      }
    ]);

    await resourcePermissionRepo.replaceResources({
      teamId: String(teamId),
      resourceType: PerResourceTypeEnum.app,
      resources: [
        {
          resourceId: String(firstResourceId),
          collaborators: activeCollaborators
        },
        {
          resourceId: String(secondResourceId),
          collaborators: []
        }
      ]
    });

    const rows = await resourcePermissionRepo.findByResourceIds({
      teamId: String(teamId),
      resourceType: PerResourceTypeEnum.app,
      resourceIds: [String(firstResourceId), String(secondResourceId)]
    });
    expect(rows).toHaveLength(1001);
    const activeRow = rows.find((row) => String(row.tmbId) === activeCollaborators[0].tmbId);
    expect(activeRow).toMatchObject({ permission: WritePermissionVal });
    expect(String(activeRow?.resourceId)).toBe(String(firstResourceId));
  });
});

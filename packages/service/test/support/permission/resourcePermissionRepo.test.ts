import {
  ManagePermissionVal,
  PerResourceTypeEnum,
  ReadPermissionVal,
  WritePermissionVal
} from '@fastgpt/global/support/permission/constant';
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
      expect.arrayContaining([String(resourceWithReadAndWrite), String(resourceWithReadOnly)])
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

  it('uses resourceName for model permissions', async () => {
    await MongoResourcePermission.collection.insertMany([
      {
        teamId,
        tmbId,
        resourceType: PerResourceTypeEnum.model,
        resourceName: 'model-with-manage',
        permission: ManagePermissionVal
      },
      {
        teamId,
        groupId,
        resourceType: PerResourceTypeEnum.model,
        resourceName: 'model-with-read',
        permission: ReadPermissionVal
      }
    ]);

    const modelNames = await resourcePermissionRepo.findResourceKeysByCollaboratorsPermission({
      teamId: String(teamId),
      resourceType: PerResourceTypeEnum.model,
      tmbId: String(tmbId),
      groupIds: [String(groupId)],
      orgIds: [],
      permission: ReadPermissionVal,
      matchLogic: 'or',
      personalPermissionPriority: true
    });

    expect(modelNames.toSorted()).toEqual(['model-with-manage', 'model-with-read']);
  });
});

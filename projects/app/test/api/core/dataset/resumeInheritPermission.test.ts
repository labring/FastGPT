import handler from '@/pages/api/core/dataset/resumeInheritPermission';
import { DatasetTypeEnum } from '@fastgpt/global/core/dataset/constants';
import {
  OwnerRoleVal,
  PerResourceTypeEnum,
  ReadRoleVal
} from '@fastgpt/global/support/permission/constant';
import { MongoDataset } from '@fastgpt/service/core/dataset/schema';
import { MongoResourcePermission } from '@fastgpt/service/support/permission/schema';
import { getFakeUsers } from '@test/datas/users';
import { Call } from '@test/utils/request';
import { describe, expect, it } from 'vitest';

describe('resume dataset inherit permission api', () => {
  it('restores inheritance for a root dataset and persists the flag', async () => {
    const users = await getFakeUsers(1);
    const dataset = await MongoDataset.create({
      name: 'resume-dataset',
      type: DatasetTypeEnum.dataset,
      teamId: users.owner.teamId,
      tmbId: users.owner.tmbId,
      inheritPermission: false
    });

    const res = await Call(handler, {
      auth: users.owner,
      body: { datasetId: String(dataset._id) }
    });

    expect(res.code).toBe(200);
    await expect(MongoDataset.findById(dataset._id).lean()).resolves.toMatchObject({
      inheritPermission: true
    });
  });

  it('rejects a caller without dataset manage permission', async () => {
    const users = await getFakeUsers(1);
    const dataset = await MongoDataset.create({
      name: 'protected-resume-dataset',
      type: DatasetTypeEnum.dataset,
      teamId: users.owner.teamId,
      tmbId: users.owner.tmbId,
      inheritPermission: false
    });

    const res = await Call(handler, {
      auth: users.members[0],
      body: { datasetId: String(dataset._id) }
    });

    expect(res.code).not.toBe(200);
    await expect(MongoDataset.findById(dataset._id).lean()).resolves.toMatchObject({
      inheritPermission: false
    });
  });

  it('restores inheritance for a child dataset and materializes the parent ACL', async () => {
    const users = await getFakeUsers(2);
    const parent = await MongoDataset.create({
      name: 'resume-child-dataset-parent',
      type: DatasetTypeEnum.folder,
      teamId: users.owner.teamId,
      tmbId: users.owner.tmbId
    });
    const child = await MongoDataset.create({
      name: 'resume-child-dataset',
      type: DatasetTypeEnum.dataset,
      teamId: users.owner.teamId,
      tmbId: users.owner.tmbId,
      parentId: parent._id,
      inheritPermission: false
    });
    await MongoResourcePermission.create([
      {
        resourceType: PerResourceTypeEnum.dataset,
        teamId: users.owner.teamId,
        resourceId: String(parent._id),
        tmbId: users.owner.tmbId,
        permission: OwnerRoleVal
      },
      {
        resourceType: PerResourceTypeEnum.dataset,
        teamId: users.owner.teamId,
        resourceId: String(parent._id),
        tmbId: users.members[0].tmbId,
        permission: ReadRoleVal
      },
      {
        resourceType: PerResourceTypeEnum.dataset,
        teamId: users.owner.teamId,
        resourceId: String(child._id),
        tmbId: users.owner.tmbId,
        permission: OwnerRoleVal
      }
    ]);

    const res = await Call(handler, {
      auth: users.owner,
      body: { datasetId: String(child._id) }
    });

    expect(res.code).toBe(200);
    await expect(MongoDataset.findById(child._id).lean()).resolves.toMatchObject({
      inheritPermission: true
    });
    await expect(
      MongoResourcePermission.find({
        resourceType: PerResourceTypeEnum.dataset,
        teamId: users.owner.teamId,
        resourceId: String(child._id)
      }).lean()
    ).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ tmbId: users.owner.tmbId, permission: OwnerRoleVal }),
        expect.objectContaining({ tmbId: users.members[0].tmbId, permission: ReadRoleVal })
      ])
    );
  });
});

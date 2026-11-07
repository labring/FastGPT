import handler from '@/pages/api/core/dataset/resumeInheritPermission';
import { DatasetTypeEnum } from '@fastgpt/global/core/dataset/constants';
import {
  OwnerRoleVal,
  PerResourceTypeEnum,
  ReadRoleVal
} from '@fastgpt/global/support/permission/constant';
import { MongoDataset } from '@fastgpt/service/core/dataset/schema';
import { MongoResourcePermission } from '@fastgpt/service/support/permission/schema';
import { MongoTeamAudit } from '@fastgpt/service/support/user/audit/schema';
import { AuditEventEnum } from '@fastgpt/global/support/user/audit/constants';
import { getFakeUsers, getRootUser } from '@test/datas/users';
import { Call } from '@test/utils/request';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.unmock('@fastgpt/service/support/user/audit/util');

describe('resume dataset inherit permission api', () => {
  beforeEach(async () => {
    await MongoTeamAudit.deleteMany({});
  });

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

    await vi.waitFor(async () => {
      const audit = await MongoTeamAudit.findOne({
        teamId: users.owner.teamId,
        event: AuditEventEnum.RESUME_INHERIT_PERMISSION
      }).lean();
      expect(audit?.metadata).toEqual({ targetResource: 'resume-dataset' });
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

  it('writes a RESUME_INHERIT_PERMISSION audit after success', async () => {
    const root = await getRootUser();
    const parent = await MongoDataset.create({
      name: 'parent',
      teamId: root.teamId,
      tmbId: root.tmbId,
      vectorModelId: 'test-model'
    });
    const folder = await MongoDataset.create({
      name: 'folder',
      teamId: root.teamId,
      tmbId: root.tmbId,
      vectorModelId: 'test-model',
      parentId: parent._id,
      inheritPermission: false
    });

    const res = await Call(handler, {
      auth: root,
      body: { datasetId: String(folder._id) }
    });

    expect(res.code).toBe(200);

    await vi.waitFor(
      async () => {
        const audit = await MongoTeamAudit.findOne({
          teamId: root.teamId,
          event: AuditEventEnum.RESUME_INHERIT_PERMISSION
        }).lean();
        expect(audit).not.toBeNull();
        expect(audit?.tmbId).toBeDefined();
        expect(audit?.resources).toEqual([{ datasetId: folder._id }]);
        expect(audit?.metadata).toEqual({
          targetResource: 'folder',
          parentResource: 'parent'
        });
      },
      { timeout: 5000 }
    );
  });
});

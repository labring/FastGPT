import handler from '@/pages/api/core/app/resumeInheritPermission';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import {
  OwnerRoleVal,
  PerResourceTypeEnum,
  ReadRoleVal
} from '@fastgpt/global/support/permission/constant';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { MongoResourcePermission } from '@fastgpt/service/support/permission/schema';
import { getFakeUsers } from '@test/datas/users';
import { Call } from '@test/utils/request';
import { describe, expect, it } from 'vitest';

describe('resume app inherit permission api', () => {
  it('restores inheritance for a root app and persists the flag', async () => {
    const users = await getFakeUsers(1);
    const app = await MongoApp.create({
      name: 'resume-app',
      type: AppTypeEnum.simple,
      teamId: users.owner.teamId,
      tmbId: users.owner.tmbId,
      inheritPermission: false
    });

    const res = await Call(handler, {
      auth: users.owner,
      query: { appId: String(app._id) }
    });

    expect(res.code).toBe(200);
    await expect(MongoApp.findById(app._id).lean()).resolves.toMatchObject({
      inheritPermission: true
    });
  });

  it('rejects a caller without app manage permission', async () => {
    const users = await getFakeUsers(1);
    const app = await MongoApp.create({
      name: 'protected-resume-app',
      type: AppTypeEnum.simple,
      teamId: users.owner.teamId,
      tmbId: users.owner.tmbId,
      inheritPermission: false
    });

    const res = await Call(handler, {
      auth: users.members[0],
      query: { appId: String(app._id) }
    });

    expect(res.code).not.toBe(200);
    await expect(MongoApp.findById(app._id).lean()).resolves.toMatchObject({
      inheritPermission: false
    });
  });

  it('restores inheritance for a child app and materializes the parent ACL', async () => {
    const users = await getFakeUsers(2);
    const parent = await MongoApp.create({
      name: 'resume-child-parent',
      type: AppTypeEnum.folder,
      teamId: users.owner.teamId,
      tmbId: users.owner.tmbId
    });
    const child = await MongoApp.create({
      name: 'resume-child-app',
      type: AppTypeEnum.simple,
      teamId: users.owner.teamId,
      tmbId: users.owner.tmbId,
      parentId: parent._id,
      inheritPermission: false
    });
    await MongoResourcePermission.create([
      {
        resourceType: PerResourceTypeEnum.app,
        teamId: users.owner.teamId,
        resourceId: String(parent._id),
        tmbId: users.owner.tmbId,
        permission: OwnerRoleVal
      },
      {
        resourceType: PerResourceTypeEnum.app,
        teamId: users.owner.teamId,
        resourceId: String(parent._id),
        tmbId: users.members[0].tmbId,
        permission: ReadRoleVal
      },
      {
        resourceType: PerResourceTypeEnum.app,
        teamId: users.owner.teamId,
        resourceId: String(child._id),
        tmbId: users.owner.tmbId,
        permission: OwnerRoleVal
      }
    ]);

    const res = await Call(handler, {
      auth: users.owner,
      query: { appId: String(child._id) }
    });

    expect(res.code).toBe(200);
    await expect(MongoApp.findById(child._id).lean()).resolves.toMatchObject({
      inheritPermission: true
    });
    await expect(
      MongoResourcePermission.find({
        resourceType: PerResourceTypeEnum.app,
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

import handler from '@/pages/api/core/app/resumeInheritPermission';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import { MongoApp } from '@fastgpt/service/core/app/schema';
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
});

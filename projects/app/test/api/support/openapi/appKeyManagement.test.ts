import { beforeEach, describe, expect, it, vi } from 'vitest';
import createKey from '@/pages/api/support/openapi/create';
import listKeys from '@/pages/api/support/openapi/list';
import copyKey from '@/pages/api/support/openapi/copy';
import updateKey from '@/pages/api/support/openapi/update';
import { backfillOpenApiKeyTypeRecord } from '@/migration/tasks/4180/20261104_backfill_openapi_key_type/service';
import deleteKey from '@/pages/api/support/openapi/delete';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { MongoOpenApi } from '@fastgpt/service/support/openapi/schema';
import { MongoResourcePermission } from '@fastgpt/service/support/permission/schema';
import {
  ManageRoleVal,
  ReadRoleVal,
  WriteRoleVal
} from '@fastgpt/global/support/permission/constant';
import { AppReadChatLogRoleVal } from '@fastgpt/global/support/permission/app/constant';
import { TeamApikeyCreatePermissionVal } from '@fastgpt/global/support/permission/user/constant';
import { getFakeUsers } from '@test/datas/users';
import { Call } from '@test/utils/request';

// 团队锁的真实互斥由服务集成验证，本例保留真实资源 ACL 和 Mongo CRUD。
vi.mock('@fastgpt/service/support/user/lock', () => ({
  withTeamLock: vi.fn(async (_teamId, fn) => fn())
}));

let admins: Awaited<ReturnType<typeof getFakeUsers>>['members'];
let appId: string;

beforeEach(async () => {
  const { owner, members } = await getFakeUsers(2);
  admins = members;
  const app = await MongoApp.create({
    name: 'shared management',
    type: 'simple',
    teamId: owner.teamId,
    tmbId: owner.tmbId
  });
  appId = String(app._id);
  await MongoResourcePermission.create(
    admins.map((member) => ({
      resourceType: 'app',
      teamId: member.teamId,
      resourceId: appId,
      tmbId: member.tmbId,
      permission: ManageRoleVal
    }))
  );
});

describe('application administrators share key management', () => {
  it.each([undefined, 'personal'])(
    'keeps migrated historical default-app keys private to their member (%s)',
    async (type) => {
      const [member, otherAdmin] = admins;
      const key = new MongoOpenApi({
        teamId: member.teamId,
        tmbId: member.tmbId,
        apiKey: 'legacy-default-app-secret',
        name: 'historical personal key',
        appId: appId.toUpperCase(),
        ...(type ? { type } : {})
      });
      await MongoOpenApi.collection.insertOne(key.toObject({ getters: false }));
      await MongoResourcePermission.deleteMany({ resourceId: appId, tmbId: member.tmbId });
      const id = String(key._id);
      await backfillOpenApiKeyTypeRecord(id);
      const ownList = await Call(listKeys, { auth: member });
      expect(ownList.error).toBeUndefined();
      expect(ownList.data).toEqual([
        expect.objectContaining({
          _id: id,
          type: 'personal',
          defaultAppId: appId,
          authProxy: false
        })
      ]);
      expect(ownList.data[0].appId).toBeUndefined();
      const appList = await Call(listKeys, { auth: otherAdmin, query: { type: 'app', appId } });
      expect(appList.data).toEqual([]);
      expect((await Call(copyKey, { auth: member, body: { id } })).data).toBe(
        'legacy-default-app-secret'
      );
      expect((await Call(copyKey, { auth: otherAdmin, body: { id } })).error).toBeDefined();
      const updated = await Call(updateKey, { auth: member, body: { _id: id, name: 'updated' } });
      expect(updated.error).toBeUndefined();
      expect(String((await MongoOpenApi.findById(id).lean())?.appId)).toBe(appId);
      expect((await Call(deleteKey, { auth: otherAdmin, query: { id } })).error).toBeDefined();
      expect((await Call(deleteKey, { auth: member, query: { id } })).error).toBeUndefined();
    }
  );

  it('lets each administrator view, copy, edit and delete the other administrator’s application key', async () => {
    for (const [index, admin] of admins.entries()) {
      const result = await Call(createKey, {
        auth: admin,
        body: { type: 'app', appId, name: `key-${index}` }
      });
      expect(result.error).toBeUndefined();
    }
    const keys = await MongoOpenApi.find({ appId }).sort({ name: 1 }).lean();
    expect(keys).toHaveLength(2);
    for (const [index, admin] of admins.entries()) {
      const otherKey = keys[1 - index];
      const id = String(otherKey._id);
      const list = await Call(listKeys, { auth: admin, query: { type: 'app', appId } });
      expect(list.error).toBeUndefined();
      expect(list.data.map((key: { _id: string }) => key._id).sort()).toEqual(
        keys.map((key) => String(key._id)).sort()
      );
      const copy = await Call(copyKey, { auth: admin, body: { id } });
      expect(copy.error).toBeUndefined();
      expect(copy.data).toBe(otherKey.apiKey);
      const update = await Call(updateKey, {
        auth: admin,
        body: { _id: id, name: `edited-${index}` }
      });
      expect(update.error).toBeUndefined();
      expect(await MongoOpenApi.findById(id).lean()).toMatchObject({
        name: `edited-${index}`,
        tmbId: otherKey.tmbId
      });
    }
    for (const [index, admin] of admins.entries()) {
      const result = await Call(deleteKey, {
        auth: admin,
        query: { id: String(keys[1 - index]._id) }
      });
      expect(result.error).toBeUndefined();
    }
    expect(await MongoOpenApi.countDocuments({ appId })).toBe(0);
    const personal = await Call(createKey, {
      auth: admins[0],
      body: { type: 'personal', name: 'requires team permission' }
    });
    expect(personal.error).toBeDefined();
  });

  it('rejects every management operation after the creator loses application management permission', async () => {
    const admin = admins[0];
    await MongoResourcePermission.create({
      resourceType: 'team',
      teamId: admin.teamId,
      resourceId: null,
      tmbId: admin.tmbId,
      permission: TeamApikeyCreatePermissionVal
    });
    const key = await MongoOpenApi.create({
      type: 'app',
      appId,
      teamId: admin.teamId,
      tmbId: admin.tmbId,
      name: 'existing key',
      apiKey: 'management-fixture-key'
    });
    const id = String(key._id);
    // 使用、编辑、日志查看和无权限都不等于管理；团队创建权限和创建人身份不能替代应用权限。
    for (const permission of [0, ReadRoleVal, WriteRoleVal, AppReadChatLogRoleVal]) {
      await MongoResourcePermission.updateOne(
        { resourceType: 'app', resourceId: appId, tmbId: admin.tmbId },
        { $set: { permission } }
      );
      const calls = [
        () => Call(createKey, { auth: admin, body: { type: 'app', appId, name: 'forbidden' } }),
        () => Call(listKeys, { auth: admin, query: { type: 'app', appId } }),
        () => Call(copyKey, { auth: admin, body: { id } }),
        () => Call(updateKey, { auth: admin, body: { _id: id, name: 'forbidden' } }),
        () => Call(deleteKey, { auth: admin, query: { id } })
      ];
      for (const call of calls) {
        const result = await call();
        expect(result.error, `role=${permission}`).toBeDefined();
        expect(result.data).toBeUndefined();
      }
      expect(await MongoOpenApi.countDocuments({ appId })).toBe(1);
      expect(await MongoOpenApi.findById(id).lean()).toMatchObject({ name: 'existing key' });
    }
    const allowed = await Call(listKeys, { auth: admins[1], query: { type: 'app', appId } });
    expect(allowed.error).toBeUndefined();
    expect(allowed.data.map((item: { _id: string }) => item._id)).toEqual([id]);
  });
});

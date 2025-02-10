import { MongoApp } from '@fastgpt/service/core/app/schema';
import { MongoAppVersion } from '@fastgpt/service/core/app/version/schema';
import { getRootUser } from '@test/datas/users';
import { Call } from '@test/utils/request';
import { describe, expect, it } from 'vitest';
import handler, { type versionListBody, type versionListResponse } from './list';

describe('app version list test', () => {
  it('should return app version list', async () => {
    const root = await getRootUser();
    const app = await MongoApp.create({
      name: 'test',
      tmbId: root.tmbId,
      teamId: root.teamId
    });
    await MongoAppVersion.create(
      [...Array(10).keys()].map((i) => ({
        tmbId: root.tmbId,
        appId: app._id,
        versionName: `v${i}`
      }))
    );
    const res = await Call<versionListBody, {}, versionListResponse>(handler, {
      auth: root,
      body: {
        pageSize: 10,
        offset: 0,
        appId: app._id
      }
    });
    expect(res.code).toBe(200);
    expect(res.data.total).toBe(10);
    expect(res.data.list.length).toBe(10);
  });
});

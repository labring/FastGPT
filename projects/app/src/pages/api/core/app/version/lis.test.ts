import '@/pages/api/__mocks__/base';
import { root } from '@/pages/api/__mocks__/db/init';
import { getTestRequest } from '@/test/utils';
import handler, { versionListBody, versionListResponse } from './list';

// Import the schema
import { MongoAppVersion } from '@fastgpt/service/core/app/version/schema';

const total = 22;

beforeAll(async () => {
  const arr = new Array(total).fill(0);
  await MongoAppVersion.insertMany(
    arr.map((_, index) => ({
      appId: root.appId,
      nodes: [],
      edges: [],
      chatConfig: {},
      isPublish: index % 2 === 0,
      versionName: `v` + index,
      tmbId: root.tmbId,
      time: new Date(index * 1000)
    }))
  );
});

test('Get version list and check', async () => {
  const offset = 0;
  const pageSize = 10;

  const _res = (await handler(
    ...getTestRequest<{}, versionListBody>({
      body: {
        offset,
        pageSize,
        appId: root.appId
      },
      user: root
    })
  )) as any;
  const res = _res.data as versionListResponse;

  expect(res.total).toBe(total);
  expect(res.list.length).toBe(pageSize);
  expect(res.list[0].versionName).toBe('v21');
  expect(res.list[9].versionName).toBe('v12');
});

test('Get version list with offset 20', async () => {
  const offset = 20;
  const pageSize = 10;

  const _res = (await handler(
    ...getTestRequest<{}, versionListBody>({
      body: {
        offset,
        pageSize,
        appId: root.appId
      },
      user: root
    })
  )) as any;
  const res = _res.data as versionListResponse;

  expect(res.total).toBe(total);
  expect(res.list.length).toBe(2);
  expect(res.list[0].versionName).toBe('v1');
  expect(res.list[1].versionName).toBe('v0');
});

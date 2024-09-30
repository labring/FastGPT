import '@/pages/api/__mocks__/base';
import { root } from '@/pages/api/__mocks__/db/init';
import { getTestRequest } from '@/test/utils';
import handler, { getLatestVersionQuery, getLatestVersionResponse } from './latest';
import { MongoAppVersion } from '@fastgpt/service/core/app/version/schema';

beforeAll(async () => {
  // 创建3个测试数据，其中2个是已发布的
  await MongoAppVersion.create([
    {
      appId: root.appId,
      nodes: [1],
      edges: [],
      chatConfig: {},
      isPublish: false,
      versionName: 'v1',
      tmbId: root.tmbId,
      time: new Date('2023-01-01')
    },
    {
      appId: root.appId,
      nodes: [2],
      edges: [],
      chatConfig: {},
      isPublish: true,
      versionName: 'v2',
      tmbId: root.tmbId,
      time: new Date('2023-01-02')
    },
    {
      appId: root.appId,
      nodes: [3],
      edges: [],
      chatConfig: {},
      isPublish: false,
      versionName: 'v3',
      tmbId: root.tmbId,
      time: new Date('2023-01-03')
    }
  ]);
});

test('获取最新版本并检查', async () => {
  const _res = (await handler(
    ...getTestRequest<{}, getLatestVersionQuery>({
      query: {
        appId: root.appId
      },
      user: root
    })
  )) as any;
  const res = _res.data as getLatestVersionResponse;

  expect(res.nodes[0]).toEqual(2);
});

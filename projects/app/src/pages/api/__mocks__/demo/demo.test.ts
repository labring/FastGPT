import '@/pages/api/__mocks__/base';
import { root } from '@/pages/api/__mocks__/db/init';
import { getTestRequest } from '@/test/utils';
import { AppErrEnum } from '@fastgpt/global/common/error/code/app';
import handler from './demo';

// Import the schema
import { MongoOutLink } from '@fastgpt/service/support/outLink/schema';

beforeAll(async () => {
  // await MongoOutLink.create({
  //   shareId: 'aaa',
  //   appId: root.appId,
  //   tmbId: root.tmbId,
  //   teamId: root.teamId,
  //   type: 'share',
  //   name: 'aaa'
  // })
});

test('Should return a list of outLink', async () => {
  // Mock request
  const res = (await handler(
    ...getTestRequest({
      query: {
        appId: root.appId,
        type: 'share'
      },
      user: root
    })
  )) as any;

  expect(res.code).toBe(200);
  expect(res.data.length).toBe(2);
});

test('appId is required', async () => {
  const res = (await handler(
    ...getTestRequest({
      query: {
        type: 'share'
      },
      user: root
    })
  )) as any;
  expect(res.code).toBe(500);
  expect(res.error).toBe(AppErrEnum.unExist);
});

test('if type is not provided, return nothing', async () => {
  const res = (await handler(
    ...getTestRequest({
      query: {
        appId: root.appId
      },
      user: root
    })
  )) as any;
  expect(res.code).toBe(200);
  expect(res.data.length).toBe(0);
});

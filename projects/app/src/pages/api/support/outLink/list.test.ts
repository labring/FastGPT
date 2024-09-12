import '../../__mocks__/base';
import '../../__mocks__/auth/app';
const mockingoose = require('mockingoose'); // !important: must import using require

import { getTestRequest } from '@/test/utils';
import { root } from '../../__mocks__/db/init';
import type { OutLinkListQuery } from './list';
import { MongoOutLink } from '@fastgpt/service/support/outLink/schema';
import { AppErrEnum } from '@fastgpt/global/common/error/code/app';

import handler from './list';
import { testApp_root_root_simple_1 } from '@/test/test-cases/app';

test('Should return a list of outLink', async () => {
  mockingoose(MongoOutLink).toReturn([{ _id: '1' }, { _id: '2' }], 'find');

  const res = (await handler(
    ...getTestRequest<OutLinkListQuery>({
      query: {
        appId: testApp_root_root_simple_1._id,
        type: 'share'
      }
    })
  )) as any;
  expect(res.data.length).toBe(2);
});

test('appId is required', async () => {
  const res = (await handler(
    ...getTestRequest<OutLinkListQuery>({
      query: {
        type: 'share'
      }
    })
  )) as any;
  expect(res.code).toBe(500);
  expect(res.error).toBe(AppErrEnum.unExist);
});

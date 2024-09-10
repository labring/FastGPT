import '../../__mocks__/base';
import '../../__mocks__/auth/app';
import '../../__mocks__/db/outLink';
import { setApp } from '../../__mocks__/auth/app';

import { handler } from './list';
import { TestRequest } from '@/test/utils';

beforeEach(() => {
  setApp({
    app: {
      _id: 'AppId',
      type: 'mock-app-type'
    }
  });
});

test('Should return a list of outLink', async () => {
  const res = await handler({
    query: {
      type: 'someType',
      appId: 'AppId'
    },
    body: {}
  } as any);
  console.log(res);
});

test('appId is required', async () => {
  const res = await handler({} as TestRequest as any);
  console.log(res);
  // expect(res.code).toBe(OutLinkErrEnum.linkUnInvalid);
});

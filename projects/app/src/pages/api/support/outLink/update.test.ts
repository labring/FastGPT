import '../../__mocks__/base';
import '../../__mocks__/auth/app';
const mockingoose = require('mockingoose'); // !important: must import using require
import { getTestRequest } from '@/test/utils';

import handler, { OutLinkUpdateBody, OutLinkUpdateQuery } from './update';
import { setAuthAppRet } from '../../__mocks__/auth/app';
import { Permission } from '@fastgpt/global/support/permission/controller';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { root } from '../../__mocks__/db/init';

test('Update Outlink', async () => {
  setAuthAppRet({
    teamId: '1',
    tmbId: '1',
    permission: new Permission({
      isOwner: true
    }),
    app: MongoApp.findById(root.appId)
  });

  const res = (await handler(
    ...getTestRequest<OutLinkUpdateQuery, OutLinkUpdateBody>({
      query: {},
      body: {
        _id: '1',
        name: 'test'
      }
    })
  )) as any;
  expect(res.data.length).toBe(2);
});

// test('appId is required', async () => {
//   const res = (await handler(
//     ...getTestRequest<Outli>({
//       query: {
//         type: 'share'
//       },
//     })
//   )) as any;
//   expect(res.code).toBe(500);
//   expect(res.error).toBe(AppErrEnum.unExist);
// });

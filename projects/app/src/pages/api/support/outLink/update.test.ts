import { getTestRequest } from '@/test/utils';
import '../../__mocks__/base';
import handler, { OutLinkUpdateBody, OutLinkUpdateQuery } from './update';
import { root } from '../../__mocks__/db/init';
import { MongoOutLink } from '@fastgpt/service/support/outLink/schema';
import { CommonErrEnum } from '@fastgpt/global/common/error/code/common';

test('Update Outlink', async () => {
  const outlink = await MongoOutLink.create({
    shareId: 'aaa',
    appId: root.appId,
    tmbId: root.tmbId,
    teamId: root.teamId,
    type: 'share',
    name: 'aaa'
  });

  await outlink.save();

  const res = (await handler(
    ...getTestRequest<OutLinkUpdateQuery, OutLinkUpdateBody>({
      body: {
        _id: outlink._id,
        name: 'changed'
      },
      user: root
    })
  )) as any;

  expect(res.code).toBe(200);

  const link = await MongoOutLink.findById(outlink._id).lean();
  expect(link?.name).toBe('changed');
});

test('Did not post _id', async () => {
  const res = (await handler(
    ...getTestRequest<OutLinkUpdateQuery, OutLinkUpdateBody>({
      body: {
        name: 'changed'
      },
      user: root
    })
  )) as any;

  expect(res.code).toBe(500);
  expect(res.error).toBe(CommonErrEnum.missingParams);
});

import '../../__mocks__/base';
import { getTestRequest } from '@/test/utils';
import handler, { OutLinkUpdateBody, OutLinkUpdateQuery } from './update';
import { MongoOutLink } from '@fastgpt/service/support/outLink/schema';
import { CommonErrEnum } from '@fastgpt/global/common/error/code/common';
import { root } from '../../__mocks__/db/init';

beforeAll(async () => {
  await MongoOutLink.create({
    shareId: 'aaa',
    appId: root.appId,
    tmbId: root.tmbId,
    teamId: root.teamId,
    type: 'share',
    name: 'aaa'
  });
});

test('Update Outlink', async () => {
  const outlink = await MongoOutLink.findOne({ name: 'aaa' }).lean();
  if (!outlink) {
    throw new Error('Outlink not found');
  }

  const res = (await handler(
    ...getTestRequest<OutLinkUpdateQuery, OutLinkUpdateBody>({
      body: {
        _id: outlink._id,
        name: 'changed'
      },
      user: root
    })
  )) as any;

  console.log(res);
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

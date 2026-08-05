import type { OutLinkCountResponseType } from '@fastgpt/global/openapi/support/outLink/api';
import { PublishChannelEnum } from '@fastgpt/global/support/outLink/constant';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { MongoOutLink } from '@fastgpt/service/support/outLink/schema';
import { getRootUser } from '@test/datas/users';
import { Call } from '@test/utils/request';
import { beforeEach, describe, expect, it } from 'vitest';
import * as countApi from '@/pages/api/support/outLink/count';

describe('OutLink Count API', () => {
  let rootUser: Awaited<ReturnType<typeof getRootUser>>;
  let testApp: Awaited<ReturnType<typeof MongoApp.create>>;
  let otherApp: Awaited<ReturnType<typeof MongoApp.create>>;
  let emptyApp: Awaited<ReturnType<typeof MongoApp.create>>;

  beforeEach(async () => {
    rootUser = await getRootUser();
    const appData = {
      type: 'simple' as const,
      tmbId: rootUser.tmbId,
      teamId: rootUser.teamId
    };
    [testApp, otherApp, emptyApp] = await Promise.all([
      MongoApp.create({ ...appData, name: 'Test App for OutLink Count' }),
      MongoApp.create({ ...appData, name: 'Other App for OutLink Count' }),
      MongoApp.create({ ...appData, name: 'Empty App for OutLink Count' })
    ]);
  });

  const createOutLink = (appId: string, type: PublishChannelEnum) =>
    MongoOutLink.create({
      shareId: `${appId}-${type}-${Math.random()}`,
      teamId: rootUser.teamId,
      tmbId: rootUser.tmbId,
      appId,
      name: `Test ${type}`,
      type
    });

  it('aggregates counted channels, fills missing values, excludes other types and isolates apps', async () => {
    await Promise.all([
      createOutLink(testApp._id, PublishChannelEnum.share),
      createOutLink(testApp._id, PublishChannelEnum.share),
      createOutLink(testApp._id, PublishChannelEnum.feishu),
      createOutLink(testApp._id, PublishChannelEnum.wecom),
      createOutLink(testApp._id, PublishChannelEnum.officialAccount),
      createOutLink(testApp._id, PublishChannelEnum.apikey),
      createOutLink(testApp._id, PublishChannelEnum.playground),
      createOutLink(testApp._id, PublishChannelEnum.iframe),
      createOutLink(otherApp._id, PublishChannelEnum.share),
      createOutLink(otherApp._id, PublishChannelEnum.dingtalk),
      createOutLink(otherApp._id, PublishChannelEnum.wechat)
    ]);

    const res = await Call<OutLinkCountResponseType>(countApi.default, {
      auth: rootUser,
      query: { appId: testApp._id }
    });

    expect(res.code).toBe(200);
    expect(res.data).toEqual({
      share: 2,
      feishu: 1,
      dingtalk: 0,
      wecom: 1,
      wechat: 0,
      official_account: 1
    });
  });

  it('returns zero for every countable channel without configurations', async () => {
    const res = await Call<OutLinkCountResponseType>(countApi.default, {
      auth: rootUser,
      query: { appId: emptyApp._id }
    });

    expect(res.code).toBe(200);
    expect(res.data).toEqual({
      share: 0,
      feishu: 0,
      dingtalk: 0,
      wecom: 0,
      wechat: 0,
      official_account: 0
    });
  });

  it('rejects a missing appId', async () => {
    const res = await Call<OutLinkCountResponseType>(countApi.default, {
      auth: rootUser,
      query: {}
    });

    expect(res.code).toBe(500);
    expect(res.error).toBeDefined();
  });

  it('rejects unauthenticated requests', async () => {
    const res = await Call<OutLinkCountResponseType>(countApi.default, {
      query: { appId: testApp._id }
    });

    expect(res.code).toBe(500);
    expect(res.error).toBeDefined();
  });
});

import { describe, expect, it, vi } from 'vitest';
import { ApiKeyTypeEnum } from '@fastgpt/global/support/openapi/constants';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { MongoChat } from '@fastgpt/service/core/chat/chatSchema';
import { MongoOpenApi } from '@fastgpt/service/support/openapi/schema';
import {
  resolveApiKeyScope,
  getOpenApiTypeFilter,
  getOpenApiAppIdFilter
} from '@fastgpt/service/support/openapi/utils';
import { transferAppApiKeys } from '@fastgpt/service/support/openapi/service';
import { getAppByApiKey } from '@fastgpt/service/support/openapi/auth';
import { getFakeUsers } from '@test/datas/users';
import { Types } from '@fastgpt/service/common/mongo';

const { parseHeaderCert } = await vi.importActual<
  typeof import('@fastgpt/service/support/permission/auth/common')
>('@fastgpt/service/support/permission/auth/common');

const fixture = async () => {
  const {
    owner,
    members: [member]
  } = await getFakeUsers(1);
  const app = await MongoApp.create({
    teamId: owner.teamId,
    tmbId: owner.tmbId,
    name: 'app',
    type: AppTypeEnum.simple
  });
  const appId = String(app._id);
  const [appKey, personalKey] = await MongoOpenApi.create([
    {
      teamId: owner.teamId,
      tmbId: member.tmbId,
      type: 'app',
      appId,
      apiKey: 'fixture-app',
      authProxy: true
    },
    { teamId: owner.teamId, tmbId: member.tmbId, type: 'personal', apiKey: 'fixture-personal' }
  ]);
  return { owner, member, appId, appKey, personalKey };
};

describe('application API key boundaries', () => {
  it('legacy classification is shared by queries and authorization, with no fallback for conflicting records', async () => {
    const id = new Types.ObjectId().toString();
    for (const appId of [undefined, null, ''])
      expect(resolveApiKeyScope({ appId })).toEqual({ type: 'personal' });
    expect(resolveApiKeyScope({ appId: id })).toEqual({ type: 'app', appId: id });
    for (const raw of [
      { type: 'bad' },
      { type: 'personal', appId: id },
      { type: 'app' },
      { appId: 'invalid' },
      { appId: new Types.ObjectId() }
    ])
      expect(() => resolveApiKeyScope(raw)).toThrow();
    const { owner } = await fixture();
    await MongoOpenApi.collection.insertMany([
      {
        teamId: new Types.ObjectId(owner.teamId),
        tmbId: new Types.ObjectId(owner.tmbId),
        apiKey: 'legacy-empty',
        appId: null
      },
      {
        teamId: new Types.ObjectId(owner.teamId),
        tmbId: new Types.ObjectId(owner.tmbId),
        apiKey: 'legacy-bound',
        appId: id
      },
      {
        teamId: new Types.ObjectId(owner.teamId),
        tmbId: new Types.ObjectId(owner.tmbId),
        apiKey: 'unknown-type',
        type: 'unknown'
      }
    ] as any);
    expect(
      (await MongoOpenApi.find(getOpenApiTypeFilter(ApiKeyTypeEnum.personal)).lean())
        .map((k) => k.apiKey)
        .sort()
    ).toEqual(['fixture-personal', 'legacy-empty']);
    expect(
      (await MongoOpenApi.find(getOpenApiTypeFilter(ApiKeyTypeEnum.app)).lean())
        .map((k) => k.apiKey)
        .sort()
    ).toEqual(['fixture-app', 'legacy-bound']);
  });
  it('server flags independently accept each key type; app Key ignores creator ACL but checks every target ID', async () => {
    const { member, appId } = await fixture();
    for (const authApiKey of [false, true])
      for (const authAppApiKey of [false, true]) {
        for (const type of ['personal', 'app']) {
          const result = parseHeaderCert({
            req: { headers: { authorization: `Bearer fixture-${type}` } } as any,
            authApiKey,
            authAppApiKey
          });
          if (type === 'app' ? authAppApiKey : authApiKey)
            expect(await result).toMatchObject({ apiKeyType: type, tmbId: member.tmbId });
          else await expect(result).rejects.toBeDefined();
        }
      }
    const cert = await parseHeaderCert({
      req: { headers: { authorization: 'Bearer fixture-app' } } as any,
      authAppApiKey: true
    });
    expect(cert.apiKeyAuthProxy).toBe(false);
    expect(String((await getAppByApiKey({ ...cert, appId, parsedAppId: appId }))._id)).toBe(appId);
    for (const ids of [
      { appId: new Types.ObjectId().toString() },
      { appId, parsedAppId: new Types.ObjectId().toString() }
    ])
      await expect(getAppByApiKey({ ...cert, ...ids })).rejects.toBeDefined();
    await MongoApp.updateOne({ _id: appId }, { $set: { deleteTime: new Date() } });
    await expect(getAppByApiKey(cert)).rejects.toBeDefined();
  });
  it('application chat access spans authors; draft/editor authentication remains opt-out', async () => {
    const { member, owner, appId } = await fixture();
    const { parseHeaderCert: mocked } =
      await import('@fastgpt/service/support/permission/auth/common');
    const { authChatTargetCrud } = await import('@fastgpt/service/core/chat/auth');
    const cert = await parseHeaderCert({
      req: { headers: { authorization: 'Bearer fixture-app' } } as any,
      authAppApiKey: true
    });
    vi.mocked(mocked).mockResolvedValueOnce(cert);
    await MongoChat.create({
      teamId: owner.teamId,
      tmbId: owner.tmbId,
      appId,
      chatId: 'other-author',
      sourceType: ChatSourceTypeEnum.app,
      source: 'api',
      title: 'history'
    });
    const result = await authChatTargetCrud({
      req: {} as any,
      authToken: true,
      sourceType: ChatSourceTypeEnum.app,
      sourceId: appId,
      chatId: 'other-author',
      per: ReadPermissionVal
    });
    expect(result.scope).toEqual({ teamId: owner.teamId });
    expect(String(result.chat?.tmbId)).toBe(owner.tmbId);
    expect(result.tmbId).toBe(member.tmbId);
    expect(result.app?.permission.isOwner).toBe(false);
  });
  it('legacy uppercase bindings keep ObjectId semantics through query, handover and deletion', async () => {
    const { owner, member, appId, appKey } = await fixture();
    const stored = appId.toUpperCase();
    await MongoOpenApi.updateOne({ _id: appKey._id }, { $set: { appId: stored } });
    expect(resolveApiKeyScope({ appId: stored })).toEqual({ type: 'app', appId });
    expect(
      await MongoOpenApi.countDocuments({
        teamId: owner.teamId,
        ...getOpenApiTypeFilter(ApiKeyTypeEnum.app),
        appId: getOpenApiAppIdFilter([appId])
      })
    ).toBe(1);
    const changes = await transferAppApiKeys({
      teamId: owner.teamId,
      fromTmbIds: [member.tmbId],
      appIds: [appId],
      session: undefined as any
    });
    expect(changes[0]).toMatchObject({ appId, toTmbId: owner.tmbId });
    expect((await MongoOpenApi.findById(appKey._id).lean())?.appId).toBe(stored);
    const { cleanupAppDirectRefs } = await import('@fastgpt/service/core/app/controller');
    await cleanupAppDirectRefs({ teamId: owner.teamId, appIds: [appId] });
    expect(await MongoOpenApi.exists({ _id: appKey._id })).toBeNull();
    expect(await MongoOpenApi.countDocuments({ type: 'personal' })).toBe(1);
  });
  it('handover changes only ownership for selected apps and skips other members keys', async () => {
    const { owner, member, appId, appKey } = await fixture();
    const before = await MongoOpenApi.findById(appKey._id).lean();
    const changes = await transferAppApiKeys({
      teamId: owner.teamId,
      fromTmbIds: [member.tmbId],
      appIds: [appId],
      session: undefined as any
    });
    expect(changes).toEqual([
      expect.objectContaining({
        keyId: String(appKey._id),
        fromTmbId: member.tmbId,
        toTmbId: owner.tmbId,
        appId
      })
    ]);
    const after = await MongoOpenApi.findById(appKey._id).lean();
    expect({ ...after, tmbId: undefined }).toEqual({ ...before, tmbId: undefined });
    expect(String(after?.tmbId)).toBe(owner.tmbId);
    expect(
      await transferAppApiKeys({
        teamId: owner.teamId,
        fromTmbIds: [member.tmbId],
        session: undefined as any
      })
    ).toEqual([]);
  });
});

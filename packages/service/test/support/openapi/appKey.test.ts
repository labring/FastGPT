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
import { MongoDataset } from '@fastgpt/service/core/dataset/schema';
import { authDataset } from '@fastgpt/service/support/permission/dataset/auth';
import { authChatCompletionHeaderRequest } from '@/service/support/permission/auth/chatCompletion';

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
  it.each([undefined, 'personal'])(
    'legacy default app is a fallback, with member ACLs and dataset access before/after backfill (%s)',
    async (type) => {
      const { owner, member, appId } = await fixture();
      const otherApp = await MongoApp.create({
        teamId: owner.teamId,
        tmbId: member.tmbId,
        name: 'member app',
        type: AppTypeEnum.simple
      });
      const alternateApp = await MongoApp.create({
        teamId: owner.teamId,
        tmbId: member.tmbId,
        name: 'another permitted app',
        type: AppTypeEnum.simple
      });
      const dataset = await MongoDataset.create({
        teamId: owner.teamId,
        tmbId: member.tmbId,
        name: 'member dataset',
        type: 'dataset'
      });
      await MongoOpenApi.collection.insertOne({
        teamId: new Types.ObjectId(owner.teamId),
        tmbId: new Types.ObjectId(member.tmbId),
        apiKey: 'legacy-personal',
        appId: String(otherApp._id).toUpperCase(),
        ...(type ? { type } : {})
      });
      const credential = await parseHeaderCert({
        req: { headers: { authorization: 'Bearer legacy-personal' } } as any,
        authApiKey: true
      });
      expect(credential).toMatchObject({
        apiKeyType: 'personal',
        legacyAppId: String(otherApp._id)
      });
      expect(credential.boundAppId).toBeUndefined();
      const req = { auth: credential } as any;
      expect(String((await authChatCompletionHeaderRequest({ req })).app._id)).toBe(
        String(otherApp._id)
      );
      // 默认应用不授予其他应用或知识库权限，也不会阻断原有知识库接口。
      await expect(authChatCompletionHeaderRequest({ req, appId })).rejects.toBeDefined();
      const sdkRequest = { auth: { ...credential, parsedAppId: String(alternateApp._id) } } as any;
      expect(String((await authChatCompletionHeaderRequest({ req: sdkRequest })).app._id)).toBe(
        String(alternateApp._id)
      );
      await expect(
        authDataset({
          req,
          datasetId: String(dataset._id),
          authApiKey: true,
          per: ReadPermissionVal
        })
      ).resolves.toMatchObject({ dataset: { name: 'member dataset' } });
      await MongoDataset.updateOne({ _id: dataset._id }, { $set: { tmbId: owner.tmbId } });
      await expect(
        authDataset({
          req,
          datasetId: String(dataset._id),
          authApiKey: true,
          per: ReadPermissionVal
        })
      ).rejects.toBeDefined();
      for (const parsedAppId of [appId, String(otherApp._id)]) {
        const overridden = { auth: { ...credential, parsedAppId } } as any;
        if (parsedAppId === appId) {
          await expect(authChatCompletionHeaderRequest({ req: overridden })).rejects.toBeDefined();
        }
        expect(
          String(
            (
              await authChatCompletionHeaderRequest({
                req: overridden,
                appId: String(alternateApp._id)
              })
            ).app._id
          )
        ).toBe(String(alternateApp._id));
      }
      await expect(
        authChatCompletionHeaderRequest({ req, authProxy: { tmbId: owner.tmbId } })
      ).rejects.toBeDefined();
    }
  );

  it('new keys require an explicit type instead of defaulting a bound key to personal', async () => {
    for (const appId of [undefined, new Types.ObjectId().toString()]) {
      await expect(
        MongoOpenApi.create({
          teamId: new Types.ObjectId(),
          tmbId: new Types.ObjectId(),
          apiKey: 'missing-type-key',
          ...(appId ? { appId } : {})
        })
      ).rejects.toThrow('type');
    }
    expect(await MongoOpenApi.countDocuments({ apiKey: 'missing-type-key' })).toBe(0);
  });
  it('includes missing-type personal keys without downgrading explicit app or invalid types', async () => {
    const id = new Types.ObjectId().toString();
    for (const appId of [undefined, null, ''])
      expect(resolveApiKeyScope({ appId })).toEqual({ type: 'personal' });
    for (const type of [undefined, 'personal']) {
      for (const appId of [id, new Types.ObjectId(id)]) {
        expect(resolveApiKeyScope({ type, appId })).toEqual({ type: 'personal', defaultAppId: id });
      }
    }
    for (const raw of [
      { type: 'bad' },
      { type: null },
      { type: 'personal', appId: 'invalid' },
      { type: 'app' },
      { appId: 'invalid' },
      { appId: [id] }
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
      },
      {
        teamId: new Types.ObjectId(owner.teamId),
        tmbId: new Types.ObjectId(owner.tmbId),
        apiKey: 'null-type',
        type: null
      },
      {
        teamId: new Types.ObjectId(owner.teamId),
        tmbId: new Types.ObjectId(owner.tmbId),
        apiKey: 'normalized-personal-default',
        type: 'personal',
        appId: new Types.ObjectId(id)
      }
    ] as any);
    expect(
      (await MongoOpenApi.find(getOpenApiTypeFilter(ApiKeyTypeEnum.personal)).lean())
        .map((k) => k.apiKey)
        .sort()
    ).toEqual(['fixture-personal', 'legacy-bound', 'legacy-empty', 'normalized-personal-default']);
    expect(
      (await MongoOpenApi.find(getOpenApiTypeFilter(ApiKeyTypeEnum.app)).lean())
        .map((k) => k.apiKey)
        .sort()
    ).toEqual(['fixture-app']);
  });
  it('server flags independently accept each key type; app Key ignores creator ACL but uses only its bound application', async () => {
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
    expect(String((await getAppByApiKey(cert))._id)).toBe(appId);
    const { parseHeaderCert: mocked } =
      await import('@fastgpt/service/support/permission/auth/common');
    const { authApp } = await import('@fastgpt/service/support/permission/app/auth');
    vi.mocked(mocked).mockResolvedValueOnce(cert);
    const authenticated = await authApp({
      req: {} as any,
      authAppApiKey: true,
      appId: new Types.ObjectId().toString(),
      per: ReadPermissionVal
    });
    expect(authenticated.appId).toBe(appId);
    expect(String(authenticated.app._id)).toBe(authenticated.appId);
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
      chatId: 'other-author',
      per: ReadPermissionVal
    });
    expect(result).toMatchObject({ sourceType: ChatSourceTypeEnum.app, sourceId: appId });
    expect(result.scope).toEqual({ teamId: owner.teamId });
    expect(String(result.chat?.tmbId)).toBe(owner.tmbId);
    expect(result.tmbId).toBe(member.tmbId);
    expect(result.app?.permission.isOwner).toBe(false);
  });
  it('only app credentials may infer targets; caller IDs do not override bindings and other source types remain constrained', async () => {
    const { appId } = await fixture();
    const { parseHeaderCert: mocked } =
      await import('@fastgpt/service/support/permission/auth/common');
    const { authChatTargetCrud, resolveOptionalAppApiKeyChatTarget } =
      await import('@fastgpt/service/core/chat/auth');
    const req = { headers: { authorization: 'Bearer fixture-app' } } as any;
    const appCert = await parseHeaderCert({ req, authAppApiKey: true });
    const target = { req, authToken: true as const, sourceType: ChatSourceTypeEnum.app };
    vi.mocked(mocked).mockResolvedValueOnce(appCert);
    expect(await resolveOptionalAppApiKeyChatTarget({ req })).toEqual({
      sourceType: ChatSourceTypeEnum.app,
      sourceId: appId
    });
    vi.mocked(mocked).mockResolvedValueOnce(appCert);
    expect(
      await authChatTargetCrud({ ...target, sourceId: new Types.ObjectId().toString() })
    ).toMatchObject({ sourceType: ChatSourceTypeEnum.app, sourceId: appId });
    for (const type of ['personal', 'token'] as const) {
      const cert = await parseHeaderCert({
        req: { headers: { authorization: 'Bearer fixture-personal' } } as any,
        authApiKey: true
      });
      if (type === 'token') cert.authType = 'token' as any;
      vi.mocked(mocked).mockResolvedValueOnce(cert);
      await expect(authChatTargetCrud(target)).rejects.toBeDefined();
      vi.mocked(mocked).mockResolvedValueOnce(cert);
      expect(await resolveOptionalAppApiKeyChatTarget({ req })).toEqual({
        sourceType: undefined,
        sourceId: undefined
      });
    }
    expect(
      await resolveOptionalAppApiKeyChatTarget({
        req,
        sourceType: ChatSourceTypeEnum.skillEdit,
        sourceId: appId
      })
    ).toEqual({ sourceType: ChatSourceTypeEnum.skillEdit, sourceId: appId });
  });
  it('matches normalized ObjectId bindings with uppercase input through query, handover and deletion', async () => {
    const { owner, member, appId, appKey } = await fixture();
    expect(
      await MongoOpenApi.countDocuments({
        teamId: owner.teamId,
        ...getOpenApiTypeFilter(ApiKeyTypeEnum.app),
        ...getOpenApiAppIdFilter([appId.toUpperCase()])
      })
    ).toBe(1);
    const changes = await transferAppApiKeys({
      teamId: owner.teamId,
      fromTmbIds: [member.tmbId],
      appIds: [appId],
      session: undefined as any
    });
    expect(changes[0]).toMatchObject({ appId, toTmbId: owner.tmbId });
    expect((await MongoOpenApi.collection.findOne({ _id: appKey._id }))?.appId).toEqual(
      new Types.ObjectId(appId)
    );
    const { cleanupAppDirectRefs } = await import('@fastgpt/service/core/app/controller');
    await cleanupAppDirectRefs({ teamId: owner.teamId, appIds: [appId] });
    expect(await MongoOpenApi.exists({ _id: appKey._id })).toBeNull();
    expect(await MongoOpenApi.countDocuments({ type: 'personal' })).toBe(1);
  });
  it('handover changes only ownership for selected apps and skips other members keys', async () => {
    const { owner, member, appId, appKey } = await fixture();
    const before = await MongoOpenApi.findById(appKey._id).lean();
    const legacy = await MongoOpenApi.collection.insertOne({
      teamId: new Types.ObjectId(owner.teamId),
      tmbId: new Types.ObjectId(member.tmbId),
      apiKey: 'legacy-handover-personal',
      type: 'personal',
      appId: new Types.ObjectId(appId)
    });
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
    expect(String((await MongoOpenApi.findById(legacy.insertedId).lean())?.tmbId)).toBe(
      member.tmbId
    );
    const { cleanupAppDirectRefs } = await import('@fastgpt/service/core/app/controller');
    await cleanupAppDirectRefs({ teamId: owner.teamId, appIds: [appId] });
    const remaining = await MongoOpenApi.collection.findOne({ _id: legacy.insertedId });
    expect(remaining).toMatchObject({
      apiKey: 'legacy-handover-personal',
      tmbId: new Types.ObjectId(member.tmbId)
    });
    expect(remaining).not.toHaveProperty('appId');
    expect(
      await transferAppApiKeys({
        teamId: owner.teamId,
        fromTmbIds: [member.tmbId],
        session: undefined as any
      })
    ).toEqual([]);
  });
});

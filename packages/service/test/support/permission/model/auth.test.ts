import { ModelErrEnum } from '@fastgpt/global/common/error/code/model';
import { ModelScopeEnum, ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
import { PerResourceTypeEnum, ReadRoleVal } from '@fastgpt/global/support/permission/constant';
import { Types } from '@fastgpt/service/common/mongo';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import {
  clearTeamModelCatalogCache,
  publishSystemModelHandle
} from '@fastgpt/service/core/ai/model/catalog/cache';
import { MongoAIModelCatalog } from '@fastgpt/service/core/ai/model/catalog/schema';
import { getTeamModelHandle } from '@fastgpt/service/core/ai/model/catalog/service';
import { MongoAIModel } from '@fastgpt/service/core/ai/model/schema';
import { createModel, updateModelStatus } from '@fastgpt/service/core/ai/model/service';
import { MongoGroupMemberModel } from '@fastgpt/service/support/permission/memberGroup/groupMemberSchema';
import { MongoMemberGroupModel } from '@fastgpt/service/support/permission/memberGroup/memberGroupSchema';
import {
  assertAuthModels,
  authModels,
  getAuthorizedModelIds
} from '@fastgpt/service/support/permission/model/auth';
import { clearMemberModelsCache } from '@fastgpt/service/support/permission/model/cache';
import { MongoOrgMemberModel } from '@fastgpt/service/support/permission/org/orgMemberSchema';
import { MongoResourcePermission } from '@fastgpt/service/support/permission/schema';
import { MongoTmpData } from '@fastgpt/service/support/tmpData/schema';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

beforeAll(async () => {
  const actual = await vi.importActual<typeof import('@fastgpt/service/common/mongo/sessionRun')>(
    '@fastgpt/service/common/mongo/sessionRun'
  );
  vi.mocked(mongoSessionRun).mockImplementation(actual.mongoSessionRun);
});
const teamId = new Types.ObjectId().toString();
const tmbId = new Types.ObjectId().toString();
const otherTmbId = new Types.ObjectId().toString();
const actor = {
  teamId,
  tmbId,
  isRoot: false,
  teamPermission: { hasManagePer: false, hasModelCreatePer: true }
};
const admin = {
  ...actor,
  teamPermission: { hasManagePer: true, hasModelCreatePer: true }
};
const rootActor = { ...actor, isRoot: true };
const outLinkActor = { source: 'outLink' as const, teamId, tmbId };
const owner = { channelType: 'team' as const, teamId, tmbId };
const draft = {
  scope: ModelScopeEnum.team,
  type: ModelTypeEnum.llm as const,
  provider: 'OpenAI',
  model: 'custom',
  name: 'Custom',
  isActive: true,
  config: { maxContext: 16000, maxResponse: 8000, quoteMaxToken: 12000 }
};
const grant = (modelId: string, memberId: string) =>
  MongoResourcePermission.create({
    resourceType: PerResourceTypeEnum.model,
    resourceId: modelId,
    teamId,
    tmbId: memberId,
    permission: ReadRoleVal
  });
const getModelIds = async (targetTeamId = teamId) =>
  (await getTeamModelHandle({ teamId: targetTeamId })).getAllModels().map((model) => model.modelId);

beforeEach(async () => {
  await Promise.all([
    MongoAIModel.deleteMany({}),
    MongoAIModelCatalog.deleteMany({}),
    MongoResourcePermission.deleteMany({}),
    MongoTmpData.deleteMany({}),
    MongoGroupMemberModel.deleteMany({}),
    MongoMemberGroupModel.deleteMany({}),
    MongoOrgMemberModel.deleteMany({})
  ]);
  publishSystemModelHandle(undefined);
  clearTeamModelCatalogCache();
});

describe('authModels', () => {
  it('returns only denied IDs in input order, deduplicated', async () => {
    await createModel({ channelType: 'system', modelData: draft });
    await createModel({ ...owner, modelData: draft });
    const foreign = await createModel({ ...owner, tmbId: otherTmbId, modelData: draft });
    const modelIds = await getModelIds();

    expect(
      await authModels({
        actor,
        modelIds: [...modelIds, foreign.modelId],
        action: 'use'
      })
    ).toEqual([foreign.modelId]);
    expect(
      await authModels({
        actor,
        modelIds: modelIds.filter((modelId) => modelId !== foreign.modelId),
        action: 'use'
      })
    ).toEqual([]);
  });
  it('does not read identity or permissions for an empty batch', async () => {
    expect(
      await authModels({
        actor: { teamId, tmbId: 'missing', isRoot: false },
        modelIds: [],
        action: 'use'
      })
    ).toEqual([]);
    expect(await MongoTmpData.countDocuments({})).toBe(0);
  });
  it('rebuilds the full member cache even when checking one model', async () => {
    await createModel({ ...owner, modelData: draft });
    await createModel({ ...owner, modelData: { ...draft, model: 'second' } });
    const modelIds = await getModelIds();
    expect(await authModels({ actor, modelIds: [modelIds[0]], action: 'use' })).toEqual([]);
    const cached = await MongoTmpData.findOne({ 'data.teamId': teamId }).lean();
    expect(new Set((cached?.data as { modelIds: string[] }).modelIds)).toEqual(new Set(modelIds));
    expect(cached?.data).not.toHaveProperty('version');
    expect(await authModels({ actor, modelIds: [modelIds[1]], action: 'use' })).toEqual([]);
  });
  it('keeps admin, ordinary member and root identities distinct on warm caches', async () => {
    const created = await createModel({ channelType: 'system', modelData: draft });
    await grant(created.modelId, otherTmbId);
    const modelIds = await getModelIds();
    expect(await authModels({ actor, modelIds, action: 'use' })).toEqual(modelIds);
    expect(await authModels({ actor: admin, modelIds, action: 'use' })).toEqual([]);
    expect(await authModels({ actor, modelIds, action: 'use' })).toEqual(modelIds);
    expect(await authModels({ actor: rootActor, modelIds, action: 'use' })).toEqual([]);
  });
  it('evaluates outLink identities as non-admin without reading or writing member cache', async () => {
    const created = await createModel({ channelType: 'system', modelData: draft });
    await grant(created.modelId, otherTmbId);
    const modelIds = await getModelIds();

    // 先写入管理员缓存，外链请求不能命中，也不能覆盖它。
    expect(await authModels({ actor: admin, modelIds, action: 'use' })).toEqual([]);
    const adminCache = await MongoTmpData.findOne({ 'data.teamId': teamId }).lean();
    expect(await authModels({ actor: outLinkActor, modelIds, action: 'use' })).toEqual(modelIds);
    expect(await MongoTmpData.findOne({ 'data.teamId': teamId }).lean()).toEqual(adminCache);

    await MongoTmpData.deleteMany({});
    expect(await authModels({ actor: outLinkActor, modelIds, action: 'use' })).toEqual(modelIds);
    expect(await MongoTmpData.countDocuments({})).toBe(0);
  });
  it('never grants config or grant actions to outLink identities', async () => {
    const { modelId } = await createModel({ ...owner, modelData: draft });
    expect(await authModels({ actor: outLinkActor, modelIds: [modelId], action: 'use' })).toEqual(
      []
    );
    expect(
      await authModels({ actor: outLinkActor, modelIds: [modelId], action: 'config' })
    ).toEqual([modelId]);
    expect(await authModels({ actor: outLinkActor, modelIds: [modelId], action: 'grant' })).toEqual(
      [modelId]
    );
  });
  it('recomputes after ACL cache invalidation', async () => {
    const created = await createModel({ ...owner, tmbId: otherTmbId, modelData: draft });
    const modelIds = await getModelIds();
    expect(await authModels({ actor, modelIds, action: 'use' })).toEqual(modelIds);
    await grant(created.modelId, tmbId);
    await clearMemberModelsCache({ teamId });
    expect(await authModels({ actor, modelIds, action: 'use' })).toEqual([]);
  });
  it('uses collaborator grants from groups and direct organizations, including when personal ACL is zero', async () => {
    const group = await MongoMemberGroupModel.create({ teamId, name: 'Group' });
    await MongoGroupMemberModel.create({ tmbId, groupId: group._id, role: 'member' });
    const orgId = new Types.ObjectId();
    await MongoOrgMemberModel.create({ teamId, tmbId, orgId });
    const first = await createModel({ ...owner, tmbId: otherTmbId, modelData: draft });
    const second = await createModel({
      ...owner,
      tmbId: otherTmbId,
      modelData: { ...draft, model: 'second' }
    });
    await MongoResourcePermission.insertMany([
      {
        resourceType: PerResourceTypeEnum.model,
        resourceId: first.modelId,
        teamId,
        groupId: group._id,
        permission: ReadRoleVal
      },
      {
        resourceType: PerResourceTypeEnum.model,
        resourceId: first.modelId,
        teamId,
        tmbId,
        permission: 0
      },
      {
        resourceType: PerResourceTypeEnum.model,
        resourceId: second.modelId,
        teamId,
        orgId,
        permission: ReadRoleVal
      }
    ]);
    expect(await authModels({ actor, modelIds: await getModelIds(), action: 'use' })).toEqual([]);
  });
  it('does not confuse inactive state with missing authorization', async () => {
    const created = await createModel({ ...owner, modelData: draft });
    await updateModelStatus({
      modelIds: [created.modelId],
      isActive: false,
      channelType: 'team',
      teamId,
      tmbId
    });
    const models = (await getTeamModelHandle({ teamId })).getAllModels();
    expect(models[0].isActive).toBe(false);
    expect(
      await authModels({ actor, modelIds: models.map((model) => model.modelId), action: 'use' })
    ).toEqual([]);
  });
  it.each(['use', 'config', 'grant'] as const)('denies unknown model IDs (%s)', async (action) => {
    const missingId = new Types.ObjectId().toString();
    expect(await authModels({ actor: rootActor, modelIds: [missingId], action })).toEqual([
      missingId
    ]);
  });
  it('rejects foreign team models even for root or a misplaced ACL', async () => {
    const foreignTeamId = new Types.ObjectId().toString();
    const created = await createModel({ ...owner, teamId: foreignTeamId, modelData: draft });
    await grant(created.modelId, tmbId);
    const modelIds = await getModelIds(foreignTeamId);
    expect(await authModels({ actor: rootActor, modelIds, action: 'use' })).toEqual(modelIds);
    expect(await authModels({ actor: rootActor, modelIds, action: 'grant' })).toEqual(modelIds);
  });
  it('separates system configuration from team authorization management', async () => {
    await createModel({ channelType: 'system', modelData: draft });
    const modelIds = await getModelIds();
    expect(await authModels({ actor, modelIds, action: 'grant' })).toEqual(modelIds);
    expect(await authModels({ actor: admin, modelIds, action: 'grant' })).toEqual([]);
    expect(await authModels({ actor: admin, modelIds, action: 'config' })).toEqual(modelIds);
    expect(await authModels({ actor: rootActor, modelIds, action: 'config' })).toEqual([]);
  });
  it('requires installation capability to configure an owned private model, without removing its use or collaborator management', async () => {
    const { modelId } = await createModel({ ...owner, modelData: draft });
    const ordinaryOwner = {
      ...actor,
      teamPermission: { hasManagePer: false, hasModelCreatePer: false }
    };
    expect(await authModels({ actor, modelIds: [modelId], action: 'config' })).toEqual([]);
    expect(
      await authModels({ actor: ordinaryOwner, modelIds: [modelId], action: 'config' })
    ).toEqual([modelId]);
    expect(await authModels({ actor: ordinaryOwner, modelIds: [modelId], action: 'use' })).toEqual(
      []
    );
    expect(
      await authModels({ actor: ordinaryOwner, modelIds: [modelId], action: 'grant' })
    ).toEqual([]);
  });
  it('never grants management of another member private model through collaborator ACL or team administration', async () => {
    const created = await createModel({ ...owner, tmbId: otherTmbId, modelData: draft });
    await grant(created.modelId, tmbId);
    const modelIds = await getModelIds();
    expect(await authModels({ actor, modelIds, action: 'use' })).toEqual([]);
    expect(await authModels({ actor: rootActor, modelIds, action: 'grant' })).toEqual(modelIds);
    expect(await authModels({ actor: admin, modelIds, action: 'config' })).toEqual(modelIds);
    expect(
      await authModels({ actor: { ...actor, tmbId: otherTmbId }, modelIds, action: 'grant' })
    ).toEqual([]);
  });
  it('propagates permission storage failures rather than turning them into denial', async () => {
    await createModel({ ...owner, modelData: draft });
    const modelIds = await getModelIds();
    const failure = new Error('permission storage unavailable');
    const query = vi.spyOn(MongoTmpData, 'findOne').mockImplementationOnce(() => {
      throw failure;
    });
    try {
      await expect(authModels({ actor, modelIds, action: 'use' })).rejects.toBe(failure);
    } finally {
      query.mockRestore();
    }
  });
});

describe('assertAuthModels', () => {
  it('returns the same snapshot handle and deduplicated models in input order', async () => {
    const first = await createModel({ ...owner, modelData: draft });
    const second = await createModel({ ...owner, modelData: { ...draft, model: 'second' } });
    const handle = await getTeamModelHandle({ teamId });

    const result = await assertAuthModels({
      actor,
      modelIds: [second.modelId, first.modelId, second.modelId],
      action: 'config',
      handle
    });
    expect(result.handle).toBe(handle);
    expect(result.models.map((model) => model.modelId)).toEqual([second.modelId, first.modelId]);
  });
  it('hides model existence on config denial and reports unAuthModel otherwise', async () => {
    const created = await createModel({ ...owner, tmbId: otherTmbId, modelData: draft });
    await expect(
      assertAuthModels({ actor, modelIds: [created.modelId], action: 'config' })
    ).rejects.toMatchObject({ message: ModelErrEnum.unExist });
    await expect(
      assertAuthModels({ actor, modelIds: [created.modelId], action: 'use' })
    ).rejects.toMatchObject({ message: ModelErrEnum.unAuthModel });
    await expect(
      assertAuthModels({ actor, modelIds: [created.modelId], action: 'grant' })
    ).rejects.toMatchObject({ message: ModelErrEnum.unAuthModel });
  });
});

describe('getAuthorizedModelIds', () => {
  it('includes owned, granted and default-open models but excludes other members private models', async () => {
    const system = await createModel({ channelType: 'system', modelData: draft });
    const own = await createModel({ ...owner, modelData: draft });
    const other = await createModel({ ...owner, tmbId: otherTmbId, modelData: draft });
    const handle = await getTeamModelHandle({ teamId });

    expect(await getAuthorizedModelIds({ actor, handle })).toEqual(
      new Set([system.modelId, own.modelId])
    );
    await grant(other.modelId, tmbId);
    await clearMemberModelsCache({ teamId });
    expect(await getAuthorizedModelIds({ actor, handle })).toEqual(
      new Set([system.modelId, own.modelId, other.modelId])
    );
  });
});

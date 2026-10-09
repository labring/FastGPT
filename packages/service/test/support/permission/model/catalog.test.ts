import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { Types } from '@fastgpt/service/common/mongo';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { ModelScopeEnum, ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
import {
  PerResourceTypeEnum,
  ReadPermissionVal
} from '@fastgpt/global/support/permission/constant';
import { MongoAIModel } from '@fastgpt/service/core/ai/model/schema';
import { MongoAIModelCatalog } from '@fastgpt/service/core/ai/model/catalog/schema';
import {
  createModel,
  updateModel,
  updateModelStatus
} from '@fastgpt/service/core/ai/model/mutation';
import { getTeamModelHandle } from '@fastgpt/service/core/ai/model/index';
import { publishSystemModelHandle } from '@fastgpt/service/core/ai/model/cache';
import { clearTeamModelCatalogCache } from '@fastgpt/service/core/ai/model/teamModelCache';
import { MongoResourcePermission } from '@fastgpt/service/support/permission/schema';
import { MongoTmpData } from '@fastgpt/service/support/tmpData/schema';
import {
  getMemberModelCatalogPermission,
  getMemberModelIds
} from '@fastgpt/service/support/permission/model/catalog';
import { clearMyModelsCache } from '@fastgpt/service/support/permission/model/cache';
import { authModelUse } from '@fastgpt/service/support/permission/model/auth';

beforeAll(async () => {
  const actual = await vi.importActual<typeof import('@fastgpt/service/common/mongo/sessionRun')>(
    '@fastgpt/service/common/mongo/sessionRun'
  );
  vi.mocked(mongoSessionRun).mockImplementation(actual.mongoSessionRun);
});
const teamId = new Types.ObjectId().toString();
const tmbId = new Types.ObjectId().toString();
const otherTmbId = new Types.ObjectId().toString();
const owner = { channelType: 'team' as const, teamId, tmbId };
const draft = {
  scope: ModelScopeEnum.team,
  type: ModelTypeEnum.llm,
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
    permission: ReadPermissionVal
  });

beforeEach(async () => {
  await Promise.all([
    MongoAIModel.deleteMany({}),
    MongoAIModelCatalog.deleteMany({}),
    MongoResourcePermission.deleteMany({}),
    MongoTmpData.deleteMany({})
  ]);
  publishSystemModelHandle(undefined);
  clearTeamModelCatalogCache();
});

describe('member model catalog projection', () => {
  it('allows public system models and owned team models, but hides ungranted private models', async () => {
    const system = await createModel({ channelType: 'system', modelData: draft });
    const own = await createModel({ ...owner, modelData: draft });
    const other = await createModel({ ...owner, tmbId: otherTmbId, modelData: draft });
    const ids = await getMemberModelIds({ teamId, tmbId });
    expect(new Set(ids)).toEqual(new Set([system.modelId, own.modelId]));
    expect(ids).not.toContain(other.modelId);
  });
  it('recomputes ACL projection after collaborator invalidation without changing the catalog', async () => {
    const model = await createModel({ ...owner, modelData: draft });
    expect(await getMemberModelIds({ teamId, tmbId: otherTmbId })).toEqual([]);
    await grant(model.modelId, otherTmbId);
    await clearMyModelsCache({ teamId });
    expect(await getMemberModelIds({ teamId, tmbId: otherTmbId })).toEqual([model.modelId]);
  });
  it('does not supplement an explicitly supplied snapshot with newer database models', async () => {
    await createModel({ ...owner, modelData: draft });
    expect(
      await getMemberModelIds({
        teamId,
        tmbId,
        catalogSnapshot: { models: [], version: 'empty-snapshot' }
      })
    ).toEqual([]);
  });
  it('invalidates permission results on a team catalog revision without clearing the ACL cache', async () => {
    const model = await createModel({ ...owner, modelData: draft });
    const before = await getMemberModelCatalogPermission({ teamId, tmbId });
    await updateModel({
      ...owner,
      modelId: model.modelId,
      modelData: { ...draft, name: 'Renamed display' }
    });
    const after = await getMemberModelCatalogPermission({ teamId, tmbId });
    expect(after.modelIds).toEqual(before.modelIds);
    expect(after.version).not.toBe(before.version);
    await updateModelStatus({
      modelIds: [model.modelId],
      isActive: false,
      scope: ModelScopeEnum.team,
      teamId,
      tmbId
    });
    expect(await getMemberModelIds({ teamId, tmbId })).toEqual([]);
    expect(
      (await getMemberModelCatalogPermission({ teamId, tmbId, includeInactive: true })).modelIds
    ).toEqual([model.modelId]);
    expect(await getMemberModelIds({ teamId, tmbId })).toEqual([]);
  });
  it('hides foreign team models even when a collaborator record is incorrectly added', async () => {
    const model = await createModel({
      ...owner,
      teamId: new Types.ObjectId().toString(),
      modelData: draft
    });
    await grant(model.modelId, tmbId);
    expect(await getMemberModelIds({ teamId, tmbId })).toEqual([]);
    await expect(authModelUse({ teamId, tmbId, modelId: model.modelId })).rejects.toThrow(
      'modelUnExist'
    );
  });
  it('returns a permitted team model from the same scoped snapshot used for execution authorization', async () => {
    const model = await createModel({ ...owner, modelData: draft });
    expect(await authModelUse({ teamId, tmbId, modelId: model.modelId })).toMatchObject({
      modelId: model.modelId,
      teamId,
      tmbId
    });
    expect((await getTeamModelHandle({ teamId })).getTeamModels()).toHaveLength(1);
  });
  it('allows system models with configured permissions to members with management permission even when not in collaborator list', async () => {
    const system = await createModel({ channelType: 'system', modelData: draft });
    const otherPrivate = await createModel({ ...owner, tmbId: otherTmbId, modelData: draft });
    await grant(system.modelId, otherTmbId);

    const normalTmbId = new Types.ObjectId().toString();
    const adminTmbId = new Types.ObjectId().toString();

    const normalIds = await getMemberModelIds({ teamId, tmbId: normalTmbId });
    expect(normalIds).not.toContain(system.modelId);
    expect(normalIds).not.toContain(otherPrivate.modelId);

    const adminIds = await getMemberModelIds({ teamId, tmbId: adminTmbId, hasManagePer: true });
    expect(adminIds).toContain(system.modelId);
    expect(adminIds).not.toContain(otherPrivate.modelId);
  });
});

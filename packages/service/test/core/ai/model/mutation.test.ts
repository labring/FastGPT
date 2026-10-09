import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ModelScopeEnum, ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
import { Types } from '@fastgpt/service/common/mongo';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { MongoAIModel } from '@fastgpt/service/core/ai/model/schema';
import { MongoAIModelCatalog } from '@fastgpt/service/core/ai/model/catalog/schema';
import {
  createModel,
  updateModel,
  updateModelStatus,
  deleteModels,
  restoreModelName
} from '@fastgpt/service/core/ai/model/mutation';
import { readModelCatalogRevision } from '@fastgpt/service/core/ai/model/catalog/entity';
import { clearTeamModelCatalogCache } from '@fastgpt/service/core/ai/model/teamModelCache';

beforeAll(async () => {
  const actual = await vi.importActual<typeof import('@fastgpt/service/common/mongo/sessionRun')>(
    '@fastgpt/service/common/mongo/sessionRun'
  );
  vi.mocked(mongoSessionRun).mockImplementation(actual.mongoSessionRun);
});
const teamId = new Types.ObjectId().toString();
const tmbId = new Types.ObjectId().toString();
const owner = { channelType: 'team' as const, teamId, tmbId };
const context = { scope: ModelScopeEnum.team, teamId } as const;
const draft = {
  scope: ModelScopeEnum.team,
  type: ModelTypeEnum.llm,
  provider: 'OpenAI',
  model: 'custom',
  name: 'Custom',
  isActive: true,
  config: { maxContext: 16000, maxResponse: 8000, quoteMaxToken: 12000 }
};

beforeEach(async () => {
  await Promise.all([MongoAIModel.deleteMany({}), MongoAIModelCatalog.deleteMany({})]);
  clearTeamModelCatalogCache();
});

describe('team model mutations', () => {
  it('binds trusted ownership and increments only the team catalog revision', async () => {
    const result = await createModel({
      ...owner,
      modelData: { ...draft, teamId: new Types.ObjectId().toString() }
    });
    expect(await MongoAIModel.findById(result.modelId).lean()).toMatchObject({ teamId, tmbId });
    expect(await readModelCatalogRevision(context)).toBe(1);
    expect(await readModelCatalogRevision({ scope: ModelScopeEnum.system })).toBe(0);
  });
  it('rejects missing team context before writing', async () => {
    await expect(createModel({ channelType: 'team', tmbId, modelData: draft })).rejects.toThrow(
      'modelUnExist'
    );
    expect(await MongoAIModel.countDocuments({})).toBe(0);
    expect(await readModelCatalogRevision(context)).toBe(0);
  });
  it('rolls back a batch that includes another member model', async () => {
    const own = await createModel({ ...owner, modelData: draft });
    const other = await createModel({
      ...owner,
      tmbId: new Types.ObjectId().toString(),
      modelData: draft
    });
    await expect(
      updateModelStatus({
        modelIds: [own.modelId, other.modelId],
        isActive: false,
        scope: ModelScopeEnum.team,
        teamId,
        tmbId
      })
    ).rejects.toThrow('modelUnExist');
    expect(await MongoAIModel.countDocuments({ isActive: true })).toBe(2);
    expect(await readModelCatalogRevision(context)).toBe(2);
  });
  it('rejects type changes and duplicate names without committing revisions', async () => {
    const a = await createModel({ ...owner, modelData: draft });
    await createModel({ ...owner, modelData: { ...draft, model: 'other' } });
    await expect(
      updateModel({ ...owner, modelId: a.modelId, modelData: { ...draft, model: 'other' } })
    ).rejects.toThrow('modelAlreadyExists');
    await expect(
      updateModel({
        ...owner,
        modelId: a.modelId,
        modelData: { ...draft, type: ModelTypeEnum.stt }
      })
    ).rejects.toThrow('Model type cannot be changed');
    expect(await readModelCatalogRevision(context)).toBe(2);
  });
  it('does not let rename compensation overwrite a subsequent rename', async () => {
    const a = await createModel({ ...owner, modelData: draft });
    await updateModel({ ...owner, modelId: a.modelId, modelData: { ...draft, model: 'second' } });
    await updateModel({ ...owner, modelId: a.modelId, modelData: { ...draft, model: 'third' } });
    await restoreModelName({
      ...owner,
      modelId: a.modelId,
      oldModel: 'custom',
      newModel: 'second'
    });
    expect((await MongoAIModel.findById(a.modelId).lean())?.model).toBe('third');
  });
  it('rejects cross-team deletion even for a matching member ID', async () => {
    const a = await createModel({ ...owner, modelData: draft });
    await expect(
      deleteModels({ ...owner, teamId: new Types.ObjectId().toString(), modelIds: [a.modelId] })
    ).rejects.toThrow('modelUnExist');
    expect(await MongoAIModel.countDocuments({})).toBe(1);
  });
});

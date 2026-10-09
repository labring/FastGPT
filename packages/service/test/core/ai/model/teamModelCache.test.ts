import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ModelScopeEnum, ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
import { Types } from '@fastgpt/service/common/mongo';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { MongoAIModel } from '@fastgpt/service/core/ai/model/schema';
import { MongoAIModelCatalog } from '@fastgpt/service/core/ai/model/catalog/schema';
import { runModelTransaction } from '@fastgpt/service/core/ai/model/catalog/transaction';
import { createModelHandle } from '@fastgpt/service/core/ai/model/handle';
import {
  getScopedTeamModelHandle,
  clearTeamModelCatalogCache
} from '@fastgpt/service/core/ai/model/teamModelCache';

beforeAll(async () => {
  const actual = await vi.importActual<typeof import('@fastgpt/service/common/mongo/sessionRun')>(
    '@fastgpt/service/common/mongo/sessionRun'
  );
  vi.mocked(mongoSessionRun).mockImplementation(actual.mongoSessionRun);
});
const teamId = new Types.ObjectId().toString();
const context = { scope: ModelScopeEnum.team, teamId } as const;
const modelData = {
  scope: ModelScopeEnum.team,
  teamId,
  tmbId: new Types.ObjectId().toString(),
  type: ModelTypeEnum.llm,
  provider: 'OpenAI',
  model: 'team-model',
  name: 'Initial',
  isActive: true,
  config: { maxContext: 16000, maxResponse: 8000, quoteMaxToken: 12000 }
};
const systemHandle = createModelHandle({
  models: [],
  defaultModels: {},
  configuredDefaultModelIds: {},
  version: 'system',
  revision: 0
});

beforeEach(async () => {
  await Promise.all([MongoAIModel.deleteMany({}), MongoAIModelCatalog.deleteMany({})]);
  clearTeamModelCatalogCache();
});

describe('scoped team catalog cache', () => {
  it('observes another instance write without any local invalidation call', async () => {
    const [model] = await runModelTransaction(context, (session) =>
      MongoAIModel.create([modelData], { session })
    );
    const first = await getScopedTeamModelHandle({ teamId, systemHandle });
    expect(await getScopedTeamModelHandle({ teamId, systemHandle })).toBe(first);
    await runModelTransaction(context, (session) =>
      MongoAIModel.updateOne({ _id: model._id }, { $set: { name: 'Remote change' } }, { session })
    );
    const second = await getScopedTeamModelHandle({ teamId, systemHandle });
    expect(second).not.toBe(first);
    expect(second.getTeamModels()[0].name).toBe('Remote change');
  });
  it('keeps unrelated teams cached and never exposes their models', async () => {
    const first = await getScopedTeamModelHandle({ teamId, systemHandle });
    const otherTeamId = new Types.ObjectId().toString();
    await runModelTransaction({ scope: ModelScopeEnum.team, teamId: otherTeamId }, (session) =>
      MongoAIModel.create([{ ...modelData, teamId: otherTeamId }], { session })
    );
    expect(await getScopedTeamModelHandle({ teamId, systemHandle })).toBe(first);
    expect(first.getTeamModels()).toEqual([]);
  });
  it('refreshes disabled system records even when public content version is unchanged', async () => {
    const first = await getScopedTeamModelHandle({ teamId, systemHandle });
    const newerSystem = createModelHandle({
      models: [
        {
          ...modelData,
          modelId: new Types.ObjectId().toString(),
          scope: ModelScopeEnum.system,
          isActive: false
        }
      ],
      defaultModels: {},
      configuredDefaultModelIds: {},
      revision: 1,
      version: 'system'
    });
    const next = await getScopedTeamModelHandle({ teamId, systemHandle: newerSystem });
    expect(next).not.toBe(first);
    expect(next.getSystemModels()).toHaveLength(1);
  });
  it('rejects invalid team identity', async () => {
    await expect(getScopedTeamModelHandle({ teamId: '', systemHandle })).rejects.toThrow(
      'modelUnExist'
    );
  });
});

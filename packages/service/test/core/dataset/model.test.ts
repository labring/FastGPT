import { ModelErrEnum } from '@fastgpt/global/common/error/code/model';
import { ModelScopeEnum, ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
import type { EmbeddingModelDataType } from '@fastgpt/global/core/ai/model/schema';
import { createModelHandle } from '@fastgpt/service/core/ai/model/catalog/handle';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  findDatasetIndexModelReferences: vi.fn()
}));

vi.mock('@fastgpt/service/core/dataset/entity', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@fastgpt/service/core/dataset/entity')>()),
  findDatasetIndexModelReferences: mocks.findDatasetIndexModelReferences
}));

import {
  assertAppDatasetIndexModelsAvailable,
  getAssertedDatasetEmbeddingModel,
  getDatasetModelReference
} from '../../../core/dataset/model';

const datasetId = '68ad85a7463006c963799a07';
const embeddingModel: EmbeddingModelDataType = {
  modelId: '68ad85a7463006c963799a09',
  type: ModelTypeEnum.embedding,
  scope: ModelScopeEnum.system,
  provider: 'OpenAI',
  model: 'text-embedding-3-small',
  name: 'Embedding',
  isActive: true,
  config: { defaultToken: 512, maxToken: 8192, weight: 1 }
};

const createHandle = () =>
  createModelHandle({
    models: [embeddingModel],
    defaultModels: {},
    configuredDefaultModelIds: {},
    revision: 0,
    version: 'test'
  });

describe('getDatasetModelReference', () => {
  it.each([
    ['embedding', 'vectorModelId', 'vectorModel'],
    ['agent', 'agentModelId', 'agentModel'],
    ['vlm', 'vlmModelId', 'vlmModel']
  ] as const)('extracts the %s reference without resolving a model', (slot, idKey, nameKey) => {
    expect(
      getDatasetModelReference({ [idKey]: 'stable-id', [nameKey]: 'legacy-name' }, slot)
    ).toEqual({ modelId: 'stable-id', model: 'legacy-name' });
    expect(getDatasetModelReference({ [nameKey]: 'legacy-name' }, slot)).toEqual({
      modelId: undefined,
      model: 'legacy-name'
    });
    expect(getDatasetModelReference({ [idKey]: '' }, slot).modelId).toBe('');
    expect(getDatasetModelReference({}, slot)).toEqual({ modelId: undefined, model: undefined });
  });
});

describe('assertAppDatasetIndexModelsAvailable', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findDatasetIndexModelReferences.mockResolvedValue([
      { _id: datasetId, vectorModelId: embeddingModel.modelId, vectorModel: embeddingModel.model }
    ]);
  });

  it('returns the validated embedding model for callers to reuse', async () => {
    const modelHandle = createHandle();
    const authorizedIds = new Set([embeddingModel.modelId]);
    const models = await assertAppDatasetIndexModelsAvailable({
      resources: [{ type: 'dataset', id: datasetId }],
      teamId: 'team-id',
      modelHandle,
      authorizedIds
    });

    expect(getAssertedDatasetEmbeddingModel(models, datasetId).modelId).toBe(
      embeddingModel.modelId
    );
    expect(mocks.findDatasetIndexModelReferences).toHaveBeenCalledWith({
      datasetIds: [datasetId],
      teamId: 'team-id',
      session: undefined
    });
  });

  it('rejects an embedding model the actor cannot use', async () => {
    await expect(
      assertAppDatasetIndexModelsAvailable({
        resources: [{ type: 'dataset', id: datasetId }],
        teamId: 'team-id',
        modelHandle: createHandle(),
        authorizedIds: new Set()
      })
    ).rejects.toMatchObject({ message: ModelErrEnum.unAuthModel });
  });
});

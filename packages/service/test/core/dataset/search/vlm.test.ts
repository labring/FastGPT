import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SystemModelDataType } from '@fastgpt/global/core/ai/model.schema';
import { ModelScopeEnum, ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
import {
  getDatasetSearchVlmModel,
  findFirstDatasetSearchVlmModel
} from '../../../../core/dataset/search/vlm';

const findMock = vi.hoisted(() => vi.fn());
vi.mock('@fastgpt/service/core/dataset/schema', () => ({
  MongoDataset: { find: findMock }
}));

describe('dataset search VLM selection', () => {
  let originalMap: typeof global.systemModelMap;
  const activeModel: SystemModelDataType = {
    modelId: 'active-id',
    model: 'active-vision',
    name: 'Active vision',
    type: ModelTypeEnum.llm,
    provider: 'OpenAI',
    scope: ModelScopeEnum.system,
    isCustom: false,
    isActive: true,
    config: { vision: true, maxContext: 4096, maxResponse: 1000, quoteMaxToken: 1000 }
  };

  beforeEach(() => {
    originalMap = global.systemModelMap;
    const models = [
      activeModel,
      { ...activeModel, modelId: 'second-id', model: 'second-vision' },
      { ...activeModel, modelId: 'disabled-id', model: 'disabled', isActive: false },
      {
        ...activeModel,
        modelId: 'text-id',
        model: 'text',
        config: { ...activeModel.config, vision: false }
      }
    ];
    global.systemModelMap = new Map(
      models.flatMap((model) => [
        [`id:${model.modelId}`, model],
        [`model:${model.model}`, model]
      ])
    );
    findMock.mockReset();
  });

  afterEach(() => {
    global.systemModelMap = originalMap;
  });

  it('skips empty, deleted, disabled and non-vision models, then stops at the first usable one', () => {
    expect(
      findFirstDatasetSearchVlmModel([
        {},
        { vlmModel: 'deleted' },
        { vlmModelId: 'disabled-id' },
        { vlmModelId: 'text-id' },
        { vlmModelId: 'active-id' },
        {
          get vlmModelId(): string {
            throw new Error('must not inspect later candidates');
          }
        }
      ])
    ).toEqual(activeModel);
  });

  it('does not fall back to a legacy name when an explicit ID is stale', () => {
    expect(
      findFirstDatasetSearchVlmModel([{ vlmModelId: 'deleted-id', vlmModel: 'active-vision' }])
    ).toBeUndefined();
    expect(findFirstDatasetSearchVlmModel([{ vlmModelId: '', vlmModel: 'active-vision' }])).toEqual(
      activeModel
    );
  });

  it('supports legacy names and returns no VLM when every candidate is unusable', () => {
    expect(findFirstDatasetSearchVlmModel([{ vlmModel: 'active-vision' }])).toEqual(activeModel);
    expect(findFirstDatasetSearchVlmModel([])).toBeUndefined();
    expect(
      findFirstDatasetSearchVlmModel([{}, { vlmModel: '' }, { vlmModelId: 'disabled-id' }])
    ).toBeUndefined();
  });

  it('queries only allowed team datasets and restores caller order independently of Mongo order', async () => {
    findMock.mockReturnValue({
      lean: vi.fn().mockResolvedValue([
        { _id: 'second', vlmModelId: 'second-id' },
        { _id: 'first', vlmModelId: 'active-id' },
        { _id: 'deleted', vlmModel: 'deleted' }
      ])
    });
    const datasetIds = ['missing', 'deleted', 'first', 'second'];
    expect(await getDatasetSearchVlmModel({ teamId: 'team', datasetIds })).toEqual(activeModel);
    expect(findMock).toHaveBeenCalledExactlyOnceWith(
      { teamId: 'team', _id: { $in: datasetIds } },
      'vlmModelId vlmModel'
    );
  });

  it('returns no VLM without querying an empty selection', async () => {
    expect(await getDatasetSearchVlmModel({ teamId: 'team', datasetIds: [] })).toBeUndefined();
    expect(findMock).not.toHaveBeenCalled();
  });

  it('does not turn an infrastructure failure into a model configuration fallback', async () => {
    findMock.mockReturnValue({
      lean: vi.fn().mockRejectedValue(new Error('database unavailable'))
    });
    await expect(
      getDatasetSearchVlmModel({ teamId: 'team', datasetIds: ['first'] })
    ).rejects.toThrow('database unavailable');
  });
});

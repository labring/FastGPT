import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
import {
  findDatasetAgentModel,
  findDatasetEmbeddingModel,
  findDatasetVlmModel,
  getDatasetEmbeddingModel
} from '../../../core/dataset/model';

const getEmbeddingModelDataMock = vi.hoisted(() => vi.fn());
const findModelDataMock = vi.hoisted(() => vi.fn());

vi.mock('../../../core/ai/model', () => ({
  findModelData: findModelDataMock,
  getEmbeddingModelData: getEmbeddingModelDataMock,
  getLLMModelData: vi.fn(),
  getOptionalVlmModelData: vi.fn()
}));

describe('dataset model resolution', () => {
  beforeEach(() => {
    getEmbeddingModelDataMock.mockReset();
    findModelDataMock.mockReset();
  });

  it('uses the legacy model only when vectorModelId is absent', () => {
    getDatasetEmbeddingModel({ vectorModel: 'text-embedding-3-small' });

    expect(getEmbeddingModelDataMock).toHaveBeenCalledWith({
      modelId: undefined,
      model: 'text-embedding-3-small'
    });
  });

  it('does not normalize an empty vectorModelId into an absent field', () => {
    getDatasetEmbeddingModel({ vectorModelId: '', vectorModel: 'text-embedding-3-small' });

    expect(getEmbeddingModelDataMock).toHaveBeenCalledWith({
      modelId: '',
      model: 'text-embedding-3-small'
    });
  });

  it('returns inactive embedding models for display without weakening execution lookup', () => {
    const inactiveModel = {
      type: ModelTypeEnum.embedding,
      isActive: false
    };
    findModelDataMock.mockReturnValue(inactiveModel);

    expect(findDatasetEmbeddingModel({ vectorModelId: 'embedding-id' })).toBe(inactiveModel);
    expect(findModelDataMock).toHaveBeenCalledWith({
      modelId: 'embedding-id',
      model: undefined
    });
    expect(getEmbeddingModelDataMock).not.toHaveBeenCalled();
  });

  it('treats deleted and wrong-type models as unavailable display data', () => {
    findModelDataMock.mockReturnValueOnce(undefined).mockReturnValueOnce({
      type: ModelTypeEnum.llm
    });

    expect(findDatasetEmbeddingModel({ vectorModelId: 'deleted-id' })).toBeUndefined();
    expect(findDatasetEmbeddingModel({ vectorModelId: 'wrong-type-id' })).toBeUndefined();
  });

  it('returns only LLM and vision-capable models for dataset display fields', () => {
    const llmModel = {
      type: ModelTypeEnum.llm,
      config: { vision: true },
      isActive: false
    };
    findModelDataMock.mockReturnValue(llmModel);

    expect(findDatasetAgentModel({ agentModelId: 'llm-id' })).toBe(llmModel);
    expect(findDatasetVlmModel({ vlmModelId: 'vlm-id' })).toBe(llmModel);

    findModelDataMock.mockReturnValue({
      type: ModelTypeEnum.llm,
      config: { vision: false }
    });
    expect(findDatasetVlmModel({ vlmModelId: 'text-only-id' })).toBeUndefined();
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getDatasetEmbeddingModel } from '../../../core/dataset/model';

const getEmbeddingModelDataMock = vi.hoisted(() => vi.fn());

vi.mock('../../../core/ai/model', () => ({
  getEmbeddingModelData: getEmbeddingModelDataMock,
  getLLMModelData: vi.fn(),
  getOptionalVlmModelData: vi.fn()
}));

describe('dataset model resolution', () => {
  beforeEach(() => {
    getEmbeddingModelDataMock.mockReset();
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
});

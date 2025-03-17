import { describe, expect, it, vi, beforeEach } from 'vitest';
import { getWebLLMModel, getWebDefaultLLMModel, getWebDefaultEmbeddingModel } from './utils';
import { useSystemStore } from './useSystemStore';
import { LLMModelItemType, EmbeddingModelItemType } from '@fastgpt/global/core/ai/model.d';

describe('getWebLLMModel', () => {
  const mockLLMList: LLMModelItemType[] = [
    { model: 'model1', name: 'Model 1' } as LLMModelItemType,
    { model: 'model2', name: 'Model 2' } as LLMModelItemType
  ];

  const mockDefaultModels = {
    llm: { model: 'model1', name: 'Model 1' } as LLMModelItemType,
    embedding: null
  };

  beforeEach(() => {
    vi.spyOn(useSystemStore, 'getState').mockImplementation(() => ({
      llmModelList: mockLLMList,
      defaultModels: mockDefaultModels,
      embeddingModelList: []
    }));
  });

  it('should return model by model name', () => {
    expect(getWebLLMModel('model1')).toEqual(mockLLMList[0]);
  });

  it('should return model by display name', () => {
    expect(getWebLLMModel('Model 2')).toEqual(mockLLMList[1]);
  });

  it('should return default model if model not found', () => {
    expect(getWebLLMModel('nonexistent')).toEqual(mockDefaultModels.llm);
  });

  it('should return default model if no model specified', () => {
    expect(getWebLLMModel()).toEqual(mockDefaultModels.llm);
  });
});

describe('getWebDefaultLLMModel', () => {
  const mockLLMList: LLMModelItemType[] = [
    { model: 'model1', name: 'Model 1' } as LLMModelItemType,
    { model: 'model2', name: 'Model 2' } as LLMModelItemType
  ];

  const mockDefaultModels = {
    llm: { model: 'model1', name: 'Model 1' } as LLMModelItemType,
    embedding: null
  };

  beforeEach(() => {
    vi.spyOn(useSystemStore, 'getState').mockImplementation(() => ({
      llmModelList: mockLLMList,
      defaultModels: mockDefaultModels,
      embeddingModelList: []
    }));
  });

  it('should return default model if it exists in list', () => {
    expect(getWebDefaultLLMModel()).toEqual(mockDefaultModels.llm);
  });

  it('should return first model if default model not in list', () => {
    vi.spyOn(useSystemStore, 'getState').mockImplementation(() => ({
      llmModelList: mockLLMList,
      defaultModels: {
        llm: { model: 'nonexistent' } as LLMModelItemType,
        embedding: null
      },
      embeddingModelList: []
    }));
    expect(getWebDefaultLLMModel()).toEqual(mockLLMList[0]);
  });

  it('should use provided list instead of store list', () => {
    const customList = [{ model: 'custom', name: 'Custom' }] as LLMModelItemType[];
    expect(getWebDefaultLLMModel(customList)).toEqual(customList[0]);
  });
});

describe('getWebDefaultEmbeddingModel', () => {
  const mockEmbeddingList: EmbeddingModelItemType[] = [
    { model: 'embed1', name: 'Embed 1' } as EmbeddingModelItemType,
    { model: 'embed2', name: 'Embed 2' } as EmbeddingModelItemType
  ];

  const mockDefaultModels = {
    llm: null,
    embedding: { model: 'embed1', name: 'Embed 1' } as EmbeddingModelItemType
  };

  beforeEach(() => {
    vi.spyOn(useSystemStore, 'getState').mockImplementation(() => ({
      embeddingModelList: mockEmbeddingList,
      defaultModels: mockDefaultModels,
      llmModelList: []
    }));
  });

  it('should return default embedding model if it exists in list', () => {
    expect(getWebDefaultEmbeddingModel()).toEqual(mockDefaultModels.embedding);
  });

  it('should return first model if default model not in list', () => {
    vi.spyOn(useSystemStore, 'getState').mockImplementation(() => ({
      embeddingModelList: mockEmbeddingList,
      defaultModels: {
        llm: null,
        embedding: { model: 'nonexistent' } as EmbeddingModelItemType
      },
      llmModelList: []
    }));
    expect(getWebDefaultEmbeddingModel()).toEqual(mockEmbeddingList[0]);
  });

  it('should use provided list instead of store list', () => {
    const customList = [{ model: 'custom', name: 'Custom' }] as EmbeddingModelItemType[];
    expect(getWebDefaultEmbeddingModel(customList)).toEqual(customList[0]);
  });
});

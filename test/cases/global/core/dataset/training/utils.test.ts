import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
import type {
  LLMModelItemType,
  EmbeddingModelItemType
} from '@fastgpt/global/core/ai/model.schema';
import {
  ChunkSettingModeEnum,
  DataChunkSplitModeEnum,
  DatasetCollectionDataProcessModeEnum,
  ParagraphChunkAIModeEnum
} from '@fastgpt/global/core/dataset/constants';

// Mock getEmbeddingModel
const mockGetEmbeddingModel = vi.fn();
vi.mock('@fastgpt/service/core/ai/model', () => ({
  getEmbeddingModel: (model?: string) => mockGetEmbeddingModel(model)
}));

import {
  minChunkSize,
  chunkAutoChunkSize,
  getMaxChunkSize,
  defaultMaxChunkSize,
  getLLMDefaultChunkSize,
  getLLMMaxChunkSize,
  getMaxIndexSize,
  getAutoIndexSize,
  getIndexSizeSelectList,
  computedCollectionChunkSettings
} from '@fastgpt/global/core/dataset/training/utils';
import type { ChunkSettingsType } from '@fastgpt/global/core/dataset/type';

// Helper: Create mock LLM model
const createMockLLMModel = (overrides: Partial<LLMModelItemType> = {}): LLMModelItemType => ({
  type: ModelTypeEnum.llm,
  provider: 'test-provider',
  model: 'test-model',
  name: 'Test Model',
  maxContext: 8000,
  maxResponse: 2000,
  quoteMaxToken: 4000,
  functionCall: true,
  toolChoice: true,
  ...overrides
});

// Helper: Create mock Embedding model
const createMockEmbeddingModel = (
  overrides: Partial<EmbeddingModelItemType> = {}
): EmbeddingModelItemType => ({
  type: ModelTypeEnum.embedding,
  provider: 'test-provider',
  model: 'test-embedding',
  name: 'Test Embedding',
  defaultToken: 512,
  maxToken: 1024,
  weight: 1,
  ...overrides
});

describe('Constants', () => {
  it('should export minChunkSize as 64', () => {
    expect(minChunkSize).toBe(64);
  });

  it('should export chunkAutoChunkSize as 1000', () => {
    expect(chunkAutoChunkSize).toBe(1000);
  });

  it('should export defaultMaxChunkSize as 8000', () => {
    expect(defaultMaxChunkSize).toBe(8000);
  });
});

describe('getMaxChunkSize', () => {
  it('should return maxContext - maxResponse when result > 2000', () => {
    const model = createMockLLMModel({ maxContext: 8000, maxResponse: 2000 });
    expect(getMaxChunkSize(model)).toBe(6000);
  });

  it('should return 2000 when maxContext - maxResponse < 2000', () => {
    const model = createMockLLMModel({ maxContext: 3000, maxResponse: 2000 });
    expect(getMaxChunkSize(model)).toBe(2000);
  });

  it('should return 2000 when maxContext - maxResponse equals 2000', () => {
    const model = createMockLLMModel({ maxContext: 4000, maxResponse: 2000 });
    expect(getMaxChunkSize(model)).toBe(2000);
  });

  it('should handle large context models', () => {
    const model = createMockLLMModel({ maxContext: 128000, maxResponse: 8000 });
    expect(getMaxChunkSize(model)).toBe(120000);
  });
});

describe('getLLMDefaultChunkSize', () => {
  it('should return defaultMaxChunkSize (8000) when model is undefined', () => {
    expect(getLLMDefaultChunkSize(undefined)).toBe(8000);
  });

  it('should return min of (maxContext - maxResponse) and defaultMaxChunkSize when > 2000', () => {
    const model = createMockLLMModel({ maxContext: 16000, maxResponse: 4000 });
    // min(16000 - 4000, 8000) = min(12000, 8000) = 8000
    expect(getLLMDefaultChunkSize(model)).toBe(8000);
  });

  it('should return maxContext - maxResponse when less than defaultMaxChunkSize', () => {
    const model = createMockLLMModel({ maxContext: 6000, maxResponse: 2000 });
    // min(6000 - 2000, 8000) = min(4000, 8000) = 4000
    expect(getLLMDefaultChunkSize(model)).toBe(4000);
  });

  it('should return 2000 when maxContext - maxResponse < 2000', () => {
    const model = createMockLLMModel({ maxContext: 3000, maxResponse: 2000 });
    // max(min(1000, 8000), 2000) = max(1000, 2000) = 2000
    expect(getLLMDefaultChunkSize(model)).toBe(2000);
  });

  it('should handle edge case where result equals 2000', () => {
    const model = createMockLLMModel({ maxContext: 4000, maxResponse: 2000 });
    // max(min(2000, 8000), 2000) = max(2000, 2000) = 2000
    expect(getLLMDefaultChunkSize(model)).toBe(2000);
  });
});

describe('getLLMMaxChunkSize', () => {
  it('should return 8000 when model is undefined', () => {
    expect(getLLMMaxChunkSize(undefined)).toBe(8000);
  });

  it('should return maxContext when > 4000', () => {
    const model = createMockLLMModel({ maxContext: 16000 });
    expect(getLLMMaxChunkSize(model)).toBe(16000);
  });

  it('should return 4000 when maxContext < 4000', () => {
    const model = createMockLLMModel({ maxContext: 2000 });
    expect(getLLMMaxChunkSize(model)).toBe(4000);
  });

  it('should return 4000 when maxContext equals 4000', () => {
    const model = createMockLLMModel({ maxContext: 4000 });
    expect(getLLMMaxChunkSize(model)).toBe(4000);
  });

  it('should handle large context models', () => {
    const model = createMockLLMModel({ maxContext: 128000 });
    expect(getLLMMaxChunkSize(model)).toBe(128000);
  });
});

describe('getMaxIndexSize', () => {
  beforeEach(() => {
    mockGetEmbeddingModel.mockReset();
  });

  it('should return 512 when model is undefined', () => {
    expect(getMaxIndexSize(undefined)).toBe(512);
  });

  it('should return maxToken from EmbeddingModelItemType object', () => {
    const model = createMockEmbeddingModel({ maxToken: 2048 });
    expect(getMaxIndexSize(model)).toBe(2048);
  });

  it('should call getEmbeddingModel and return maxToken when model is string', () => {
    const embeddingModel = createMockEmbeddingModel({ maxToken: 1536 });
    mockGetEmbeddingModel.mockReturnValue(embeddingModel);

    expect(getMaxIndexSize('text-embedding-ada-002')).toBe(1536);
    expect(mockGetEmbeddingModel).toHaveBeenCalledWith('text-embedding-ada-002');
  });

  it('should return 512 when getEmbeddingModel returns undefined', () => {
    mockGetEmbeddingModel.mockReturnValue(undefined);
    expect(getMaxIndexSize('unknown-model')).toBe(512);
  });

  it('should return 512 when model object has no maxToken', () => {
    const model = { ...createMockEmbeddingModel(), maxToken: undefined } as any;
    expect(getMaxIndexSize(model)).toBe(512);
  });
});

describe('getAutoIndexSize', () => {
  beforeEach(() => {
    mockGetEmbeddingModel.mockReset();
  });

  it('should return 512 when model is undefined', () => {
    expect(getAutoIndexSize(undefined)).toBe(512);
  });

  it('should return defaultToken from EmbeddingModelItemType object', () => {
    const model = createMockEmbeddingModel({ defaultToken: 768 });
    expect(getAutoIndexSize(model)).toBe(768);
  });

  it('should call getEmbeddingModel and return defaultToken when model is string', () => {
    const embeddingModel = createMockEmbeddingModel({ defaultToken: 256 });
    mockGetEmbeddingModel.mockReturnValue(embeddingModel);

    expect(getAutoIndexSize('text-embedding-3-small')).toBe(256);
    expect(mockGetEmbeddingModel).toHaveBeenCalledWith('text-embedding-3-small');
  });

  it('should return 512 when getEmbeddingModel returns undefined', () => {
    mockGetEmbeddingModel.mockReturnValue(undefined);
    expect(getAutoIndexSize('unknown-model')).toBe(512);
  });

  it('should return 512 when model object has no defaultToken', () => {
    const model = { ...createMockEmbeddingModel(), defaultToken: undefined } as any;
    expect(getAutoIndexSize(model)).toBe(512);
  });
});

describe('getIndexSizeSelectList', () => {
  it('should return all items when max is 8192 or higher', () => {
    const list = getIndexSizeSelectList(8192);
    expect(list).toHaveLength(14);
    expect(list[0]).toEqual({ label: '64', value: 64 });
    expect(list[list.length - 1]).toEqual({ label: '8192', value: 8192 });
  });

  it('should return default list (up to 512) when max is not provided', () => {
    const list = getIndexSizeSelectList();
    expect(list).toHaveLength(4);
    expect(list.map((item) => item.value)).toEqual([64, 128, 256, 512]);
  });

  it('should filter items based on max value', () => {
    const list = getIndexSizeSelectList(256);
    expect(list).toHaveLength(3);
    expect(list.map((item) => item.value)).toEqual([64, 128, 256]);
  });

  it('should return only first item when max is 64', () => {
    const list = getIndexSizeSelectList(64);
    expect(list).toHaveLength(1);
    expect(list[0]).toEqual({ label: '64', value: 64 });
  });

  it('should return empty array when max is less than 64', () => {
    const list = getIndexSizeSelectList(32);
    expect(list).toHaveLength(0);
  });

  it('should include items up to 1024', () => {
    const list = getIndexSizeSelectList(1024);
    expect(list).toHaveLength(6);
    expect(list.map((item) => item.value)).toEqual([64, 128, 256, 512, 768, 1024]);
  });
});

describe('computedCollectionChunkSettings', () => {
  const defaultLLMModel = createMockLLMModel({ maxContext: 16000, maxResponse: 4000 });
  const defaultVectorModel = createMockEmbeddingModel({ defaultToken: 512, maxToken: 1024 });

  describe('trainingType handling', () => {
    it('should delete qaPrompt when trainingType is not qa', () => {
      const result = computedCollectionChunkSettings({
        trainingType: DatasetCollectionDataProcessModeEnum.chunk,
        qaPrompt: 'some prompt',
        llmModel: defaultLLMModel,
        vectorModel: defaultVectorModel
      });
      expect(result.qaPrompt).toBeUndefined();
    });

    it('should keep qaPrompt when trainingType is qa', () => {
      const result = computedCollectionChunkSettings({
        trainingType: DatasetCollectionDataProcessModeEnum.qa,
        qaPrompt: 'some prompt',
        llmModel: defaultLLMModel,
        vectorModel: defaultVectorModel
      });
      expect(result.qaPrompt).toBe('some prompt');
    });
  });

  describe('auto chunkSettingMode', () => {
    it('should set default auto settings when chunkSettingMode is auto', () => {
      const result = computedCollectionChunkSettings<ChunkSettingsType>({
        chunkSettingMode: ChunkSettingModeEnum.auto,
        llmModel: defaultLLMModel,
        vectorModel: defaultVectorModel
      });

      expect(result.chunkSplitMode).toBe(DataChunkSplitModeEnum.paragraph);
      expect(result.paragraphChunkAIMode).toBe(ParagraphChunkAIModeEnum.forbid);
      expect(result.paragraphChunkDeep).toBe(5);
      expect(result.paragraphChunkMinSize).toBe(100);
      expect(result.chunkSize).toBe(1000); // chunkAutoChunkSize
      expect(result.indexSize).toBe(512); // defaultToken from vectorModel
      expect(result.chunkSplitter).toBeUndefined();
    });

    it('should use default chunkSettingMode as auto when not specified', () => {
      const result = computedCollectionChunkSettings<ChunkSettingsType>({
        llmModel: defaultLLMModel,
        vectorModel: defaultVectorModel
      });

      expect(result.chunkSplitMode).toBe(DataChunkSplitModeEnum.paragraph);
      expect(result.paragraphChunkAIMode).toBe(ParagraphChunkAIModeEnum.forbid);
    });
  });

  describe('custom chunkSettingMode', () => {
    it('should set paragraphChunkDeep when chunkSplitMode is paragraph', () => {
      const result = computedCollectionChunkSettings<ChunkSettingsType>({
        chunkSettingMode: ChunkSettingModeEnum.custom,
        chunkSplitMode: DataChunkSplitModeEnum.paragraph,
        paragraphChunkDeep: 3,
        llmModel: defaultLLMModel,
        vectorModel: defaultVectorModel
      });

      expect(result.paragraphChunkDeep).toBe(3);
    });

    it('should set paragraphChunkDeep to 0 when chunkSplitMode is not paragraph', () => {
      const result = computedCollectionChunkSettings<ChunkSettingsType>({
        chunkSettingMode: ChunkSettingModeEnum.custom,
        chunkSplitMode: DataChunkSplitModeEnum.size,
        paragraphChunkDeep: 3,
        llmModel: defaultLLMModel,
        vectorModel: defaultVectorModel
      });

      expect(result.paragraphChunkDeep).toBe(0);
    });

    it('should use default paragraphChunkDeep of 5 when not specified', () => {
      const result = computedCollectionChunkSettings<ChunkSettingsType>({
        chunkSettingMode: ChunkSettingModeEnum.custom,
        chunkSplitMode: DataChunkSplitModeEnum.paragraph,
        llmModel: defaultLLMModel,
        vectorModel: defaultVectorModel
      });

      expect(result.paragraphChunkDeep).toBe(5);
    });

    it('should limit chunkSize to getLLMMaxChunkSize when provided', () => {
      const result = computedCollectionChunkSettings<ChunkSettingsType>({
        chunkSettingMode: ChunkSettingModeEnum.custom,
        chunkSize: 50000,
        llmModel: defaultLLMModel,
        vectorModel: defaultVectorModel
      });

      // getLLMMaxChunkSize(defaultLLMModel) = max(16000, 4000) = 16000
      expect(result.chunkSize).toBe(16000);
    });

    it('should keep chunkSize when less than getLLMMaxChunkSize', () => {
      const result = computedCollectionChunkSettings<ChunkSettingsType>({
        chunkSettingMode: ChunkSettingModeEnum.custom,
        chunkSize: 5000,
        llmModel: defaultLLMModel,
        vectorModel: defaultVectorModel
      });

      expect(result.chunkSize).toBe(5000);
    });

    it('should set chunkSize to undefined when not provided in custom mode', () => {
      const result = computedCollectionChunkSettings<ChunkSettingsType>({
        chunkSettingMode: ChunkSettingModeEnum.custom,
        llmModel: defaultLLMModel,
        vectorModel: defaultVectorModel
      });

      expect(result.chunkSize).toBeUndefined();
    });

    it('should preserve indexSize in custom mode', () => {
      const result = computedCollectionChunkSettings<ChunkSettingsType>({
        chunkSettingMode: ChunkSettingModeEnum.custom,
        indexSize: 768,
        llmModel: defaultLLMModel,
        vectorModel: defaultVectorModel
      });

      expect(result.indexSize).toBe(768);
    });
  });

  describe('QA trainingType', () => {
    it('should use getLLMDefaultChunkSize for autoChunkSize in QA mode', () => {
      const result = computedCollectionChunkSettings<ChunkSettingsType>({
        trainingType: DatasetCollectionDataProcessModeEnum.qa,
        chunkSettingMode: ChunkSettingModeEnum.auto,
        llmModel: defaultLLMModel,
        vectorModel: defaultVectorModel
      });

      // getLLMDefaultChunkSize(defaultLLMModel) = max(min(16000-4000, 8000), 2000) = 8000
      expect(result.chunkSize).toBe(8000);
    });

    it('should use getMaxIndexSize for indexSize in QA mode', () => {
      const result = computedCollectionChunkSettings<ChunkSettingsType>({
        trainingType: DatasetCollectionDataProcessModeEnum.qa,
        chunkSettingMode: ChunkSettingModeEnum.auto,
        llmModel: defaultLLMModel,
        vectorModel: defaultVectorModel
      });

      // getMaxIndexSize(defaultVectorModel) = 1024
      expect(result.indexSize).toBe(1024);
    });

    it('should preserve chunkSize in QA custom mode', () => {
      const result = computedCollectionChunkSettings<ChunkSettingsType>({
        trainingType: DatasetCollectionDataProcessModeEnum.qa,
        chunkSettingMode: ChunkSettingModeEnum.custom,
        chunkSize: 4000,
        llmModel: defaultLLMModel,
        vectorModel: defaultVectorModel
      });

      expect(result.chunkSize).toBe(4000);
    });
  });

  describe('autoIndexes handling', () => {
    it('should use getAutoIndexSize when autoIndexes is true', () => {
      const result = computedCollectionChunkSettings<ChunkSettingsType>({
        trainingType: DatasetCollectionDataProcessModeEnum.chunk,
        chunkSettingMode: ChunkSettingModeEnum.auto,
        autoIndexes: true,
        llmModel: defaultLLMModel,
        vectorModel: defaultVectorModel
      });

      // getAutoIndexSize(defaultVectorModel) = 512
      expect(result.indexSize).toBe(512);
    });

    it('should use getAutoIndexSize when autoIndexes is false', () => {
      const result = computedCollectionChunkSettings<ChunkSettingsType>({
        trainingType: DatasetCollectionDataProcessModeEnum.chunk,
        chunkSettingMode: ChunkSettingModeEnum.auto,
        autoIndexes: false,
        llmModel: defaultLLMModel,
        vectorModel: defaultVectorModel
      });

      // getAutoIndexSize(defaultVectorModel) = 512
      expect(result.indexSize).toBe(512);
    });
  });

  describe('without models', () => {
    it('should work without llmModel', () => {
      const result = computedCollectionChunkSettings<ChunkSettingsType>({
        chunkSettingMode: ChunkSettingModeEnum.auto,
        vectorModel: defaultVectorModel
      });

      expect(result.chunkSize).toBe(1000);
      expect(result.indexSize).toBe(512);
    });

    it('should work without vectorModel', () => {
      const result = computedCollectionChunkSettings<ChunkSettingsType>({
        chunkSettingMode: ChunkSettingModeEnum.auto,
        llmModel: defaultLLMModel
      });

      expect(result.chunkSize).toBe(1000);
      expect(result.indexSize).toBe(512); // default when no vectorModel
    });

    it('should work without any models', () => {
      const result = computedCollectionChunkSettings<ChunkSettingsType>({
        chunkSettingMode: ChunkSettingModeEnum.auto
      });

      expect(result.chunkSize).toBe(1000);
      expect(result.indexSize).toBe(512);
    });
  });

  describe('data immutability', () => {
    it('should not modify the original input data', () => {
      const originalData = {
        trainingType: DatasetCollectionDataProcessModeEnum.chunk,
        chunkSettingMode: ChunkSettingModeEnum.auto,
        qaPrompt: 'original prompt',
        chunkSize: 2000,
        indexSize: 256,
        llmModel: defaultLLMModel,
        vectorModel: defaultVectorModel
      };

      const originalCopy = { ...originalData };
      computedCollectionChunkSettings(originalData);

      expect(originalData.qaPrompt).toBe(originalCopy.qaPrompt);
      expect(originalData.chunkSize).toBe(originalCopy.chunkSize);
      expect(originalData.indexSize).toBe(originalCopy.indexSize);
    });
  });

  describe('char split mode', () => {
    it('should set paragraphChunkDeep to 0 when chunkSplitMode is char', () => {
      const result = computedCollectionChunkSettings<ChunkSettingsType>({
        chunkSettingMode: ChunkSettingModeEnum.custom,
        chunkSplitMode: DataChunkSplitModeEnum.char,
        paragraphChunkDeep: 5,
        llmModel: defaultLLMModel,
        vectorModel: defaultVectorModel
      });

      expect(result.paragraphChunkDeep).toBe(0);
    });
  });

  describe('edge cases', () => {
    it('should handle empty input object', () => {
      const result = computedCollectionChunkSettings<ChunkSettingsType>({});
      expect(result).toBeDefined();
      expect(result.chunkSplitMode).toBe(DataChunkSplitModeEnum.paragraph);
    });

    it('should preserve other properties in the input', () => {
      const result = computedCollectionChunkSettings<ChunkSettingsType>({
        chunkSettingMode: ChunkSettingModeEnum.auto,
        imageIndex: true,
        indexPrefixTitle: true,
        dataEnhanceCollectionName: true,
        llmModel: defaultLLMModel,
        vectorModel: defaultVectorModel
      });

      expect(result.imageIndex).toBe(true);
      expect(result.indexPrefixTitle).toBe(true);
      expect(result.dataEnhanceCollectionName).toBe(true);
    });

    it('should handle chunkSplitter in custom mode', () => {
      const result = computedCollectionChunkSettings<ChunkSettingsType>({
        chunkSettingMode: ChunkSettingModeEnum.custom,
        chunkSplitter: '---',
        llmModel: defaultLLMModel,
        vectorModel: defaultVectorModel
      });

      expect(result.chunkSplitter).toBe('---');
    });

    it('should clear chunkSplitter in auto mode', () => {
      const result = computedCollectionChunkSettings<ChunkSettingsType>({
        chunkSettingMode: ChunkSettingModeEnum.auto,
        chunkSplitter: '---',
        llmModel: defaultLLMModel,
        vectorModel: defaultVectorModel
      });

      expect(result.chunkSplitter).toBeUndefined();
    });
  });
});

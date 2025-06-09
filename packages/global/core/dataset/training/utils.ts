import { getEmbeddingModel } from '../../../../service/core/ai/model';
import { type EmbeddingModelItemType, type LLMModelItemType } from '../../../core/ai/model.d';
import {
  ChunkSettingModeEnum,
  DataChunkSplitModeEnum,
  DatasetCollectionDataProcessModeEnum,
  ParagraphChunkAIModeEnum
} from '../constants';
import type { ChunkSettingsType } from '../type';
import { cloneDeep } from 'lodash';

export const minChunkSize = 64; // min index and chunk size

// Chunk size
export const chunkAutoChunkSize = 1000;
export const getMaxChunkSize = (model: LLMModelItemType) => {
  return Math.max(model.maxContext - model.maxResponse, 2000);
};

// QA
export const defaultMaxChunkSize = 8000;
export const getLLMDefaultChunkSize = (model?: LLMModelItemType) => {
  if (!model) return defaultMaxChunkSize;
  return Math.max(Math.min(model.maxContext - model.maxResponse, defaultMaxChunkSize), 2000);
};

export const getLLMMaxChunkSize = (model?: LLMModelItemType) => {
  if (!model) return 8000;
  return Math.max(model.maxContext - model.maxResponse, 2000);
};

// Index size
export const getMaxIndexSize = (model?: EmbeddingModelItemType | string) => {
  if (!model) return 512;
  const modelData = typeof model === 'string' ? getEmbeddingModel(model) : model;

  return modelData?.maxToken || 512;
};
export const getAutoIndexSize = (model?: EmbeddingModelItemType | string) => {
  if (!model) return 512;

  const modelData = typeof model === 'string' ? getEmbeddingModel(model) : model;
  return modelData?.defaultToken || 512;
};

const indexSizeSelectList = [
  {
    label: '64',
    value: 64
  },
  {
    label: '128',
    value: 128
  },
  {
    label: '256',
    value: 256
  },
  {
    label: '512',
    value: 512
  },
  {
    label: '768',
    value: 768
  },
  {
    label: '1024',
    value: 1024
  },
  {
    label: '1536',
    value: 1536
  },
  {
    label: '2048',
    value: 2048
  },
  {
    label: '3072',
    value: 3072
  },
  {
    label: '4096',
    value: 4096
  },
  {
    label: '5120',
    value: 5120
  },
  {
    label: '6144',
    value: 6144
  },
  {
    label: '7168',
    value: 7168
  },
  {
    label: '8192',
    value: 8192
  }
];
export const getIndexSizeSelectList = (max = 512) => {
  return indexSizeSelectList.filter((item) => item.value <= max);
};

// Compute
export const computedCollectionChunkSettings = <T extends ChunkSettingsType>({
  llmModel,
  vectorModel,
  ...data
}: {
  llmModel?: LLMModelItemType;
  vectorModel?: EmbeddingModelItemType;
} & T) => {
  const {
    trainingType = DatasetCollectionDataProcessModeEnum.chunk,
    chunkSettingMode = ChunkSettingModeEnum.auto,
    chunkSplitMode,
    chunkSize,
    paragraphChunkDeep = 5,
    indexSize,
    autoIndexes
  } = data;
  const cloneChunkSettings = cloneDeep(data);

  if (trainingType !== DatasetCollectionDataProcessModeEnum.qa) {
    delete cloneChunkSettings.qaPrompt;
  }

  // Format training type indexSize/chunkSize
  const trainingModeSize: {
    autoChunkSize: number;
    autoIndexSize: number;
    chunkSize?: number;
    indexSize?: number;
  } = (() => {
    if (trainingType === DatasetCollectionDataProcessModeEnum.qa) {
      return {
        autoChunkSize: getLLMDefaultChunkSize(llmModel),
        autoIndexSize: getMaxIndexSize(vectorModel),
        chunkSize,
        indexSize: getMaxIndexSize(vectorModel)
      };
    } else if (autoIndexes) {
      return {
        autoChunkSize: chunkAutoChunkSize,
        autoIndexSize: getAutoIndexSize(vectorModel),
        chunkSize,
        indexSize
      };
    } else {
      return {
        autoChunkSize: chunkAutoChunkSize,
        autoIndexSize: getAutoIndexSize(vectorModel),
        chunkSize,
        indexSize
      };
    }
  })();

  if (chunkSettingMode === ChunkSettingModeEnum.auto) {
    cloneChunkSettings.chunkSplitMode = DataChunkSplitModeEnum.paragraph;
    cloneChunkSettings.paragraphChunkAIMode = ParagraphChunkAIModeEnum.forbid;
    cloneChunkSettings.paragraphChunkDeep = 5;
    cloneChunkSettings.paragraphChunkMinSize = 100;
    cloneChunkSettings.chunkSize = trainingModeSize.autoChunkSize;
    cloneChunkSettings.indexSize = trainingModeSize.autoIndexSize;

    cloneChunkSettings.chunkSplitter = undefined;
  } else {
    cloneChunkSettings.paragraphChunkDeep =
      chunkSplitMode === DataChunkSplitModeEnum.paragraph ? paragraphChunkDeep : 0;

    cloneChunkSettings.chunkSize = trainingModeSize.chunkSize
      ? Math.min(trainingModeSize.chunkSize ?? chunkAutoChunkSize, getLLMMaxChunkSize(llmModel))
      : undefined;
    cloneChunkSettings.indexSize = trainingModeSize.indexSize;
  }

  return cloneChunkSettings;
};

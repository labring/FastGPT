import { EmbeddingModelItemType, LLMModelItemType } from '../../../core/ai/model.d';
import {
  ChunkSettingModeEnum,
  DataChunkSplitModeEnum,
  DatasetCollectionDataProcessModeEnum
} from '../constants';

export const minChunkSize = 64; // min index and chunk size

// Chunk size
export const chunkAutoChunkSize = 1500;
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
export const getMaxIndexSize = (model?: EmbeddingModelItemType) => {
  return model?.maxToken || 512;
};
export const getAutoIndexSize = (model?: EmbeddingModelItemType) => {
  return model?.defaultToken || 512;
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
export const computeChunkSize = (params: {
  trainingType: DatasetCollectionDataProcessModeEnum;
  chunkSettingMode?: ChunkSettingModeEnum;
  chunkSplitMode?: DataChunkSplitModeEnum;
  llmModel?: LLMModelItemType;
  chunkSize?: number;
}) => {
  if (params.trainingType === DatasetCollectionDataProcessModeEnum.qa) {
    if (params.chunkSettingMode === ChunkSettingModeEnum.auto) {
      return getLLMDefaultChunkSize(params.llmModel);
    }
  } else {
    // chunk
    if (params.chunkSettingMode === ChunkSettingModeEnum.auto) {
      return chunkAutoChunkSize;
    }
  }

  if (params.chunkSplitMode === DataChunkSplitModeEnum.char) {
    return getLLMMaxChunkSize(params.llmModel);
  }

  return Math.min(params.chunkSize || chunkAutoChunkSize, getLLMMaxChunkSize(params.llmModel));
};

export const computeChunkSplitter = (params: {
  chunkSettingMode?: ChunkSettingModeEnum;
  chunkSplitMode?: DataChunkSplitModeEnum;
  chunkSplitter?: string;
}) => {
  if (params.chunkSettingMode === ChunkSettingModeEnum.auto) {
    return undefined;
  }
  if (params.chunkSplitMode === DataChunkSplitModeEnum.size) {
    return undefined;
  }
  return params.chunkSplitter;
};

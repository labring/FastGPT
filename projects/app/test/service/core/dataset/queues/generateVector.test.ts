import { beforeEach, describe, expect, it } from 'vitest';
import { getRebuildBaseIndexes } from '@/service/core/dataset/queues/generateVector';
import { DatasetDataIndexTypeEnum } from '@fastgpt/global/core/dataset/data/constants';
import type {
  EmbeddingSystemModelDataType,
  LLMSystemModelDataType
} from '@fastgpt/global/core/ai/model.schema';

let visionEmbeddingModel: EmbeddingSystemModelDataType;
let vlmModel: LLMSystemModelDataType;

describe('generateVector image embedding helpers', () => {
  beforeEach(() => {
    const defaultEmbeddingModel = global.systemDefaultModel.embedding;
    const defaultLLMModel = global.systemDefaultModel.llm;
    visionEmbeddingModel = {
      ...defaultEmbeddingModel,
      modelId: '507f1f77bcf86cd799439021',
      model: 'vision-embedding',
      name: 'vision-embedding',
      config: {
        ...defaultEmbeddingModel.config,
        vision: true
      }
    };
    vlmModel = {
      ...defaultLLMModel,
      modelId: '507f1f77bcf86cd799439022',
      model: 'vlm-model',
      name: 'vlm-model',
      config: {
        ...defaultLLMModel.config,
        vision: true
      }
    };

    [visionEmbeddingModel, vlmModel].forEach((model) => {
      global.systemModelMap.set(`id:${model.modelId}`, model);
      global.systemModelMap.set(`model:${model.model}`, model);
    });
  });

  it('should drop system indexes and keep supported external image description indexes when rebuilding', () => {
    const result = getRebuildBaseIndexes({
      indexes: [
        { type: DatasetDataIndexTypeEnum.default, text: 'old default', dataId: 'default_id' },
        { type: DatasetDataIndexTypeEnum.custom, text: 'manual', dataId: 'manual_id' },
        {
          type: DatasetDataIndexTypeEnum.imageEmbedding,
          text: 'dataset/team/main.png',
          dataId: 'main_vector_id'
        },
        {
          type: DatasetDataIndexTypeEnum.imageEmbedding,
          text: 'dataset/team/stale.png',
          dataId: 'stale_vector_id'
        },
        {
          type: DatasetDataIndexTypeEnum.image,
          text: 'image description',
          dataId: 'image_desc_id'
        }
      ],
      q: 'content ![markdown](dataset/team/markdown.png)',
      dataset: {
        vectorModelId: visionEmbeddingModel.modelId,
        vlmModelId: vlmModel.modelId
      },
      collection: {
        imageIndex: true
      },
      data: {
        imageId: 'dataset/team/main.png',
        indexes: []
      }
    } as any);

    expect(result).toEqual([
      { type: DatasetDataIndexTypeEnum.custom, text: 'manual', dataId: 'manual_id' },
      {
        type: DatasetDataIndexTypeEnum.image,
        text: 'image description',
        dataId: 'image_desc_id'
      }
    ]);
  });

  it('should drop VLM image description indexes when collection image index is disabled', () => {
    const result = getRebuildBaseIndexes({
      indexes: [
        { type: DatasetDataIndexTypeEnum.custom, text: 'manual', dataId: 'manual_id' },
        {
          type: DatasetDataIndexTypeEnum.image,
          text: 'image description',
          dataId: 'image_desc_id'
        },
        {
          type: DatasetDataIndexTypeEnum.imageEmbedding,
          text: 'dataset/team/main.png',
          dataId: 'main_vector_id'
        }
      ],
      dataset: {
        vectorModelId: visionEmbeddingModel.modelId,
        vlmModelId: vlmModel.modelId
      },
      collection: {
        imageIndex: false
      },
      data: {
        imageId: 'dataset/team/main.png',
        indexes: []
      }
    } as any);

    expect(result).toEqual([
      { type: DatasetDataIndexTypeEnum.custom, text: 'manual', dataId: 'manual_id' }
    ]);
  });
});

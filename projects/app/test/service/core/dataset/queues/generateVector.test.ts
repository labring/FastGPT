import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getRebuildBaseIndexes } from '@/service/core/dataset/queues/generateVector';
import { DatasetDataIndexTypeEnum } from '@fastgpt/global/core/dataset/data/constants';

const visionEmbeddingModel = {
  id: 'vision-embedding',
  model: 'vision-embedding',
  name: 'vision-embedding',
  maxToken: 100,
  vision: true
} as any;

describe('generateVector image embedding helpers', () => {
  const originalEmbeddingModelIdMap = global.embeddingModelIdMap;
  const originalLlmModelIdMap = global.llmModelIdMap;

  beforeEach(() => {
    global.embeddingModelIdMap = new Map(originalEmbeddingModelIdMap);
    global.llmModelIdMap = new Map(originalLlmModelIdMap);
    global.embeddingModelIdMap.set(visionEmbeddingModel.id, visionEmbeddingModel);
    const vlmModel = {
      id: 'vlm-model',
      ...global.systemDefaultModel.llm,
      model: 'vlm-model',
      name: 'vlm-model',
      vision: true
    };
    global.llmModelIdMap.set('vlm-model', vlmModel);
  });

  afterEach(() => {
    global.embeddingModelIdMap = originalEmbeddingModelIdMap;
    global.llmModelIdMap = originalLlmModelIdMap;
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
        vectorModelId: visionEmbeddingModel.id,
        vlmModelId: 'vlm-model'
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
        vectorModelId: visionEmbeddingModel.id,
        vlmModelId: 'vlm-model'
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

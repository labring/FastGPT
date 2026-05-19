import { beforeEach, describe, expect, it } from 'vitest';
import {
  appendImageEmbeddingIndexes,
  getMarkdownImageUrlsFromTrainingData,
  getRebuildBaseIndexes
} from '@/service/core/dataset/queues/generateVector';
import { DatasetDataIndexTypeEnum } from '@fastgpt/global/core/dataset/data/constants';

const visionEmbeddingModel = {
  model: 'vision-embedding',
  name: 'vision-embedding',
  maxToken: 100,
  vision: true
} as any;

const textEmbeddingModel = {
  model: 'text-embedding',
  name: 'text-embedding',
  maxToken: 100
} as any;

describe('generateVector image embedding helpers', () => {
  beforeEach(() => {
    global.embeddingModelMap.set(visionEmbeddingModel.model, visionEmbeddingModel);
    global.embeddingModelMap.set(textEmbeddingModel.model, textEmbeddingModel);
    global.llmModelMap.set('vlm-model', {
      ...global.systemDefaultModel.llm,
      model: 'vlm-model',
      name: 'vlm-model',
      vision: true
    });
  });

  it('should collect unique markdown image urls from training data and bound data', () => {
    const result = getMarkdownImageUrlsFromTrainingData({
      q: 'new ![a](dataset/team/a.png) ![a again](dataset/team/a.png)',
      data: {
        q: 'old ![b](https://example.com/b.jpg)'
      }
    });

    expect(result).toEqual(['dataset/team/a.png', 'https://example.com/b.jpg']);
  });

  it('should append data image and markdown image embedding indexes for vision embedding model', () => {
    const result = appendImageEmbeddingIndexes({
      indexes: [
        { type: DatasetDataIndexTypeEnum.custom, text: 'manual' },
        {
          type: DatasetDataIndexTypeEnum.imageEmbedding,
          text: 'dataset/team/existed.png',
          dataId: 'old_vector_id'
        }
      ],
      embModel: visionEmbeddingModel,
      trainingData: {
        q: 'content ![markdown](dataset/team/markdown.png) ![skip](/local/file.png)',
        collection: { imageIndex: true },
        data: {
          imageId: 'dataset/team/main.png',
          q: 'old ![existed](dataset/team/existed.png)'
        }
      } as any
    });

    expect(result).toEqual([
      { type: DatasetDataIndexTypeEnum.custom, text: 'manual' },
      {
        type: DatasetDataIndexTypeEnum.imageEmbedding,
        text: 'dataset/team/existed.png',
        dataId: 'old_vector_id'
      },
      { type: DatasetDataIndexTypeEnum.imageEmbedding, text: 'dataset/team/main.png' },
      { type: DatasetDataIndexTypeEnum.imageEmbedding, text: 'dataset/team/markdown.png' }
    ]);
  });

  it('should not append image embedding indexes for text-only embedding model', () => {
    const indexes = [{ type: DatasetDataIndexTypeEnum.custom, text: 'manual' }];

    const result = appendImageEmbeddingIndexes({
      indexes,
      embModel: textEmbeddingModel,
      trainingData: {
        q: 'content ![markdown](dataset/team/markdown.png)',
        collection: { imageIndex: true },
        data: { imageId: 'dataset/team/main.png' }
      } as any
    });

    expect(result).toBe(indexes);
  });

  it('should keep only image indexes supported by current model and collection settings when rebuilding', () => {
    const result = getRebuildBaseIndexes({
      indexes: [
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
        vectorModel: visionEmbeddingModel.model,
        vlmModel: 'vlm-model'
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
        type: DatasetDataIndexTypeEnum.imageEmbedding,
        text: 'dataset/team/main.png',
        dataId: 'main_vector_id'
      },
      {
        type: DatasetDataIndexTypeEnum.image,
        text: 'image description',
        dataId: 'image_desc_id'
      }
    ]);
  });
});

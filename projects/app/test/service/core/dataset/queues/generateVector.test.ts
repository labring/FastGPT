import { describe, expect, it } from 'vitest';
import { DatasetDataIndexTypeEnum } from '@fastgpt/global/core/dataset/data/constants';
import {
  appendImageEmbeddingIndexes,
  getRebuildBaseIndexes,
  getMarkdownImageUrlsFromTrainingData,
  matchMarkdownImageUrls
} from '@/service/core/dataset/queues/generateVector';

const imageEmbeddingModel = {
  model: 'vision-embedding',
  name: 'vision-embedding',
  vision: true
} as any;

const textEmbeddingModel = {
  model: 'text-embedding',
  name: 'text-embedding',
  vision: false
} as any;

describe('generateVector image embedding indexes', () => {
  it('extracts markdown image urls', () => {
    expect(matchMarkdownImageUrls('foo ![a](https://a.com/a.png) bar ![](s3://b)')).toEqual([
      'https://a.com/a.png',
      's3://b'
    ]);
  });

  it('deduplicates markdown image urls from training data q and data q', () => {
    expect(
      getMarkdownImageUrlsFromTrainingData({
        q: 'chunk ![a](https://img/a.png)',
        data: {
          q: 'raw ![a](https://img/a.png) ![b](https://img/b.png)'
        }
      })
    ).toEqual(['https://img/a.png', 'https://img/b.png']);
  });

  it('appends imageEmbedding indexes from markdown images when collection imageIndex is enabled', () => {
    const indexes = appendImageEmbeddingIndexes({
      indexes: [
        {
          type: DatasetDataIndexTypeEnum.default,
          text: 'text index',
          dataId: ''
        }
      ],
      trainingData: {
        q: 'chunk ![a](https://img/a.png)',
        collection: {
          imageIndex: true
        }
      } as any,
      embModel: imageEmbeddingModel,
      includeDataImageId: false
    });

    expect(indexes).toEqual([
      {
        type: DatasetDataIndexTypeEnum.default,
        text: 'text index',
        dataId: ''
      },
      {
        type: DatasetDataIndexTypeEnum.imageEmbedding,
        text: 'https://img/a.png',
        dataId: ''
      }
    ]);
  });

  it('does not append unsupported local markdown image paths', () => {
    const indexes = appendImageEmbeddingIndexes({
      indexes: [],
      trainingData: {
        q: [
          '![relative](./local.png)',
          '![folder](images/local.png)',
          '![absolute](/Users/test/local.png)',
          '![file](file:///tmp/local.png)',
          '![remote](https://img/a.png)',
          '![s3](dataset/dataset-id/a.png)'
        ].join('\n'),
        collection: {
          imageIndex: true
        }
      } as any,
      embModel: imageEmbeddingModel,
      includeDataImageId: false
    });

    expect(indexes).toEqual([
      {
        type: DatasetDataIndexTypeEnum.imageEmbedding,
        text: 'https://img/a.png',
        dataId: ''
      },
      {
        type: DatasetDataIndexTypeEnum.imageEmbedding,
        text: 'dataset/dataset-id/a.png',
        dataId: ''
      }
    ]);
  });

  it('uses data q as rebuild fallback when training q no longer contains markdown images', () => {
    const indexes = appendImageEmbeddingIndexes({
      indexes: [],
      trainingData: {
        q: 'VLM image description text',
        data: {
          q: 'raw ![a](https://img/a.png)'
        },
        collection: {
          imageIndex: true
        }
      } as any,
      embModel: imageEmbeddingModel,
      includeDataImageId: false
    });

    expect(indexes).toEqual([
      {
        type: DatasetDataIndexTypeEnum.imageEmbedding,
        text: 'https://img/a.png',
        dataId: ''
      }
    ]);
  });

  it('does not append duplicate imageEmbedding indexes', () => {
    const indexes = appendImageEmbeddingIndexes({
      indexes: [
        {
          type: DatasetDataIndexTypeEnum.imageEmbedding,
          text: 'https://img/a.png',
          dataId: 'vector-id'
        }
      ],
      trainingData: {
        q: 'chunk ![a](https://img/a.png) ![b](https://img/b.png)',
        collection: {
          imageIndex: true
        }
      } as any,
      embModel: imageEmbeddingModel,
      includeDataImageId: false
    });

    expect(indexes).toEqual([
      {
        type: DatasetDataIndexTypeEnum.imageEmbedding,
        text: 'https://img/a.png',
        dataId: 'vector-id'
      },
      {
        type: DatasetDataIndexTypeEnum.imageEmbedding,
        text: 'https://img/b.png',
        dataId: ''
      }
    ]);
  });

  it('does not append markdown image indexes when model is text-only or imageIndex is disabled', () => {
    const trainingData = {
      q: 'chunk ![a](https://img/a.png)',
      collection: {
        imageIndex: true
      }
    } as any;

    expect(
      appendImageEmbeddingIndexes({
        indexes: [],
        trainingData,
        embModel: textEmbeddingModel,
        includeDataImageId: false
      })
    ).toEqual([]);

    expect(
      appendImageEmbeddingIndexes({
        indexes: [],
        trainingData: {
          ...trainingData,
          collection: {
            imageIndex: false
          }
        },
        embModel: imageEmbeddingModel,
        includeDataImageId: false
      })
    ).toEqual([]);
  });

  it('keeps image data imageId path available only when requested', () => {
    const trainingData = {
      q: '',
      data: {
        imageId: 'dataset/dataset-id/image.png'
      },
      collection: {
        imageIndex: true
      }
    } as any;

    expect(
      appendImageEmbeddingIndexes({
        indexes: [],
        trainingData,
        embModel: imageEmbeddingModel
      })
    ).toEqual([
      {
        type: DatasetDataIndexTypeEnum.imageEmbedding,
        text: 'dataset/dataset-id/image.png',
        dataId: ''
      }
    ]);

    expect(
      appendImageEmbeddingIndexes({
        indexes: [],
        trainingData,
        embModel: imageEmbeddingModel,
        includeDataImageId: false
      })
    ).toEqual([]);
  });

  it('keeps existing valid imageEmbedding indexes before appending missing ones', () => {
    const baseIndexes = getRebuildBaseIndexes({
      dataset: {
        vectorModel: imageEmbeddingModel,
        vlmModel: 'gpt-4.1'
      },
      collection: {
        name: 'collection',
        indexPrefixTitle: false,
        imageIndex: true
      },
      q: 'new text ![](https://img/a.png) ![](https://img/b.png)',
      data: {
        _id: 'data-id',
        q: 'old text ![](https://img/a.png)',
        indexes: []
      },
      indexes: [
        {
          type: DatasetDataIndexTypeEnum.default,
          text: 'text index',
          dataId: 'text-vector-id'
        },
        {
          type: DatasetDataIndexTypeEnum.imageEmbedding,
          text: 'https://img/a.png',
          dataId: 'image-vector-id'
        },
        {
          type: DatasetDataIndexTypeEnum.imageEmbedding,
          text: 'https://img/removed.png',
          dataId: 'removed-vector-id'
        }
      ]
    } as any);

    expect(baseIndexes).toEqual([
      {
        type: DatasetDataIndexTypeEnum.default,
        text: 'text index',
        dataId: 'text-vector-id'
      },
      {
        type: DatasetDataIndexTypeEnum.imageEmbedding,
        text: 'https://img/a.png',
        dataId: 'image-vector-id'
      }
    ]);

    const indexes = appendImageEmbeddingIndexes({
      indexes: baseIndexes,
      trainingData: {
        q: 'new text ![](https://img/a.png) ![](https://img/b.png)',
        collection: {
          imageIndex: true
        }
      } as any,
      embModel: imageEmbeddingModel,
      includeDataImageId: false
    });

    expect(indexes).toEqual([
      {
        type: DatasetDataIndexTypeEnum.default,
        text: 'text index',
        dataId: 'text-vector-id'
      },
      {
        type: DatasetDataIndexTypeEnum.imageEmbedding,
        text: 'https://img/a.png',
        dataId: 'image-vector-id'
      },
      {
        type: DatasetDataIndexTypeEnum.imageEmbedding,
        text: 'https://img/b.png',
        dataId: ''
      }
    ]);
  });
});

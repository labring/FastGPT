import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  formatDatasetDataValue,
  formatDatasetDataValues
} from '@fastgpt/service/core/dataset/data/controller';

const mockCreateS3DownloadAccessUrls = vi.hoisted(() =>
  vi.fn(async (params: Array<{ objectKey: string }>) =>
    params.map(({ objectKey }) => `https://files.test/${objectKey}`)
  )
);

vi.mock('@fastgpt/service/common/s3/accessLink', () => ({
  createS3DownloadAccessUrls: mockCreateS3DownloadAccessUrls
}));

describe('formatDatasetDataValue', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should append image descriptions to markdown image alt text in question and answer', async () => {
    const result = await formatDatasetDataValue(
      {
        q: 'Question ![cat]( https://example.com/cat.png ) and ![bird](https://example.com/bird.png)',
        a: 'Answer ![](https://example.com/dog.png)',
        imageDescMap: {
          'https://example.com/cat.png': 'cat desc\nline',
          'https://example.com/dog.png': 'dog desc'
        }
      },
      { datasetIds: ['test'], filter: () => true }
    );

    expect(result).toEqual({
      q: 'Question ![cat - cat descline]( https://example.com/cat.png ) and ![bird](https://example.com/bird.png)',
      a: 'Answer ![dog desc](https://example.com/dog.png)'
    });
  });

  it('should keep parenthetical image URLs when attaching descriptions', async () => {
    const result = await formatDatasetDataValue(
      {
        q: 'See ![img](https://cdn.example.com/img(1).png)',
        imageDescMap: {
          'https://cdn.example.com/img(1).png': 'cable photo'
        }
      },
      { datasetIds: ['test'], filter: () => true }
    );

    expect(result).toEqual({
      q: 'See ![img - cable photo](https://cdn.example.com/img(1).png)',
      a: undefined
    });
  });

  it('should preserve image destination delimiters and titles when attaching descriptions', async () => {
    const result = await formatDatasetDataValue(
      {
        q: String.raw`See ![img](<https://cdn.example.com/a\>.png> "caption")`,
        imageDescMap: {
          'https://cdn.example.com/a>.png': 'cable photo'
        }
      },
      { datasetIds: ['test'], filter: () => true }
    );

    expect(result).toEqual({
      q: String.raw`See ![img - cable photo](<https://cdn.example.com/a\>.png> "caption")`,
      a: undefined
    });
  });

  it('should batch duplicate keys across q, a and imageId', async () => {
    const result = await formatDatasetDataValues(
      [
        {
          q: 'Question ![shared](dataset/team/shared.png)',
          a: 'Answer [file](chat/app/file.pdf)'
        },
        {
          q: 'Image title',
          imageId: 'dataset/team/shared.png'
        }
      ],
      { datasetIds: ['test'], filter: () => true }
    );

    expect(mockCreateS3DownloadAccessUrls).toHaveBeenCalledTimes(1);
    expect(mockCreateS3DownloadAccessUrls.mock.calls[0][0].map((item) => item.objectKey)).toEqual([
      'dataset/team/shared.png',
      'chat/app/file.pdf'
    ]);
    expect(result).toEqual([
      {
        q: 'Question ![shared](https://files.test/dataset/team/shared.png)',
        a: 'Answer [file](https://files.test/chat/app/file.pdf)'
      },
      {
        q: '![Image title](https://files.test/dataset/team/shared.png)',
        a: undefined,
        imagePreivewUrl: 'https://files.test/dataset/team/shared.png'
      }
    ]);
  });

  it('should sign S3 keys inside HTML img tags in q and a', async () => {
    const result = await formatDatasetDataValues(
      [
        {
          q: '<p>before <img alt="cat" src="dataset/team/a.png"> after</p>',
          a: "<img src='chat/app/b.png' loading='lazy'>"
        }
      ],
      { datasetIds: ['test'], filter: () => true }
    );

    expect(mockCreateS3DownloadAccessUrls).toHaveBeenCalledTimes(1);
    expect(mockCreateS3DownloadAccessUrls.mock.calls[0][0].map((item) => item.objectKey)).toEqual([
      'dataset/team/a.png',
      'chat/app/b.png'
    ]);
    expect(result).toEqual([
      {
        q: '<p>before <img alt="cat" src="https://files.test/dataset/team/a.png"> after</p>',
        a: "<img src='https://files.test/chat/app/b.png' loading='lazy'>"
      }
    ]);
  });

  it('should only sign dataset keys matching options.datasetId and keep foreign keys as original text', async () => {
    const result = await formatDatasetDataValues(
      [
        {
          q: 'Own ![own](dataset/dataset-1/own.png) Foreign ![foreign](dataset/dataset-2/foreign.png)',
          a: 'Chat [chat](chat/app/chat.pdf)'
        },
        {
          q: 'Foreign image title',
          imageId: 'dataset/dataset-2/foreign-main.png'
        }
      ],
      { datasetIds: ['dataset-1'] }
    );

    expect(mockCreateS3DownloadAccessUrls).toHaveBeenCalledTimes(1);
    expect(mockCreateS3DownloadAccessUrls.mock.calls[0][0].map((item) => item.objectKey)).toEqual([
      'dataset/dataset-1/own.png'
    ]);
    // 知识库 data 只签发当前 dataset 的 key；外库 dataset key 和 chat key 保持原文，不签发短链。
    expect(result).toEqual([
      {
        q: 'Own ![own](https://files.test/dataset/dataset-1/own.png) Foreign ![foreign](dataset/dataset-2/foreign.png)',
        a: 'Chat [chat](chat/app/chat.pdf)'
      },
      {
        q: '![Foreign image title](dataset/dataset-2/foreign-main.png)',
        a: undefined,
        imagePreivewUrl: 'dataset/dataset-2/foreign-main.png'
      }
    ]);
  });
});

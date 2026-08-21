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
    const result = await formatDatasetDataValue({
      q: 'Question ![cat]( https://example.com/cat.png ) and ![bird](https://example.com/bird.png)',
      a: 'Answer ![](https://example.com/dog.png)',
      imageDescMap: {
        'https://example.com/cat.png': 'cat desc\nline',
        'https://example.com/dog.png': 'dog desc'
      }
    });

    expect(result).toEqual({
      q: 'Question ![cat - cat descline](https://example.com/cat.png) and ![bird](https://example.com/bird.png)',
      a: 'Answer ![dog desc](https://example.com/dog.png)'
    });
  });

  it('should batch duplicate keys across q, a and imageId', async () => {
    const result = await formatDatasetDataValues([
      {
        q: 'Question ![shared](dataset/team/shared.png)',
        a: 'Answer [file](chat/app/file.pdf)'
      },
      {
        q: 'Image title',
        imageId: 'dataset/team/shared.png'
      }
    ]);

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
});

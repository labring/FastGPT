import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockPost } = vi.hoisted(() => ({
  mockPost: vi.fn()
}));

vi.mock('../../common/api/axios', () => ({ axiosWithoutSSRF: { post: mockPost } }));

import { chunkByIultmzh } from '@fastgpt/service/thirdProvider/sangfor/chunk';
import { DatasetErrEnum } from '@fastgpt/global/common/error/code/dataset';

const url = 'http://chunk-service.example/v1/chunk';
const chunkSize = 512;
const timeoutMs = 60 * 60 * 1000;

describe('chunkByIultmzh', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPost.mockResolvedValue({
      data: {
        chunks: [
          { index: 0, text: 'chunk one' },
          { index: 1, text: 'chunk two' }
        ],
        count: 2
      }
    });
  });

  it('posts markdown and maps returned chunk texts into dataset chunks', async () => {
    const imageIdList = ['img-1'];
    const result = await chunkByIultmzh({
      text: '## title\ncontent',
      imageIdList,
      url,
      chunkSize,
      timeoutMs
    });

    expect(result).toEqual([
      { q: 'chunk one', a: '', indexes: [], imageIdList },
      { q: 'chunk two', a: '', indexes: [], imageIdList }
    ]);
    expect(mockPost).toHaveBeenCalledWith(
      url,
      { markdown: '## title\ncontent', chunk_sizes: { text: chunkSize } },
      expect.objectContaining({ headers: undefined, timeout: timeoutMs })
    );
  });

  it('rejects with externalChunkNotConfigured when no url is configured', async () => {
    await expect(chunkByIultmzh({ text: 'content', chunkSize, timeoutMs })).rejects.toBe(
      DatasetErrEnum.externalChunkNotConfigured
    );
    expect(mockPost).not.toHaveBeenCalled();
  });

  it('checks the url before the blank-text short circuit', async () => {
    await expect(chunkByIultmzh({ text: '   ', chunkSize, timeoutMs })).rejects.toBe(
      DatasetErrEnum.externalChunkNotConfigured
    );
    expect(mockPost).not.toHaveBeenCalled();
  });

  it('returns empty without calling the service for blank text', async () => {
    await expect(chunkByIultmzh({ text: '   ', url, chunkSize, timeoutMs })).resolves.toEqual([]);
    expect(mockPost).not.toHaveBeenCalled();
  });

  it('adds Bearer authorization header only when a key is provided', async () => {
    await chunkByIultmzh({
      text: 'content',
      url,
      key: 'secret',
      chunkSize,
      timeoutMs
    });

    expect(mockPost).toHaveBeenCalledWith(
      url,
      expect.anything(),
      expect.objectContaining({ headers: { Authorization: 'Bearer secret' } })
    );
  });

  it('rejects with the error code when a chunk item is not a non-empty text', async () => {
    mockPost.mockResolvedValue({ data: { chunks: [{ text: '' }] } });
    await expect(chunkByIultmzh({ text: 'content', url, chunkSize, timeoutMs })).rejects.toBe(
      DatasetErrEnum.externalChunkInvalidResponse
    );
  });

  it('rejects with the error code when the response has no chunks array', async () => {
    mockPost.mockResolvedValue({ data: { count: 3 } });
    await expect(chunkByIultmzh({ text: 'content', url, chunkSize, timeoutMs })).rejects.toBe(
      DatasetErrEnum.externalChunkInvalidResponse
    );
  });

  it('rejects with the error code when the service returns no chunks', async () => {
    mockPost.mockResolvedValue({ data: { chunks: [], count: 0 } });
    await expect(chunkByIultmzh({ text: 'content', url, chunkSize, timeoutMs })).rejects.toBe(
      DatasetErrEnum.externalChunkInvalidResponse
    );
  });

  it('wraps network/timeout failures with the external chunk failed error code', async () => {
    mockPost.mockRejectedValue({ message: 'ECONNREFUSED' });
    await expect(chunkByIultmzh({ text: 'content', url, chunkSize, timeoutMs })).rejects.toBe(
      DatasetErrEnum.externalChunkFailed
    );
  });
});

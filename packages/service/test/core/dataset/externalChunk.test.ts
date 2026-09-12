import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockPost } = vi.hoisted(() => ({
  mockPost: vi.fn()
}));

vi.mock('../../../common/api/axios', () => ({ axiosWithoutSSRF: { post: mockPost } }));

import { splitByExternalChunkService } from '@fastgpt/service/core/dataset/externalChunk';

const url = 'http://chunk-service.example/v1/chunk';
const chunkSize = 512;
const timeoutMs = 60 * 60 * 1000;

describe('splitByExternalChunkService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPost.mockResolvedValue({
      data: { chunks: [{ index: 0, text: 'chunk one' }, { index: 1, text: 'chunk two' }], count: 2 }
    });
  });

  it('posts markdown and maps returned chunk texts', async () => {
    const result = await splitByExternalChunkService({ text: '## title\ncontent', url, chunkSize, timeoutMs });

    expect(result).toEqual(['chunk one', 'chunk two']);
    expect(mockPost).toHaveBeenCalledWith(
      url,
      { markdown: '## title\ncontent', chunk_sizes: { text: chunkSize } },
      expect.objectContaining({ headers: undefined, timeout: timeoutMs })
    );
  });

  it('returns empty without calling the service for blank text', async () => {
    await expect(splitByExternalChunkService({ text: '   ', url, chunkSize, timeoutMs })).resolves.toEqual([]);
    expect(mockPost).not.toHaveBeenCalled();
  });

  it('adds Bearer authorization header only when a key is provided', async () => {
    await splitByExternalChunkService({ text: 'content', url, key: 'secret', chunkSize, timeoutMs });

    expect(mockPost).toHaveBeenCalledWith(
      url,
      expect.anything(),
      expect.objectContaining({ headers: { Authorization: 'Bearer secret' } })
    );
  });

  it('rejects with a clear message when the response shape is not a valid chunk list', async () => {
    mockPost.mockResolvedValue({ data: { chunks: [{ text: '' }] } });
    await expect(splitByExternalChunkService({ text: 'content', url, chunkSize, timeoutMs })).rejects.toThrow(
      '智能分块服务返回格式异常'
    );
  });

  it('rejects with a clear message when the service returns no chunks', async () => {
    mockPost.mockResolvedValue({ data: { chunks: [], count: 0 } });
    await expect(splitByExternalChunkService({ text: 'content', url, chunkSize, timeoutMs })).rejects.toThrow(
      '智能分块服务未返回有效分块'
    );
  });

  it('wraps network/timeout failures with 智能分块服务调用失败', async () => {
    mockPost.mockRejectedValue({ message: 'ECONNREFUSED' });
    await expect(splitByExternalChunkService({ text: 'content', url, chunkSize, timeoutMs })).rejects.toThrow(
      '智能分块服务调用失败'
    );
  });
});

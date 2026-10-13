import { Readable } from 'node:stream';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockAxiosGet } = vi.hoisted(() => ({
  mockAxiosGet: vi.fn()
}));

vi.mock('@fastgpt/service/common/api/axios', () => ({
  axios: { get: mockAxiosGet }
}));

const { readExternalFileBuffer } = await import('@fastgpt/service/common/file/read/external');

describe('common/file/read/external', () => {
  beforeEach(() => {
    mockAxiosGet.mockReset();
  });

  it.each(['file:///tmp/a.txt', '/relative.txt', 'ftp://example.com/a.txt'])(
    '拒绝非绝对 HTTP(S) URL: %s',
    async (url) => {
      await expect(readExternalFileBuffer({ url, maxSizeBytes: 100 })).rejects.toThrow(
        'absolute HTTP(S) URL'
      );
      expect(mockAxiosGet).not.toHaveBeenCalled();
    }
  );

  it('Content-Length 超业务上限时在读取流前拒绝', async () => {
    const stream = Readable.from([Buffer.from('small')]);
    mockAxiosGet.mockResolvedValue({
      data: stream,
      headers: { 'content-length': '101' }
    });

    await expect(
      readExternalFileBuffer({ url: 'https://example.com/a.txt', maxSizeBytes: 100 })
    ).rejects.toThrow('maximum allowed size (100 bytes)');
    expect(stream.destroyed).toBe(true);
  });

  it('无 Content-Length 时按实际 chunk 检查大小并同步上报累计字节', async () => {
    const stream = Readable.from([Buffer.from('123'), Buffer.from('4567')]);
    mockAxiosGet.mockResolvedValue({
      data: stream,
      headers: {
        'content-type': 'text/plain',
        'content-disposition': 'attachment; filename="a.txt"'
      }
    });
    const onReadBytes = vi.fn();

    await expect(
      readExternalFileBuffer({
        url: 'https://example.com/a.txt',
        maxSizeBytes: 7,
        onReadBytes
      })
    ).resolves.toEqual({
      buffer: Buffer.from('1234567'),
      contentType: 'text/plain',
      contentDisposition: 'attachment; filename="a.txt"'
    });
    expect(onReadBytes.mock.calls.map(([bytes]) => bytes)).toEqual([3, 7]);
  });

  it('实际流超过业务上限时销毁响应流且不保存超限 chunk', async () => {
    const stream = Readable.from([Buffer.from('123'), Buffer.from('45678')]);
    mockAxiosGet.mockResolvedValue({ data: stream, headers: {} });
    const onReadBytes = vi.fn();

    await expect(
      readExternalFileBuffer({
        url: 'https://example.com/a.txt',
        maxSizeBytes: 7,
        onReadBytes
      })
    ).rejects.toThrow('maximum allowed size (7 bytes)');
    expect(onReadBytes).toHaveBeenCalledTimes(1);
    expect(stream.destroyed).toBe(true);
  });

  it('资源回调抛错时立即销毁流并原样抛出', async () => {
    const stream = Readable.from([Buffer.from('123')]);
    const resourceError = new Error('hard resource limit');
    mockAxiosGet.mockResolvedValue({ data: stream, headers: {} });

    await expect(
      readExternalFileBuffer({
        url: 'https://example.com/a.txt',
        maxSizeBytes: 100,
        onReadBytes: () => {
          throw resourceError;
        }
      })
    ).rejects.toBe(resourceError);
    expect(stream.destroyed).toBe(true);
  });

  it('透传 timeout、maxContentLength 和 AbortSignal', async () => {
    mockAxiosGet.mockResolvedValue({ data: Readable.from([Buffer.from('ok')]), headers: {} });
    const controller = new AbortController();

    await readExternalFileBuffer({
      url: 'https://example.com/a.txt',
      maxSizeBytes: 10,
      timeoutMs: 999,
      signal: controller.signal
    });

    expect(mockAxiosGet).toHaveBeenCalledWith('https://example.com/a.txt', {
      responseType: 'stream',
      timeout: 999,
      maxContentLength: 10,
      signal: controller.signal
    });
  });
});

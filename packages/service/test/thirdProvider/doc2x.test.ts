import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { requestMock, axiosPutMock, getImageBufferMock } = vi.hoisted(() => ({
  requestMock: vi.fn(),
  axiosPutMock: vi.fn(),
  getImageBufferMock: vi.fn()
}));

vi.mock('@fastgpt/service/common/api/axios', () => ({
  axios: {
    put: axiosPutMock
  },
  createProxyAxios: vi.fn(() => ({
    request: requestMock
  }))
}));

vi.mock('@fastgpt/service/common/file/image/utils', () => ({
  getImageBuffer: getImageBufferMock
}));

const { useDoc2xServer } = await import('@fastgpt/service/thirdProvider/doc2x');

const mockDoc2xSuccess = (md: string) => {
  requestMock
    .mockResolvedValueOnce({
      data: {
        code: 'ok',
        data: {
          uid: 'uid-1',
          url: 'https://upload.example.com/file'
        }
      }
    })
    .mockResolvedValueOnce({
      data: {
        code: 'ok',
        data: {
          status: 'success',
          result: {
            pages: [
              {
                md
              }
            ]
          }
        }
      }
    });
};

describe('useDoc2xServer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    axiosPutMock.mockResolvedValue({
      status: 200,
      statusText: 'OK'
    });
    mockDoc2xSuccess('hello ![](https://img.example.com/a.png)');
    getImageBufferMock.mockResolvedValue({
      buffer: Buffer.from('image-bytes'),
      mime: 'image/png'
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('转存 Doc2x 图片 URL 到 S3 key，不再返回 imageList', async () => {
    const uploadImage = vi.fn().mockResolvedValue({ key: 'dataset/ds1/file-parsed/image.png' });

    const resultPromise = useDoc2xServer({ apiKey: 'api-key' }).parsePDF(Buffer.from('pdf'), {
      uploadImage
    });
    await vi.runAllTimersAsync();
    const result = await resultPromise;

    expect(getImageBufferMock).toHaveBeenCalledWith('https://img.example.com/a.png');
    expect(uploadImage).toHaveBeenCalledWith({
      type: 'http',
      url: 'https://img.example.com/a.png',
      mime: 'image/png',
      buffer: Buffer.from('image-bytes')
    });
    expect(result).toEqual({
      pages: 1,
      text: 'hello ![](dataset/ds1/file-parsed/image.png)'
    });
  });

  it('按匹配顺序逐张转存 Doc2x 图片，不预先收集 imageList', async () => {
    requestMock.mockReset();
    mockDoc2xSuccess('a ![](https://img.example.com/a.png) b ![](https://img.example.com/b.png)');
    const uploadImage = vi
      .fn()
      .mockResolvedValueOnce({ key: 'dataset/ds1/file-parsed/a.png' })
      .mockResolvedValueOnce({ key: 'dataset/ds1/file-parsed/b.png' });

    const resultPromise = useDoc2xServer({ apiKey: 'api-key' }).parsePDF(Buffer.from('pdf'), {
      uploadImage
    });
    await vi.runAllTimersAsync();
    const result = await resultPromise;

    expect(getImageBufferMock).toHaveBeenNthCalledWith(1, 'https://img.example.com/a.png');
    expect(getImageBufferMock).toHaveBeenNthCalledWith(2, 'https://img.example.com/b.png');
    expect(uploadImage).toHaveBeenCalledTimes(2);
    expect(result.text).toBe(
      'a ![](dataset/ds1/file-parsed/a.png) b ![](dataset/ds1/file-parsed/b.png)'
    );
  });

  it('兜底处理 Doc2x markdown base64 图片并替换成上传返回 key', async () => {
    requestMock.mockReset();
    mockDoc2xSuccess('hello ![img](data:image/png;base64,iVBORw0KGgo=)');
    const uploadImage = vi.fn().mockResolvedValue({ key: 'dataset/ds1/file-parsed/base64.png' });

    const resultPromise = useDoc2xServer({ apiKey: 'api-key' }).parsePDF(Buffer.from('pdf'), {
      uploadImage
    });
    await vi.runAllTimersAsync();
    const result = await resultPromise;

    expect(getImageBufferMock).not.toHaveBeenCalled();
    expect(uploadImage).toHaveBeenCalledWith({
      type: 'base64',
      mime: 'image/png',
      base64: 'iVBORw0KGgo=',
      dataUrl: 'data:image/png;base64,iVBORw0KGgo='
    });
    expect(result.text).toBe('hello ![img](dataset/ds1/file-parsed/base64.png)');
  });

  it('未传 uploadImage 时删除 Doc2x markdown base64 图片', async () => {
    requestMock.mockReset();
    mockDoc2xSuccess('hello ![img](data:image/png;base64,iVBORw0KGgo=)');

    const resultPromise = useDoc2xServer({ apiKey: 'api-key' }).parsePDF(Buffer.from('pdf'));
    await vi.runAllTimersAsync();
    const result = await resultPromise;

    expect(getImageBufferMock).not.toHaveBeenCalled();
    expect(result.text).toBe('hello');
  });

  it('未传 uploadImage 时保留 Doc2x 图片 URL 且不下载图片', async () => {
    const resultPromise = useDoc2xServer({ apiKey: 'api-key' }).parsePDF(Buffer.from('pdf'));
    await vi.runAllTimersAsync();
    const result = await resultPromise;

    expect(getImageBufferMock).not.toHaveBeenCalled();
    expect(result.text).toBe('hello ![](https://img.example.com/a.png)');
  });
});

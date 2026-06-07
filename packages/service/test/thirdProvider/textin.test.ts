import { beforeEach, describe, expect, it, vi } from 'vitest';

const { postMock, getImageBufferMock } = vi.hoisted(() => ({
  postMock: vi.fn(),
  getImageBufferMock: vi.fn()
}));

vi.mock('@fastgpt/service/common/api/axios', () => ({
  createProxyAxios: vi.fn(() => ({
    post: postMock
  }))
}));

vi.mock('@fastgpt/service/common/file/image/utils', () => ({
  getImageBuffer: getImageBufferMock
}));

const { useTextinServer } = await import('@fastgpt/service/thirdProvider/textin');

const mockTextinSuccess = (markdown: string) => {
  postMock.mockResolvedValueOnce({
    data: {
      code: 200,
      result: {
        markdown,
        total_page_number: 1
      }
    }
  });
};

describe('useTextinServer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getImageBufferMock.mockResolvedValue({
      buffer: Buffer.from('image-bytes'),
      mime: 'image/png'
    });
  });

  it('解析 Textin markdown base64 图片并替换成上传返回 key', async () => {
    const markdown = 'hello ![img](data:image/png;base64,iVBORw0KGgo=)';
    mockTextinSuccess(markdown);
    const uploadImage = vi.fn().mockResolvedValue({ key: 'dataset/ds1/file-parsed/image.png' });

    const result = await useTextinServer({
      appId: 'app-id',
      secretCode: 'secret-code'
    }).parsePDF(Buffer.from('pdf'), {
      uploadImage
    });

    expect(postMock).toHaveBeenCalledWith(
      '/pdf_to_markdown',
      expect.any(Buffer),
      expect.objectContaining({
        params: expect.objectContaining({
          get_image: 'objects',
          image_output_type: 'default'
        })
      })
    );
    expect(uploadImage).toHaveBeenCalledWith({
      type: 'base64',
      mime: 'image/png',
      base64: 'iVBORw0KGgo=',
      dataUrl: 'data:image/png;base64,iVBORw0KGgo='
    });
    expect(result).toEqual({
      pages: 1,
      text: 'hello ![img](dataset/ds1/file-parsed/image.png)'
    });
  });

  it('解析 Textin markdown http 图片并替换成上传返回 key', async () => {
    mockTextinSuccess('hello ![img](https://textin.example.com/image.png)');
    const uploadImage = vi.fn().mockResolvedValue({ key: 'dataset/ds1/file-parsed/http.png' });

    const result = await useTextinServer({
      appId: 'app-id',
      secretCode: 'secret-code'
    }).parsePDF(Buffer.from('pdf'), {
      uploadImage
    });

    expect(getImageBufferMock).toHaveBeenCalledWith('https://textin.example.com/image.png');
    expect(uploadImage).toHaveBeenCalledWith({
      type: 'http',
      url: 'https://textin.example.com/image.png',
      mime: 'image/png',
      buffer: Buffer.from('image-bytes')
    });
    expect(result).toEqual({
      pages: 1,
      text: 'hello ![img](dataset/ds1/file-parsed/http.png)'
    });
  });

  it('未传 uploadImage 时删除 Textin markdown base64 图片', async () => {
    mockTextinSuccess('hello ![img](data:image/png;base64,iVBORw0KGgo=)');

    const result = await useTextinServer({
      appId: 'app-id',
      secretCode: 'secret-code'
    }).parsePDF(Buffer.from('pdf'));

    expect(result).toEqual({
      pages: 1,
      text: 'hello'
    });
  });

  it('未传 uploadImage 时保留 Textin markdown http 图片且不下载', async () => {
    mockTextinSuccess('hello ![img](https://textin.example.com/image.png)');

    const result = await useTextinServer({
      appId: 'app-id',
      secretCode: 'secret-code'
    }).parsePDF(Buffer.from('pdf'));

    expect(getImageBufferMock).not.toHaveBeenCalled();
    expect(result).toEqual({
      pages: 1,
      text: 'hello ![img](https://textin.example.com/image.png)'
    });
  });
});

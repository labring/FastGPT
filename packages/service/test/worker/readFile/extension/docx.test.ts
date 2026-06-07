import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockConvertToHtml } = vi.hoisted(() => ({
  mockConvertToHtml: vi.fn()
}));

vi.mock('mammoth', () => ({
  default: {
    convertToHtml: mockConvertToHtml
  },
  images: {
    imgElement: (handler: any) => handler
  }
}));

const { readDocsFile } = await import('@fastgpt/service/worker/readFile/extension/docx');

const createImage = () => ({
  contentType: 'image/png',
  read: vi.fn(async () => Buffer.from([1, 2, 3]))
});

describe('readDocsFile', () => {
  beforeEach(() => {
    mockConvertToHtml.mockReset();
  });

  it('docx 图片通过 uploadFile 回调上传，并把返回 key 写入 markdown', async () => {
    const image = createImage();
    mockConvertToHtml.mockImplementation(async (_input, options) => {
      const { src } = await options.convertImage(image);
      return {
        value: `<p>hello</p><img src="${src}" />`
      };
    });
    const uploadFile = vi.fn(async () => ({
      key: 'dataset/file-parsed/image.png'
    }));

    const result = await readDocsFile(
      {
        buffer: Buffer.from('docx'),
        encoding: 'utf-8',
        extension: 'docx'
      },
      { uploadFile }
    );

    expect(uploadFile).toHaveBeenCalledWith({
      name: expect.stringMatching(/\.png$/),
      mime: 'image/png',
      buffer: new Uint8Array([1, 2, 3]).buffer
    });
    expect(result.rawText).toContain('dataset/file-parsed/image.png');
    expect(result).not.toHaveProperty('imageList');
  });

  it('docx 包含图片但没有 uploadFile 时在 worker 内报错', async () => {
    const image = createImage();
    mockConvertToHtml.mockImplementation(async (_input, options) => {
      await options.convertImage(image);
      return {
        value: '<p>never</p>'
      };
    });

    await expect(
      readDocsFile({
        buffer: Buffer.from('docx'),
        encoding: 'utf-8',
        extension: 'docx'
      })
    ).rejects.toBe('Can not read doc file, please convert to PDF');
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { anydocTestExtensions } from '../anydocFixtures';

const { mockFormatFromExtension, mockToMarkdownBytes } = vi.hoisted(() => ({
  mockFormatFromExtension: vi.fn(),
  mockToMarkdownBytes: vi.fn()
}));

vi.mock('@fastgpt-sdk/anydoc', () => ({
  formatFromExtension: mockFormatFromExtension,
  toMarkdownBytes: mockToMarkdownBytes
}));

const { isAnydocDocumentExtension, readAnydocRawText } =
  await import('@fastgpt/service/worker/readFile/extension/anydoc');

describe('readAnydocRawText', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each(anydocTestExtensions)('识别 anydoc 补充扩展名 %s', (extension) => {
    expect(isAnydocDocumentExtension(extension)).toBe(true);
    expect(isAnydocDocumentExtension(`.${extension.toUpperCase()}`)).toBe(true);
  });

  it.each(['txt', 'md', 'html', 'pdf', 'docx', 'pptx', 'xlsx', 'csv', 'zip'])(
    '不接管原有或未知扩展名 %s',
    (extension) => {
      expect(isAnydocDocumentExtension(extension)).toBe(false);
    }
  );

  it('使用 anydoc 归一化后的格式把 Buffer 转为 Markdown', async () => {
    const buffer = Buffer.from([0xd0, 0xcf, 0x11, 0xe0]);
    mockFormatFromExtension.mockReturnValue('xlsx');
    mockToMarkdownBytes.mockResolvedValue({
      markdown: '# Sheet\n\n| name | value |',
      assets: []
    });

    await expect(
      readAnydocRawText({ buffer, extension: 'xls', encoding: 'utf-8' })
    ).resolves.toEqual({ rawText: '# Sheet\n\n| name | value |' });
    expect(mockFormatFromExtension).toHaveBeenCalledWith('xls');
    expect(mockToMarkdownBytes).toHaveBeenCalledWith(buffer, 'xlsx', {
      embeddedImageMode: 'reference',
      maxImageBytes: 10 * 1024 * 1024,
      maxImageTotalBytes: 200 * 1024 * 1024
    });
  });

  it('将 .wps 映射到现有 DOC 解析器', async () => {
    const buffer = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
    mockFormatFromExtension.mockReturnValue('doc');
    mockToMarkdownBytes.mockResolvedValue({ markdown: 'WPS fixture', assets: [] });

    await expect(
      readAnydocRawText({ buffer, extension: '.WPS', encoding: 'utf-8' })
    ).resolves.toEqual({ rawText: 'WPS fixture' });
    expect(mockFormatFromExtension).toHaveBeenCalledWith('doc');
    expect(mockToMarkdownBytes).toHaveBeenCalledWith(buffer, 'doc', expect.any(Object));
  });

  it('兼容 WPS 桌面端以 .wps 文件名保存的 OOXML 文档', async () => {
    const buffer = Buffer.concat([
      Buffer.from([0x50, 0x4b, 0x03, 0x04]),
      Buffer.from('word/document.xml')
    ]);
    mockFormatFromExtension.mockReturnValue('docx');
    mockToMarkdownBytes.mockResolvedValue({ markdown: 'WPS OOXML fixture', assets: [] });

    await expect(
      readAnydocRawText({ buffer, extension: 'wps', encoding: 'utf-8' })
    ).resolves.toEqual({ rawText: 'WPS OOXML fixture' });
    expect(mockFormatFromExtension).toHaveBeenCalledWith('docx');
    expect(mockToMarkdownBytes).toHaveBeenCalledWith(buffer, 'docx', expect.any(Object));
  });

  it('并发上传最多 5 张图片，并按 asset id 替换 Markdown 引用', async () => {
    const assets = Array.from({ length: 7 }, (_, index) => ({
      id: index + 1,
      mediaType: 'image/png',
      originPart: `word/media/image-${index + 1}.png`,
      data: Buffer.alloc(index + 1, index)
    }));
    mockFormatFromExtension.mockReturnValue('doc');
    mockToMarkdownBytes.mockResolvedValue({
      markdown: assets.map(({ id }) => `![image ${id}](asset:${id})`).join('\n'),
      assets
    });

    let activeUploads = 0;
    let maximumActiveUploads = 0;
    const uploadFile = vi.fn(async ({ name }: { name: string }) => {
      activeUploads += 1;
      maximumActiveUploads = Math.max(maximumActiveUploads, activeUploads);
      await new Promise((resolve) => setTimeout(resolve, 5));
      activeUploads -= 1;
      return { key: `dataset/images/${name}` };
    });

    const result = await readAnydocRawText(
      { buffer: Buffer.alloc(1024), extension: 'doc', encoding: 'utf-8' },
      { uploadFile }
    );

    expect(uploadFile).toHaveBeenCalledTimes(7);
    expect(maximumActiveUploads).toBe(5);
    expect(result.rawText).not.toContain('asset:');
    expect(result.rawText).toContain('dataset/images/image-1.png');
    expect(result.rawText).toContain('dataset/images/image-7.png');
  });

  it('按完整 id 替换引用，不会把 asset:1 错替换进 asset:10', async () => {
    mockFormatFromExtension.mockReturnValue('doc');
    mockToMarkdownBytes.mockResolvedValue({
      markdown: '![one](asset:1) ![ten](asset:10)',
      assets: [
        {
          id: 1,
          mediaType: 'image/png',
          originPart: 'one.png',
          data: Buffer.from([1])
        },
        {
          id: 10,
          mediaType: 'image/jpeg',
          originPart: 'ten.jpg',
          data: Buffer.from([10])
        }
      ]
    });
    const uploadFile = vi
      .fn()
      .mockResolvedValueOnce({ key: 'images/one.png' })
      .mockResolvedValueOnce({ key: 'images/ten.jpg' });

    await expect(
      readAnydocRawText(
        { buffer: Buffer.alloc(1), extension: 'doc', encoding: 'utf-8' },
        { uploadFile }
      )
    ).resolves.toEqual({ rawText: '![one](images/one.png) ![ten](images/ten.jpg)' });
  });

  it('文档含图片但没有上传能力时拒绝返回临时 asset 引用', async () => {
    mockFormatFromExtension.mockReturnValue('doc');
    mockToMarkdownBytes.mockResolvedValue({
      markdown: '![image](asset:0)',
      assets: [
        {
          id: 0,
          mediaType: 'image/png',
          originPart: 'image.png',
          data: Buffer.from([1])
        }
      ]
    });

    await expect(
      readAnydocRawText({ buffer: Buffer.alloc(1), extension: 'doc', encoding: 'utf-8' })
    ).rejects.toThrow('Missing imageKeyOptions.prefix');
  });

  it('拒绝 SDK 返回没有对应二进制的临时 asset 引用', async () => {
    mockFormatFromExtension.mockReturnValue('doc');
    mockToMarkdownBytes.mockResolvedValue({
      markdown: '![missing](asset:99)',
      assets: []
    });

    await expect(
      readAnydocRawText({ buffer: Buffer.alloc(1), extension: 'doc', encoding: 'utf-8' })
    ).rejects.toThrow('without its asset');
  });

  it('透传图片上传错误', async () => {
    const uploadError = new Error('s3 unavailable');
    mockFormatFromExtension.mockReturnValue('doc');
    mockToMarkdownBytes.mockResolvedValue({
      markdown: '![image](asset:0)',
      assets: [
        {
          id: 0,
          mediaType: 'image/png',
          originPart: 'image.png',
          data: Buffer.from([1])
        }
      ]
    });

    await expect(
      readAnydocRawText(
        { buffer: Buffer.alloc(1), extension: 'doc', encoding: 'utf-8' },
        { uploadFile: vi.fn().mockRejectedValue(uploadError) }
      )
    ).rejects.toBe(uploadError);
  });

  it('拒绝不在 FastGPT 补充白名单中的格式', async () => {
    mockFormatFromExtension.mockReturnValue('docx');
    await expect(
      readAnydocRawText({ buffer: Buffer.alloc(0), extension: 'docx', encoding: 'utf-8' })
    ).rejects.toThrow('Unsupported anydoc file extension: .docx');
    expect(mockToMarkdownBytes).not.toHaveBeenCalled();
  });

  it('透传 anydoc 的解析错误', async () => {
    const error = Object.assign(new Error('encrypted document'), { code: 'encrypted' });
    mockFormatFromExtension.mockReturnValue('doc');
    mockToMarkdownBytes.mockRejectedValue(error);
    await expect(
      readAnydocRawText({ buffer: Buffer.alloc(0), extension: 'doc', encoding: 'utf-8' })
    ).rejects.toBe(error);
  });
});

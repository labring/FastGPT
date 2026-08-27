import { beforeEach, describe, expect, it, vi } from 'vitest';
import { anydocTestExtensions } from '../anydocFixtures';

const { mockFormatFromExtension, mockToMarkdownBytes } = vi.hoisted(() => ({
  mockFormatFromExtension: vi.fn(),
  mockToMarkdownBytes: vi.fn()
}));

vi.mock('@firecrawl/anydoc', () => ({
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
    mockToMarkdownBytes.mockResolvedValue('# Sheet\n\n| name | value |');

    await expect(
      readAnydocRawText({ buffer, extension: 'xls', encoding: 'utf-8' })
    ).resolves.toEqual({ rawText: '# Sheet\n\n| name | value |' });
    expect(mockFormatFromExtension).toHaveBeenCalledWith('xls');
    expect(mockToMarkdownBytes).toHaveBeenCalledWith(buffer, 'xlsx');
  });

  it('将 .wps 映射到现有 DOC 解析器', async () => {
    const buffer = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
    mockFormatFromExtension.mockReturnValue('doc');
    mockToMarkdownBytes.mockResolvedValue('WPS fixture');

    await expect(
      readAnydocRawText({ buffer, extension: '.WPS', encoding: 'utf-8' })
    ).resolves.toEqual({ rawText: 'WPS fixture' });
    expect(mockFormatFromExtension).toHaveBeenCalledWith('doc');
    expect(mockToMarkdownBytes).toHaveBeenCalledWith(buffer, 'doc');
  });

  it('兼容 WPS 桌面端以 .wps 文件名保存的 OOXML 文档', async () => {
    const buffer = Buffer.concat([
      Buffer.from([0x50, 0x4b, 0x03, 0x04]),
      Buffer.from('word/document.xml')
    ]);
    mockFormatFromExtension.mockReturnValue('docx');
    mockToMarkdownBytes.mockResolvedValue('WPS OOXML fixture');

    await expect(
      readAnydocRawText({ buffer, extension: 'wps', encoding: 'utf-8' })
    ).resolves.toEqual({ rawText: 'WPS OOXML fixture' });
    expect(mockFormatFromExtension).toHaveBeenCalledWith('docx');
    expect(mockToMarkdownBytes).toHaveBeenCalledWith(buffer, 'docx');
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

import { beforeEach, describe, expect, it, vi } from 'vitest';

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

  it.each(['doc', '.DOCM', 'xls', 'PPT', 'odt', 'ods', 'odp', 'rtf', 'epub'])(
    '识别 anydoc 补充扩展名 %s',
    (extension) => {
      expect(isAnydocDocumentExtension(extension)).toBe(true);
    }
  );

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

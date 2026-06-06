import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockLiteParseParse, mockLiteParseConstructor } = vi.hoisted(() => ({
  mockLiteParseParse: vi.fn(),
  mockLiteParseConstructor: vi.fn()
}));

vi.mock('@llamaindex/liteparse', () => ({
  LiteParse: vi.fn(function MockLiteParse(config) {
    mockLiteParseConstructor(config);
    return {
      parse: mockLiteParseParse
    };
  })
}));

import { readPdfFile } from '@fastgpt/service/worker/readFile/extension/pdf';

describe('readPdfFile', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('分批使用 LiteParse，并对全部 textItems 做统一后处理', async () => {
    mockLiteParseParse
      .mockResolvedValueOnce({
        text: 'fallback text 1',
        pages: [
          {
            pageNum: 1,
            width: 1000,
            height: 1000,
            text: '',
            textItems: [
              {
                text: '人工智能正在快速发展并进入规模化落地阶段',
                x: 80,
                y: 100,
                width: 240,
                height: 12
              }
            ]
          }
        ]
      })
      .mockResolvedValueOnce({
        text: 'fallback text 2',
        pages: [
          {
            pageNum: 101,
            width: 1000,
            height: 1000,
            text: '',
            textItems: [{ text: '并推动产业升级。', x: 80, y: 120, width: 96, height: 12 }]
          }
        ]
      })
      .mockResolvedValueOnce({
        text: '',
        pages: []
      });

    const result = await readPdfFile({
      extension: 'pdf',
      encoding: 'utf-8',
      buffer: Buffer.from('pdf')
    });

    expect(result.rawText).toBe('人工智能正在快速发展并进入规模化落地阶段并推动产业升级。\n');
    expect(mockLiteParseParse).toHaveBeenCalledTimes(3);
    expect(mockLiteParseConstructor.mock.calls.map(([config]) => config.targetPages)).toEqual([
      '1-100',
      '101-200',
      '201-300'
    ]);
  });

  it('LiteParse 失败时直接抛出错误', async () => {
    const error = new Error('native load failed');
    mockLiteParseParse.mockRejectedValue(error);

    await expect(
      readPdfFile({
        extension: 'pdf',
        encoding: 'utf-8',
        buffer: Buffer.from('pdf')
      })
    ).rejects.toThrow(error);
  });
});

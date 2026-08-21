import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockLiteParseInit, mockLiteParseParse, mockLiteParseFree, mockLiteParseConstructor } =
  vi.hoisted(() => ({
    mockLiteParseInit: vi.fn(),
    mockLiteParseParse: vi.fn(),
    mockLiteParseFree: vi.fn(),
    mockLiteParseConstructor: vi.fn()
  }));

vi.mock('@llamaindex/liteparse-wasm', () => ({
  default: mockLiteParseInit,
  LiteParse: vi.fn(function MockLiteParse(config) {
    mockLiteParseConstructor(config);
    return {
      parse: mockLiteParseParse,
      free: mockLiteParseFree
    };
  })
}));

import { readPdfByLiteParse } from '@fastgpt/service/worker/readFile/utils/LiteParse';

describe('readPdfByLiteParse', () => {
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

    const result = await readPdfByLiteParse({
      extension: 'pdf',
      encoding: 'utf-8',
      buffer: Buffer.from('pdf')
    });

    expect(result.rawText).toBe('人工智能正在快速发展并进入规模化落地阶段并推动产业升级。\n');
    expect(mockLiteParseParse).toHaveBeenCalledTimes(3);
    expect(mockLiteParseInit).toHaveBeenCalledTimes(1);
    expect(mockLiteParseFree).toHaveBeenCalledTimes(3);
    expect(mockLiteParseConstructor.mock.calls.map(([config]) => config.targetPages)).toEqual([
      '1-100',
      '101-200',
      '201-300'
    ]);
  });

  it('WASM 解析失败时仍释放 parser', async () => {
    const error = new Error('invalid PDF');
    mockLiteParseParse.mockRejectedValueOnce(error);

    await expect(
      readPdfByLiteParse({
        extension: 'pdf',
        encoding: 'utf-8',
        buffer: Buffer.from('invalid pdf')
      })
    ).rejects.toThrow(error);

    expect(mockLiteParseFree).toHaveBeenCalledTimes(1);
  });
});

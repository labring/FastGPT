import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockLiteParseParse } = vi.hoisted(() => ({
  mockLiteParseParse: vi.fn()
}));

vi.mock('@llamaindex/liteparse', () => ({
  LiteParse: vi.fn(function MockLiteParse() {
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

  it('优先使用 LiteParse，并对 textItems 做后处理', async () => {
    mockLiteParseParse.mockResolvedValue({
      text: 'fallback text',
      pages: [
        {
          height: 1000,
          textItems: [
            {
              text: '人工智能正在快速发展并进入规模化落地阶段',
              x: 80,
              y: 100,
              width: 240,
              height: 12
            },
            { text: '并推动产业升级。', x: 80, y: 120, width: 96, height: 12 }
          ]
        }
      ]
    });

    const result = await readPdfFile({
      extension: 'pdf',
      encoding: 'utf-8',
      buffer: Buffer.from('pdf')
    });

    expect(result.rawText).toBe('人工智能正在快速发展并进入规模化落地阶段并推动产业升级。\n');
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

import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  isLiteParseWasmLoadError,
  readPdfFileWithFallback
} from '@fastgpt/service/worker/readFile/extension/pdf';

describe('readPdfFile', () => {
  const mockReadPdfByLiteParse = vi.fn();
  const mockReadPdfByPdfJs = vi.fn();
  const mockWarn = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('优先使用 LiteParse 解析 PDF', async () => {
    const expected = { rawText: 'liteparse text' };
    mockReadPdfByLiteParse.mockResolvedValue(expected);

    const params = {
      extension: 'pdf',
      encoding: 'utf-8',
      buffer: Buffer.from('pdf')
    };
    const result = await readPdfFileWithFallback(params, {
      readByLiteParse: mockReadPdfByLiteParse,
      readByPdfJs: mockReadPdfByPdfJs,
      warn: mockWarn
    });

    expect(result).toBe(expected);
    expect(mockReadPdfByLiteParse).toHaveBeenCalledWith(params);
    expect(mockReadPdfByPdfJs).not.toHaveBeenCalled();
    expect(mockWarn).not.toHaveBeenCalled();
  });

  it('LiteParse WASM 初始化失败时回退到 PDF.js', async () => {
    const error = new Error('LiteParse WASM initialization failed');
    const expected = { rawText: 'pdfjs text' };
    mockReadPdfByLiteParse.mockRejectedValue(error);
    mockReadPdfByPdfJs.mockResolvedValue(expected);

    const params = {
      extension: 'pdf',
      encoding: 'utf-8',
      buffer: Buffer.from('pdf')
    };
    const result = await readPdfFileWithFallback(params, {
      readByLiteParse: mockReadPdfByLiteParse,
      readByPdfJs: mockReadPdfByPdfJs,
      warn: mockWarn
    });

    expect(result).toBe(expected);
    expect(mockReadPdfByLiteParse).toHaveBeenCalledWith(params);
    expect(mockReadPdfByPdfJs).toHaveBeenCalledWith(params);
    expect(mockWarn).toHaveBeenCalledWith(
      'LiteParse WASM dependency failed, fallback to PDF.js',
      error
    );
  });

  it('LiteParse 普通解析失败时直接抛出错误', async () => {
    const error = new Error('Invalid PDF structure');
    mockReadPdfByLiteParse.mockRejectedValue(error);

    await expect(
      readPdfFileWithFallback(
        {
          extension: 'pdf',
          encoding: 'utf-8',
          buffer: Buffer.from('pdf')
        },
        {
          readByLiteParse: mockReadPdfByLiteParse,
          readByPdfJs: mockReadPdfByPdfJs,
          warn: mockWarn
        }
      )
    ).rejects.toThrow(error);
    expect(mockReadPdfByPdfJs).not.toHaveBeenCalled();
    expect(mockWarn).not.toHaveBeenCalled();
  });
});

describe('isLiteParseWasmLoadError', () => {
  it('识别 LiteParse WASM 包缺失和初始化错误', () => {
    expect(isLiteParseWasmLoadError(new Error('LiteParse WASM initialization failed'))).toBe(true);
    expect(
      isLiteParseWasmLoadError(
        new Error(
          "Cannot find package '@llamaindex/liteparse-wasm' imported from worker/readFile.js"
        )
      )
    ).toBe(true);
  });

  it('不把普通 PDF 解析错误识别为 WASM 加载错误', () => {
    expect(isLiteParseWasmLoadError(new Error('Invalid PDF structure'))).toBe(false);
  });
});

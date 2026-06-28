import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  isLiteParseNativeLoadError,
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

  it('LiteParse native 加载失败时回退到 PDF.js', async () => {
    const error = new Error(
      'Failed to load native module for linux-arm64. Ensure the correct optional dependency is installed.'
    );
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
      'LiteParse native dependency failed, fallback to PDF.js',
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

describe('isLiteParseNativeLoadError', () => {
  it('识别 LiteParse native/optional dependency 加载错误', () => {
    expect(
      isLiteParseNativeLoadError(
        new Error(
          'Failed to load native module for linux-arm64. Ensure the correct optional dependency is installed.'
        )
      )
    ).toBe(true);
    expect(
      isLiteParseNativeLoadError(
        new Error("Cannot find module '@llamaindex/liteparse-linux-arm64-musl'")
      )
    ).toBe(true);
  });

  it('不把普通 PDF 解析错误识别为 native 加载错误', () => {
    expect(isLiteParseNativeLoadError(new Error('Invalid PDF structure'))).toBe(false);
  });
});

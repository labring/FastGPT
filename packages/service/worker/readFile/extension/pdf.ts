import { type ReadRawTextByBuffer, type ReadFileResponse } from '../type';
import { readPdfByLiteParse } from '../utils/LiteParse';
import { readPdfByPdfJs } from '../utils/pdf/pdfjs';

type PdfReader = (params: ReadRawTextByBuffer) => Promise<ReadFileResponse>;

type PdfFallbackReaders = {
  readByLiteParse: PdfReader;
  readByPdfJs: PdfReader;
  warn?: typeof console.warn;
};

const LITE_PARSE_WASM_LOAD_ERROR_PATTERNS = [
  /LiteParse WASM initialization failed/i,
  /cannot find (?:module|package) ['"]@llamaindex\/liteparse-wasm/i
];

/**
 * 判断 LiteParse 错误是否属于 WASM 包缺失或初始化失败。
 *
 * 只有部署资源缺失导致的 WASM 初始化错误才回退 PDF.js；
 * PDF 内容解析失败、页码解析失败等业务错误继续抛出，避免 fallback 掩盖真实问题。
 */
export const isLiteParseWasmLoadError = (error: unknown) => {
  const message = (() => {
    if (error instanceof Error) {
      return [error.name, error.message, error.stack].filter(Boolean).join('\n');
    }
    if (typeof error === 'string') return error;
    return '';
  })();

  return LITE_PARSE_WASM_LOAD_ERROR_PATTERNS.some((pattern) => pattern.test(message));
};

/**
 * 解析 PDF 文本，优先使用 LiteParse，失败时回退到 PDF.js。
 *
 * LiteParse WASM 是默认解析内核。PDF.js 仅作为 WASM 包或资源加载失败时的兼容路径，
 * 避免构建产物缺失 wasm 文件时 PDF 解析整体不可用。
 */
export const readPdfFileWithFallback = async (
  params: ReadRawTextByBuffer,
  readers: PdfFallbackReaders
): Promise<ReadFileResponse> => {
  try {
    return await readers.readByLiteParse(params);
  } catch (error) {
    if (!isLiteParseWasmLoadError(error)) {
      throw error;
    }

    readers.warn?.('LiteParse WASM dependency failed, fallback to PDF.js', error);
    return readers.readByPdfJs(params);
  }
};

/**
 * 使用生产解析器读取 PDF。
 *
 * 默认使用 LiteParse WASM；只有 WASM 包加载失败时才注入 PDF.js 兼容路径。
 */
export const readPdfFile = async (params: ReadRawTextByBuffer): Promise<ReadFileResponse> =>
  readPdfFileWithFallback(params, {
    readByLiteParse: readPdfByLiteParse,
    readByPdfJs: readPdfByPdfJs,
    warn: console.warn
  });

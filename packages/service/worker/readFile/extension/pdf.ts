import { type ReadRawTextByBuffer, type ReadFileResponse } from '../type';
import { readPdfByLiteParse } from '../utils/LiteParse';
import { readPdfByPdfJs } from '../utils/pdf/pdfjs';

type PdfReader = (params: ReadRawTextByBuffer) => Promise<ReadFileResponse>;

type PdfFallbackReaders = {
  readByLiteParse: PdfReader;
  readByPdfJs: PdfReader;
  warn?: typeof console.warn;
};

const LITE_PARSE_NATIVE_ERROR_PATTERNS = [
  /failed to load native module/i,
  /ensure the correct optional dependency is installed/i,
  /cannot find module ['"]@llamaindex\/liteparse-/i,
  /liteparse.*native/i,
  /native.*liteparse/i,
  /(?:dlopen|shared library|dynamic module).*(?:liteparse|pdfium)/i,
  /(?:liteparse|pdfium).*(?:dlopen|shared library|dynamic module)/i
];

/**
 * 判断 LiteParse 错误是否属于平台 native 包缺失或加载失败。
 *
 * 只有部署环境不兼容导致的 native/optional dependency 错误才回退 PDF.js；
 * PDF 内容解析失败、页码解析失败等业务错误继续抛出，避免 fallback 掩盖真实问题。
 */
export const isLiteParseNativeLoadError = (error: unknown) => {
  const message = (() => {
    if (error instanceof Error) {
      return [error.name, error.message, error.stack].filter(Boolean).join('\n');
    }
    if (typeof error === 'string') return error;
    return '';
  })();

  return LITE_PARSE_NATIVE_ERROR_PATTERNS.some((pattern) => pattern.test(message));
};

/**
 * 解析 PDF 文本，优先使用 LiteParse，失败时回退到 PDF.js。
 *
 * LiteParse 依赖平台 native 包，性能更好但在部分环境（如 linux/arm64 + Alpine/musl）
 * 缺少上游发布物。PDF.js 作为纯 JS 兼容路径保留，避免部署环境不匹配时 PDF 解析整体不可用。
 */
export const readPdfFileWithFallback = async (
  params: ReadRawTextByBuffer,
  readers: PdfFallbackReaders
): Promise<ReadFileResponse> => {
  try {
    return await readers.readByLiteParse(params);
  } catch (error) {
    if (!isLiteParseNativeLoadError(error)) {
      throw error;
    }

    readers.warn?.('LiteParse native dependency failed, fallback to PDF.js', error);
    return readers.readByPdfJs(params);
  }
};

/**
 * 使用生产解析器读取 PDF。
 *
 * 默认仍优先 LiteParse；只有 native 包加载失败时才注入 PDF.js 兼容路径。
 */
export const readPdfFile = async (params: ReadRawTextByBuffer): Promise<ReadFileResponse> =>
  readPdfFileWithFallback(params, {
    readByLiteParse: readPdfByLiteParse,
    readByPdfJs: readPdfByPdfJs,
    warn: console.warn
  });

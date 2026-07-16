import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { type ReadFileResponse, type ReadRawTextByBuffer, type ParsedPage } from '../../type';
import { postprocessLiteParsePages } from './pdfTextPostprocess';

const LITE_PARSE_MAX_PAGES = 100000;
const LITE_PARSE_BATCH_PAGES = 100;
const workerRequire = createRequire(path.join(process.cwd(), 'worker', 'readFile.js'));

type LiteParseWasmModule = typeof import('@llamaindex/liteparse-wasm');
let liteParseWasmModulePromise: Promise<LiteParseWasmModule> | undefined;

/**
 * 在当前 worker 内初始化并复用一份 LiteParse WASM 实例。
 *
 * 官方包默认通过 fetch 加载相邻的 wasm 文件，Node 不支持直接 fetch file URL，因此显式
 * 从 worker 运行时依赖目录读取字节。每个 worker_thread 有独立的模块实例和线性内存，
 * 避免多个线程共享 native PDFium 全局状态。
 */
const loadLiteParseWasm = () => {
  if (liteParseWasmModulePromise) return liteParseWasmModulePromise;

  liteParseWasmModulePromise = (async () => {
    try {
      const wasmModule = await import('@llamaindex/liteparse-wasm');
      const wasmPath = workerRequire.resolve('@llamaindex/liteparse-wasm/liteparse_wasm_bg.wasm');
      const wasmBytes = await readFile(wasmPath);
      await wasmModule.default({ module_or_path: wasmBytes });
      return wasmModule;
    } catch (error) {
      liteParseWasmModulePromise = undefined;
      throw new Error('LiteParse WASM initialization failed', { cause: error });
    }
  })();

  return liteParseWasmModulePromise;
};

/**
 * 使用 LiteParse WASM 解析普通 PDF 文本。
 *
 * OCR 默认关闭，避免普通系统解析路径产生额外耗时和 OCR 资源依赖；LiteParse 只输出文本
 * 和 textItems，本路径不会返回图片或 Markdown。PDF 按页分批解析，降低 PDFium/WASM
 * 一次性持有大量页面结构的内存峰值；最后仍统一后处理全部 pages，保持现有文本清理行为。
 */
export const readPdfByLiteParse = async ({
  buffer
}: ReadRawTextByBuffer): Promise<ReadFileResponse> => {
  const { LiteParse } = await loadLiteParseWasm();
  const pages: ParsedPage[] = [];

  for (let pageStart = 1; pageStart <= LITE_PARSE_MAX_PAGES; pageStart += LITE_PARSE_BATCH_PAGES) {
    const pageEnd = pageStart + LITE_PARSE_BATCH_PAGES - 1;
    const parser = new LiteParse({
      ocrEnabled: false,
      maxPages: LITE_PARSE_MAX_PAGES,
      targetPages: `${pageStart}-${pageEnd}`,
      quiet: true
    });
    const result = await (async () => {
      try {
        return await parser.parse(buffer);
      } finally {
        parser.free();
      }
    })();

    if (!result.pages.length) break;

    pages.push(...result.pages);
  }

  const rawText = postprocessLiteParsePages(pages);

  return {
    rawText
  };
};

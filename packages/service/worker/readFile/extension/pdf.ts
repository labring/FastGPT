import { type ReadRawTextByBuffer, type ReadFileResponse, type ParsedPage } from '../type';
import { postprocessLiteParsePages } from '../utils/pdfTextPostprocess';

const LITE_PARSE_MAX_PAGES = 100000;
const LITE_PARSE_BATCH_PAGES = 100;

/**
 * 使用 LiteParse 解析普通 PDF 文本。
 *
 * OCR 默认关闭，避免普通系统解析路径产生额外耗时和 OCR 资源依赖；LiteParse 只输出文本
 * 和 textItems，本路径不会返回图片或 Markdown。PDF 按页分批解析，降低 PDFium/native
 * 一次性持有大量页面结构的内存峰值；最后仍统一后处理全部 pages，保持现有文本清理行为。
 */
export const readPdfFile = async ({ buffer }: ReadRawTextByBuffer): Promise<ReadFileResponse> => {
  const { LiteParse } = await import('@llamaindex/liteparse');
  const pages: ParsedPage[] = [];

  for (let pageStart = 1; pageStart <= LITE_PARSE_MAX_PAGES; pageStart += LITE_PARSE_BATCH_PAGES) {
    const pageEnd = pageStart + LITE_PARSE_BATCH_PAGES - 1;
    const parser = new LiteParse({
      ocrEnabled: false,
      maxPages: LITE_PARSE_MAX_PAGES,
      targetPages: `${pageStart}-${pageEnd}`,
      quiet: true
    });
    const result = await parser.parse(buffer);

    if (!result.pages.length) break;

    pages.push(...result.pages);
  }

  const rawText = postprocessLiteParsePages(pages);

  return {
    rawText
  };
};

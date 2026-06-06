import { type ReadRawTextByBuffer, type ReadFileResponse } from '../type';
import { postprocessLiteParsePages } from '../utils/pdfTextPostprocess';
import { LiteParse } from '@llamaindex/liteparse';
/**
 * 使用 LiteParse 解析普通 PDF 文本。
 *
 * OCR 默认关闭，避免普通系统解析路径产生额外耗时和 OCR 资源依赖；LiteParse 只输出文本
 * 和 textItems，本路径不会返回图片或 Markdown。LiteParse 解析失败时直接抛错，由上层
 * 读取文件错误路径处理。maxPages 放大是为了避免 LiteParse 默认 1000 页限制截断超大 PDF。
 */
export const readPdfFile = async ({ buffer }: ReadRawTextByBuffer): Promise<ReadFileResponse> => {
  const parser = new LiteParse({
    ocrEnabled: false,
    maxPages: 100000,
    quiet: true
  });

  const result = await parser.parse(buffer);
  const rawText = postprocessLiteParsePages(result.pages) || result.text || '';

  return {
    rawText
  };
};

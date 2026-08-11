import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
// @ts-ignore
import('pdfjs-dist/legacy/build/pdf.worker.min.mjs');
import { type ParsedPage, type ReadFileResponse, type ReadRawTextByBuffer } from '../../../type';
import { postprocessPdfPages } from '../pdfTextPostprocess';

type PdfJsTextToken = {
  str: string;
  width: number;
  height: number;
  transform: number[];
  fontName?: string;
  hasEOL?: boolean;
};

type PdfJsTokenToTextItemParams = {
  token: PdfJsTextToken;
  viewportTransform: number[];
};

/**
 * 将 PDF.js 的文本基线矩阵转换为统一的顶部原点文本框。
 *
 * PDF.js token 使用 PDF 坐标与基线位置，LiteParse 后处理使用页面顶部原点的包围盒。
 * 这里组合 viewport 矩阵，并用文字前进方向与字高方向计算四角包围盒，因此同时支持
 * 页面旋转和文字旋转；空白 token 不参与坐标组行。
 */
export const convertPdfJsTokenToTextItem = ({
  token,
  viewportTransform
}: PdfJsTokenToTextItemParams) => {
  const text = String(token.str ?? '').trim();
  if (!text) return;
  if (token.transform?.length !== 6 || viewportTransform.length !== 6) return;

  const transform = pdfjs.Util.transform(viewportTransform, token.transform);
  if (!transform.every(Number.isFinite)) return;

  const [scaleX, skewY, skewX, scaleY, originX, originY] = transform;
  const horizontalScale = Math.hypot(scaleX, skewY);
  const verticalScale = Math.hypot(skewX, scaleY);
  const width = Math.max(0, Number(token.width) || 0);
  const glyphHeight = Math.max(0, Number(token.height) || verticalScale);
  const horizontalUnit = horizontalScale
    ? { x: scaleX / horizontalScale, y: skewY / horizontalScale }
    : { x: 1, y: 0 };
  const verticalUnit = verticalScale
    ? { x: skewX / verticalScale, y: scaleY / verticalScale }
    : { x: 0, y: -1 };
  const baselineEnd = {
    x: originX + horizontalUnit.x * width,
    y: originY + horizontalUnit.y * width
  };
  const topStart = {
    x: originX + verticalUnit.x * glyphHeight,
    y: originY + verticalUnit.y * glyphHeight
  };
  const topEnd = {
    x: baselineEnd.x + verticalUnit.x * glyphHeight,
    y: baselineEnd.y + verticalUnit.y * glyphHeight
  };
  const xCoordinates = [originX, baselineEnd.x, topStart.x, topEnd.x];
  const yCoordinates = [originY, baselineEnd.y, topStart.y, topEnd.y];
  const left = Math.min(...xCoordinates);
  const right = Math.max(...xCoordinates);
  const top = Math.min(...yCoordinates);
  const bottom = Math.max(...yCoordinates);

  return {
    text,
    x: left,
    y: top,
    width: right - left,
    height: bottom - top,
    fontName: token.fontName,
    fontSize: verticalScale || glyphHeight
  };
};

/**
 * 使用 PDF.js 解析 PDF 文本，并复用 LiteParse 的统一文本后处理。
 *
 * PDF.js 仍作为 LiteParse WASM 依赖不可用时的兼容兜底，但两条解析路径会先各自
 * 标准化为 ParsedPage，再共享页眉页脚识别、坐标组行与段落合并规则。
 */
export const readPdfByPdfJs = async ({
  buffer
}: ReadRawTextByBuffer): Promise<ReadFileResponse> => {
  const readPDFPage = async (doc: any, pageNo: number): Promise<ParsedPage> => {
    let page: any;

    try {
      page = await doc.getPage(pageNo);
      const tokenizedText = await page.getTextContent();
      const viewport = page.getViewport({ scale: 1 });
      const textItems = (tokenizedText.items as PdfJsTextToken[])
        .map((token) =>
          convertPdfJsTokenToTextItem({
            token,
            viewportTransform: viewport.transform
          })
        )
        .filter((item) => item !== undefined);

      return {
        pageNum: pageNo,
        width: viewport.width,
        height: viewport.height,
        text: textItems.map((item) => item.text).join(' '),
        textItems
      };
    } catch (error) {
      console.error('Failed to read pdf page', { pageNo, error });
      return {
        pageNum: pageNo,
        width: 0,
        height: 0,
        text: '',
        textItems: []
      };
    } finally {
      page?.cleanup();
    }
  };

  // Create a completely new ArrayBuffer to avoid SharedArrayBuffer transferList issues
  const uint8Array = new Uint8Array(buffer.byteLength);
  uint8Array.set(new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength));
  const loadingTask = pdfjs.getDocument({ data: uint8Array });

  try {
    const doc = await loadingTask.promise;
    const pageArr = Array.from({ length: doc.numPages }, (_, i) => i + 1);
    const pages = await Promise.all(pageArr.map(async (pageNo) => await readPDFPage(doc, pageNo)));

    return {
      rawText: postprocessPdfPages(pages)
    };
  } finally {
    await loadingTask.destroy();
  }
};

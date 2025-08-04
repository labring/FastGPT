import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
// @ts-ignore
import('pdfjs-dist/legacy/build/pdf.worker.min.mjs');
import { type ReadRawTextByBuffer, type ReadFileResponse } from '../type';

type TokenType = {
  str: string;
  dir: string;
  width: number;
  height: number;
  transform: number[];
  fontName: string;
  hasEOL: boolean;
};

export const readPdfFile = async ({ buffer }: ReadRawTextByBuffer): Promise<ReadFileResponse> => {
  const readPDFPage = async (doc: any, pageNo: number) => {
    try {
      const page = await doc.getPage(pageNo);
      const tokenizedText = await page.getTextContent();

      const viewport = page.getViewport({ scale: 1 });
      const pageHeight = viewport.height;
      const headerThreshold = pageHeight * 0.95;
      const footerThreshold = pageHeight * 0.05;

      const pageTexts: TokenType[] = tokenizedText.items.filter((token: TokenType) => {
        return (
          !token.transform ||
          (token.transform[5] < headerThreshold && token.transform[5] > footerThreshold)
        );
      });

      // concat empty string 'hasEOL'
      for (let i = 0; i < pageTexts.length; i++) {
        const item = pageTexts[i];
        if (item.str === '' && pageTexts[i - 1]) {
          pageTexts[i - 1].hasEOL = item.hasEOL;
          pageTexts.splice(i, 1);
          i--;
        }
      }

      page.cleanup();

      return pageTexts
        .map((token) => {
          const paragraphEnd = token.hasEOL && /([。？！.?!\n\r]|(\r\n))$/.test(token.str);

          return paragraphEnd ? `${token.str}\n` : token.str;
        })
        .join('');
    } catch (error) {
      console.log('pdf read error', error);
      return '';
    }
  };

  // Create a completely new ArrayBuffer to avoid SharedArrayBuffer transferList issues
  const uint8Array = new Uint8Array(buffer.byteLength);
  uint8Array.set(new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength));
  const loadingTask = pdfjs.getDocument({ data: uint8Array });
  const doc = await loadingTask.promise;

  const pageArr = Array.from({ length: doc.numPages }, (_, i) => i + 1);
  const result = (
    await Promise.all(pageArr.map(async (page) => await readPDFPage(doc, page)))
  ).join('');

  loadingTask.destroy();

  return {
    rawText: result
  };
};

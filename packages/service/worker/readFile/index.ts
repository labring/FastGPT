import { parentPort } from 'worker_threads';
import { readFileRawText } from './extension/rawText';
import { type ReadRawTextByBuffer, type ReadRawTextProps } from './type';
import { readHtmlRawText } from './extension/html';
import { readPdfFile } from './extension/pdf';
import { readDocsFile } from './extension/docx';
import { readPptxRawText } from './extension/pptx';
import { readXlsxRawText } from './extension/xlsx';
import { readCsvRawText } from './extension/csv';

type IncomingMessage = {
  id: string;
} & Omit<ReadRawTextProps<any>, 'buffer'> & {
    sharedBuffer: SharedArrayBuffer;
    bufferSize: number;
  };

const read = async (params: ReadRawTextByBuffer) => {
  switch (params.extension) {
    case 'txt':
    case 'md':
      return readFileRawText(params);
    case 'html':
      return readHtmlRawText(params);
    case 'pdf':
      return readPdfFile(params);
    case 'docx':
      return readDocsFile(params);
    case 'pptx':
      return readPptxRawText(params);
    case 'xlsx':
      return readXlsxRawText(params);
    case 'csv':
      return readCsvRawText(params);
    default:
      return Promise.reject(
        `Only support .txt, .md, .html, .pdf, .docx, pptx, .csv, .xlsx. "${params.extension}" is not supported.`
      );
  }
};

parentPort?.on('message', async (props: IncomingMessage) => {
  const { id, sharedBuffer, bufferSize, extension, encoding } = props;

  try {
    // 使用 SharedArrayBuffer，零拷贝共享内存
    const sharedArray = new Uint8Array(sharedBuffer);
    const buffer = Buffer.from(sharedArray.buffer, 0, bufferSize);

    const data = await read({ extension, encoding, buffer });

    parentPort?.postMessage({ id, type: 'success', data });
  } catch (error) {
    parentPort?.postMessage({ id, type: 'error', data: error });
  }
});

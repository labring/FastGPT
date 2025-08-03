import { parentPort } from 'worker_threads';
import { readFileRawText } from './extension/rawText';
import { type ReadRawTextByBuffer, type ReadRawTextProps } from './type';
import { readHtmlRawText } from './extension/html';
import { readPdfFile } from './extension/pdf';
import { readDocsFile } from './extension/docx';
import { readPptxRawText } from './extension/pptx';
import { readXlsxRawText } from './extension/xlsx';
import { readCsvRawText } from './extension/csv';
import { workerResponse } from '../controller';

parentPort?.on(
  'message',
  async (
    props: Omit<ReadRawTextProps<any>, 'buffer'> & {
      sharedBuffer: SharedArrayBuffer;
      bufferSize: number;
    }
  ) => {
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

    // 使用 SharedArrayBuffer，零拷贝共享内存
    const sharedArray = new Uint8Array(props.sharedBuffer);
    const buffer = Buffer.from(sharedArray.buffer, 0, props.bufferSize);

    const newProps: ReadRawTextByBuffer = {
      extension: props.extension,
      encoding: props.encoding,
      buffer
    };

    try {
      workerResponse({
        parentPort,
        status: 'success',
        data: await read(newProps)
      });
    } catch (error) {
      workerResponse({
        parentPort,
        status: 'error',
        data: error
      });
    }
  }
);

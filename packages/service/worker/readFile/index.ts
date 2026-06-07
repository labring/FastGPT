import { parentPort } from 'worker_threads';
import { readFileRawText } from './extension/rawText';
import { type ReadRawTextByBuffer, type ReadRawTextProps } from './type';
import { readHtmlRawText } from './extension/html';
import { readPdfFile } from './extension/pdf';
import { readDocsFile } from './extension/docx';
import { readPptxRawText } from './extension/pptx';
import { readXlsxRawText } from './extension/xlsx';
import { readCsvRawText } from './extension/csv';
import { type UploadFileHandler } from './type';
import {
  createWorkerUploadFileHandlerWithListener,
  isWorkerUploadFileResponse
} from '../utils/uploadFile';

type IncomingMessage = {
  id: string;
  type?: string;
} & Omit<ReadRawTextProps<any>, 'buffer'> & {
    buffer?: ArrayBuffer;
    sharedBuffer?: SharedArrayBuffer;
    bufferSize: number;
    imageKeyOptions?: {
      prefix: string;
      expiredTime?: Date;
    };
  };

const read = async (
  params: ReadRawTextByBuffer,
  options: { uploadFile?: UploadFileHandler } = {}
) => {
  switch (params.extension) {
    case 'txt':
    case 'md':
      return readFileRawText(params, {
        uploadFile: options.uploadFile
      });
    case 'html':
      return readHtmlRawText(params, {
        uploadFile: options.uploadFile
      });
    case 'pdf':
      return readPdfFile(params);
    case 'docx':
      return readDocsFile(params, {
        uploadFile: options.uploadFile
      });
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
  if (isWorkerUploadFileResponse(props.type)) {
    return;
  }

  const {
    id,
    buffer: transferredBuffer,
    sharedBuffer,
    bufferSize,
    extension,
    encoding,
    imageKeyOptions
  } = props;

  try {
    const rawBuffer = transferredBuffer ?? sharedBuffer;
    if (!rawBuffer) {
      throw new Error('Read file worker missing buffer');
    }

    // 优先使用 transfer 进来的 ArrayBuffer；兼容旧的 SharedArrayBuffer 零拷贝路径。
    const buffer = Buffer.from(rawBuffer, 0, bufferSize);

    const uploadFileHandler = createWorkerUploadFileHandlerWithListener({
      taskId: id,
      parentPort,
      enabled: Boolean(imageKeyOptions?.prefix)
    });

    try {
      const data = await read(
        { extension, encoding, buffer },
        { uploadFile: uploadFileHandler.uploadFile }
      );

      parentPort?.postMessage({ id, type: 'success', data });
    } finally {
      uploadFileHandler.cleanup();
    }
  } catch (error) {
    parentPort?.postMessage({ id, type: 'error', data: error });
  }
});

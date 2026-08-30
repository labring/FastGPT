import { parentPort } from 'worker_threads';
import { readFileRawText } from './extension/rawText';
import { type ReadRawTextByBuffer, type ReadRawTextProps } from './type';
import { readHtmlRawText } from './extension/html';
import { readPdfFile } from './extension/pdf';
import { readDocsFile } from './extension/docx';
import { readPptxRawText } from './extension/pptx';
import { readXlsxRawText } from './extension/xlsx';
import { readCsvRawText } from './extension/csv';
import { isAnydocDocumentExtension, readAnydocRawText } from './extension/anydoc';
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

type LoadFileResponse = {
  id: string;
  type?: 'loadFileResult' | 'loadFileError';
  requestId?: string;
  data?: MaterializedWorkerFile | unknown;
};

type MaterializedWorkerFile = {
  buffer: ArrayBuffer;
  bufferSize: number;
  metadata?: {
    extension?: string;
    encoding?: string;
  };
};

const isLoadFileResponse = (type?: string) => type === 'loadFileResult' || type === 'loadFileError';

/** 当前 worker 任务向主线程请求延迟物化文件，并按 requestId 隔离回包。 */
const requestMaterializedFile = ({ id }: { id: string }) =>
  new Promise<MaterializedWorkerFile>((resolve, reject) => {
    const requestId = crypto.randomUUID();
    const onMessage = (message: LoadFileResponse) => {
      if (
        message.id !== id ||
        message.requestId !== requestId ||
        !isLoadFileResponse(message.type)
      ) {
        return;
      }

      parentPort?.off('message', onMessage);
      if (message.type === 'loadFileError') {
        reject(message.data);
      } else if (message.data && typeof message.data === 'object' && 'buffer' in message.data) {
        resolve(message.data as MaterializedWorkerFile);
      } else {
        reject(new Error('Read file worker received an empty loadFile result'));
      }
    };

    parentPort?.on('message', onMessage);
    try {
      parentPort?.postMessage({ id, type: 'loadFile', requestId });
    } catch (error) {
      parentPort?.off('message', onMessage);
      reject(error);
    }
  });

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
      if (isAnydocDocumentExtension(params.extension)) {
        return readAnydocRawText(params, {
          uploadFile: options.uploadFile
        });
      }

      return Promise.reject(
        `The file extension ".${params.extension.replace(/^\./, '')}" is not supported.`
      );
  }
};

parentPort?.on('message', async (props: IncomingMessage) => {
  if (isWorkerUploadFileResponse(props.type) || isLoadFileResponse(props.type)) {
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
    const loadedFile =
      transferredBuffer || sharedBuffer ? undefined : await requestMaterializedFile({ id });
    const rawBuffer = transferredBuffer ?? sharedBuffer ?? loadedFile?.buffer;
    if (!rawBuffer) throw new Error('Read file worker missing buffer');

    // 优先使用 transfer 进来的 ArrayBuffer；兼容旧的 SharedArrayBuffer 零拷贝路径。
    const buffer = Buffer.from(rawBuffer, 0, loadedFile?.bufferSize ?? bufferSize);
    const finalExtension = loadedFile?.metadata?.extension ?? extension;
    const finalEncoding = loadedFile?.metadata?.encoding ?? encoding;

    const uploadFileHandler = createWorkerUploadFileHandlerWithListener({
      taskId: id,
      parentPort,
      enabled: Boolean(imageKeyOptions?.prefix)
    });

    try {
      const data = await read(
        { extension: finalExtension, encoding: finalEncoding, buffer },
        { uploadFile: uploadFileHandler.uploadFile }
      );

      parentPort?.postMessage({
        id,
        type: 'success',
        data: loadedFile?.metadata ? { ...data, sourceMetadata: loadedFile.metadata } : data
      });
    } finally {
      uploadFileHandler.cleanup();
    }
  } catch (error) {
    parentPort?.postMessage({ id, type: 'error', data: error });
  }
});

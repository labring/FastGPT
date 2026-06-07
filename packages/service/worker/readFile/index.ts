import { parentPort } from 'worker_threads';
import { readFileRawText } from './extension/rawText';
import { type ReadRawTextByBuffer, type ReadRawTextProps } from './type';
import { readHtmlRawText } from './extension/html';
import { readPdfFile } from './extension/pdf';
import { readDocsFile } from './extension/docx';
import { readPptxRawText } from './extension/pptx';
import { readXlsxRawText } from './extension/xlsx';
import { readCsvRawText } from './extension/csv';
import { type UploadFileHandler, type UploadedFileResult } from './type';

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

type WorkerUploadFileResponse = {
  id: string;
  type: 'uploadFileResult' | 'uploadFileError';
  requestId: string;
  data: UploadedFileResult | any;
};

/**
 * 为单个 readFile 任务创建 worker 内的 uploadFile 请求桥。
 *
 * 文档解析图片时会 await 这个 handler；主线程负责上传并通过 requestId 回传结果。
 * 没有 prefix 时不创建 handler，带图片的文档解析会按缺少上传参数处理并失败。
 */
const createUploadFileHandler = ({
  taskId,
  enabled
}: {
  taskId: string;
  enabled: boolean;
}): { uploadFile?: UploadFileHandler; cleanup: () => void } => {
  if (!enabled) return { cleanup: () => {} };

  const pendingRequests = new Map<
    string,
    {
      resolve: (result: UploadedFileResult) => void;
      reject: (error: any) => void;
    }
  >();

  const onMessage = ({ id, type, requestId, data }: WorkerUploadFileResponse) => {
    if (id !== taskId || !requestId) return;
    const pending = pendingRequests.get(requestId);
    if (!pending) return;

    pendingRequests.delete(requestId);
    if (type === 'uploadFileResult') {
      pending.resolve(data as UploadedFileResult);
    } else if (type === 'uploadFileError') {
      pending.reject(data);
    }
  };

  parentPort?.on('message', onMessage);

  return {
    uploadFile: (data) => {
      const requestId = crypto.randomUUID();

      return new Promise<UploadedFileResult>((resolve, reject) => {
        pendingRequests.set(requestId, { resolve, reject });
        parentPort?.postMessage(
          {
            id: taskId,
            type: 'uploadFile',
            requestId,
            data
          },
          [data.buffer]
        );
      }).finally(() => {
        pendingRequests.delete(requestId);
      });
    },
    cleanup: () => {
      parentPort?.off('message', onMessage);
      for (const { reject } of pendingRequests.values()) {
        reject(new Error('Read file worker upload request cancelled'));
      }
      pendingRequests.clear();
    }
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
  if (props.type === 'uploadFileResult' || props.type === 'uploadFileError') {
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

    const uploadFileHandler = createUploadFileHandler({
      taskId: id,
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

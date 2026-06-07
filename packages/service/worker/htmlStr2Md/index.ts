import { parentPort } from 'worker_threads';
import { html2md } from './utils';
import {
  createWorkerUploadFileHandler,
  handleWorkerUploadFileResponse,
  isWorkerUploadFileResponse
} from '../utils/uploadFile';

type IncomingMessage = {
  id: string;
  html: string;
  uploadImages?: boolean;
  type?: 'uploadFileResult' | 'uploadFileError';
  requestId?: string;
  data?: any;
};

parentPort?.on('message', async (params: IncomingMessage) => {
  const { id, html, requestId, data, type } = params;

  if (isWorkerUploadFileResponse(type)) {
    handleWorkerUploadFileResponse({
      taskId: id,
      type,
      requestId,
      data
    });
    return;
  }

  const uploadFileHandler = createWorkerUploadFileHandler({
    taskId: id,
    parentPort
  });

  try {
    const md = await html2md(html || '', {
      uploadFile: params.uploadImages ? uploadFileHandler.uploadFile : undefined
    });

    parentPort?.postMessage({ id, type: 'success', data: md });
  } catch (error) {
    parentPort?.postMessage({ id, type: 'error', data: error });
  } finally {
    uploadFileHandler.cleanup();
  }
});

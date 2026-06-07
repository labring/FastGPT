import type { MessagePort } from 'worker_threads';
import { type UploadFileHandler, type UploadedFileResult } from '../readFile/type';

type WorkerUploadFileResponse = {
  id: string;
  type?: string;
  requestId?: string;
  data?: UploadedFileResult | any;
};

type PendingUploadFileRequest = {
  taskId: string;
  resolve: (value: UploadedFileResult) => void;
  reject: (error: any) => void;
};

const pendingUploadFileRequests = new Map<string, PendingUploadFileRequest>();

export const isWorkerUploadFileResponse = (type?: string) =>
  type === 'uploadFileResult' || type === 'uploadFileError';

/**
 * 处理 worker uploadFile 的主线程回包。
 *
 * 多个 worker 入口共用同一套 requestId -> Promise 映射，按 taskId 防串扰。
 */
export const handleWorkerUploadFileResponse = ({
  taskId,
  type,
  requestId,
  data
}: {
  taskId: string;
  type?: string;
  requestId?: string;
  data?: any;
}) => {
  if (!isWorkerUploadFileResponse(type) || !requestId) return false;

  const pending = pendingUploadFileRequests.get(requestId);
  if (!pending || pending.taskId !== taskId) return true;

  pendingUploadFileRequests.delete(requestId);
  if (type === 'uploadFileError') {
    pending.reject(data);
  } else {
    pending.resolve(data as UploadedFileResult);
  }

  return true;
};

export const cleanupWorkerUploadFileRequests = (taskId: string, reason: Error) => {
  for (const [requestId, pending] of pendingUploadFileRequests.entries()) {
    if (pending.taskId !== taskId) continue;
    pending.reject(reason);
    pendingUploadFileRequests.delete(requestId);
  }
};

/**
 * 为 worker 内单个任务创建 uploadFile handler。
 *
 * 返回的 handler 会向主线程发送 `uploadFile` 中间事件，并等待同 requestId 的结果回包；
 * cleanup 必须在任务结束时调用，避免 dangling promise。
 */
export const createWorkerUploadFileHandler = ({
  taskId,
  parentPort
}: {
  taskId: string;
  parentPort?: MessagePort | null;
}): {
  uploadFile: UploadFileHandler;
  cleanup: () => void;
} => {
  const uploadFile: UploadFileHandler = (data) =>
    new Promise((resolve, reject) => {
      const requestId = crypto.randomUUID();
      pendingUploadFileRequests.set(requestId, { taskId, resolve, reject });
      try {
        parentPort?.postMessage(
          {
            id: taskId,
            type: 'uploadFile',
            requestId,
            data
          },
          [data.buffer]
        );
      } catch (error) {
        pendingUploadFileRequests.delete(requestId);
        reject(error);
      }
    });

  return {
    uploadFile,
    cleanup: () =>
      cleanupWorkerUploadFileRequests(
        taskId,
        new Error('Worker upload request cancelled before completion')
      )
  };
};

/**
 * 兼容需要在 worker 入口内部监听回包的任务，例如 readFile 会忽略主 message handler 中的回包。
 */
export const createWorkerUploadFileHandlerWithListener = ({
  taskId,
  parentPort,
  enabled
}: {
  taskId: string;
  parentPort?: MessagePort | null;
  enabled: boolean;
}): {
  uploadFile?: UploadFileHandler;
  cleanup: () => void;
} => {
  if (!enabled) return { cleanup: () => {} };

  const onMessage = ({ id, type, requestId, data }: WorkerUploadFileResponse) => {
    if (id !== taskId) return;
    handleWorkerUploadFileResponse({
      taskId,
      type,
      requestId,
      data
    });
  };

  parentPort?.on('message', onMessage);
  const bridge = createWorkerUploadFileHandler({ taskId, parentPort });

  return {
    uploadFile: bridge.uploadFile,
    cleanup: () => {
      parentPort?.off('message', onMessage);
      bridge.cleanup();
    }
  };
};

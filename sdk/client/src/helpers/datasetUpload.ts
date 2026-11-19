import type { BaseClient } from '../core/baseClient';
import { FastGptError, FastGptTimeoutError } from '../core/errors';
import { normalizeUploadableToBlob } from '../core/multipart';
import type { RequestOptions, Uploadable } from '../core/types';
import type {
  DatasetsCollectionsResource,
  DatasetsFilesResource,
  DatasetsTrainingResource
} from '../generated/resources';
import type {
  DatasetsCollectionsCreateByFileIdReq,
  DatasetsCollectionsCreateByFileIdRes,
  DatasetsCollectionsGetTrainingDetailRes,
  DatasetsTrainingListCollectionErrorsRes
} from '../generated/types';
import { uploadPresignedFile, type UploadProgressInfo } from './s3Uploader';

const DEFAULT_POLL_INTERVAL_MS = 2_000;
const DEFAULT_WAIT_TIMEOUT_MS = 10 * 60 * 1_000;
const DEFAULT_MAX_ERROR_ITEMS = 20;

export type CollectionTrainingProgress = {
  collectionId: string;
  queuedCount: number;
  trainingCount: number;
  errorCount: number;
  trainedCount: number;
  elapsedMs: number;
  detail: DatasetsCollectionsGetTrainingDetailRes;
};

export type WaitForCollectionTrainingParams = {
  collectionId: string;
  /** 轮询间隔毫秒数，默认 2000ms */
  pollIntervalMs?: number;
  /** 最大等待超时毫秒数，默认 10 分钟；传 0 表示不限制 */
  timeoutMs?: number;
  /** 训练结束后存在错误时，是否自动拉取异常分块详情列表（默认 true） */
  fetchErrors?: boolean;
  /** 自动拉取异常分块的最大条数（默认 20） */
  maxErrorItems?: number;
  /** 存在训练异常分块时是否主动抛出 FastGptError（默认 false，返回结果中的 errors 与 errorCount） */
  throwOnError?: boolean;
  /** 每次轮询时的进度回调 */
  onProgress?: (progress: CollectionTrainingProgress) => void;
};

export type WaitForCollectionTrainingResult = CollectionTrainingProgress & {
  errors: DatasetsTrainingListCollectionErrorsRes['list'];
};

export type DatasetTrainingProgress = {
  datasetId: string;
  hasTrainingTask: boolean;
  elapsedMs: number;
};

export type WaitForDatasetTrainingParams = {
  datasetId: string;
  /** 轮询间隔毫秒数，默认 2000ms */
  pollIntervalMs?: number;
  /** 最大等待超时毫秒数，默认 10 分钟；传 0 表示不限制 */
  timeoutMs?: number;
  /** 每次轮询时的状态回调 */
  onProgress?: (progress: DatasetTrainingProgress) => void;
};

export type WaitForDatasetTrainingResult = {
  datasetId: string;
  hasTrainingTask: false;
  hasError: boolean;
  elapsedMs: number;
};

export type UploadDatasetFileParams = Omit<DatasetsCollectionsCreateByFileIdReq, 'fileId'> & {
  /** 待上传的文件（支持 File / Blob / ArrayBuffer / Uint8Array / { data, filename, contentType }） */
  file: Uploadable;
  /** 显式覆盖上传文件名（优先级高于 Uploadable 自带文件名） */
  filename?: string;
  /**
   * 上传通道选择：
   * - `presign`（默认）：走 S3 预签名两阶段上传（自动适配大文件 Multipart 分片与断点重试）再调 createByFileId；
   * - `localFile`：直接走单次 multipart/form-data 调 createByLocalFile。
   */
  uploadStrategy?: 'presign' | 'localFile';
  /** 上传进度回调（仅 presign 模式下回调精确分片/字节进度） */
  onUploadProgress?: (progress: UploadProgressInfo) => void;
  /** Multipart 分片重试退避基础延迟（毫秒，默认 500ms） */
  retryBaseDelayMs?: number;
  /** 上传建集合后是否自动轮询等待该集合训练完成 */
  waitForTraining?: boolean | Omit<WaitForCollectionTrainingParams, 'collectionId'>;
};

export type UploadDatasetFileResult = {
  collectionId: string;
  fileKey?: string;
  previewUrl?: string;
  results: DatasetsCollectionsCreateByFileIdRes['results'];
  training?: WaitForCollectionTrainingResult;
};

const sumRecordCounts = (counts: Record<string, number>): number =>
  Object.values(counts).reduce((sum, value) => sum + (Number.isFinite(value) ? value : 0), 0);

const sleepWithAbort = (ms: number, signal?: AbortSignal): Promise<void> =>
  new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(
        new FastGptError({
          message: 'Training poll was aborted',
          cause: signal.reason
        })
      );
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(
        new FastGptError({
          message: 'Training poll was aborted',
          cause: signal?.reason
        })
      );
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });

/**
 * 轮询指定知识库集合的训练详情直至排队数与运行数双归零，可选自动拉取异常分块清单。
 */
export const waitForCollectionTraining = async ({
  collectionsResource,
  trainingResource,
  params,
  options
}: {
  collectionsResource: DatasetsCollectionsResource;
  trainingResource: DatasetsTrainingResource;
  params: WaitForCollectionTrainingParams;
  options?: RequestOptions;
}): Promise<WaitForCollectionTrainingResult> => {
  const pollIntervalMs = params.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
  const timeoutMs = params.timeoutMs ?? DEFAULT_WAIT_TIMEOUT_MS;
  const fetchErrors = params.fetchErrors ?? true;
  const maxErrorItems = params.maxErrorItems ?? DEFAULT_MAX_ERROR_ITEMS;
  const startedAt = Date.now();

  while (true) {
    if (options?.signal?.aborted) {
      throw new FastGptError({
        message: `Waiting for collection "${params.collectionId}" training was aborted`,
        cause: options.signal.reason
      });
    }

    const detail = await collectionsResource.getTrainingDetail(
      { collectionId: params.collectionId },
      options
    );
    const queuedCount = sumRecordCounts(detail.queuedCounts);
    const trainingCount = sumRecordCounts(detail.trainingCounts);
    const errorCount = sumRecordCounts(detail.errorCounts);
    const elapsedMs = Date.now() - startedAt;

    const progress: CollectionTrainingProgress = {
      collectionId: params.collectionId,
      queuedCount,
      trainingCount,
      errorCount,
      trainedCount: detail.trainedCount,
      elapsedMs,
      detail
    };
    params.onProgress?.(progress);

    if (queuedCount === 0 && trainingCount === 0) {
      const errors =
        errorCount > 0 && fetchErrors
          ? (
              await trainingResource.listCollectionErrors(
                {
                  collectionId: params.collectionId,
                  offset: 0,
                  pageSize: maxErrorItems
                },
                options
              )
            ).list
          : [];

      if (errorCount > 0 && params.throwOnError === true) {
        const firstReason = errors[0]?.errorMsg ?? 'Unknown training error';
        throw new FastGptError({
          message: `Collection "${params.collectionId}" finished training with ${errorCount} error(s): ${firstReason}`
        });
      }

      return {
        ...progress,
        errors
      };
    }

    if (timeoutMs > 0 && elapsedMs >= timeoutMs) {
      throw new FastGptTimeoutError({
        message: `Timed out waiting for collection "${params.collectionId}" training after ${timeoutMs}ms (queued=${queuedCount}, training=${trainingCount})`
      });
    }

    await sleepWithAbort(pollIntervalMs, options?.signal);
  }
};

/**
 * 轮询整个知识库的训练队列状态直至所有普通训练与重建任务完成，并返回是否存在最终异常。
 */
export const waitForDatasetTraining = async ({
  trainingResource,
  params,
  options
}: {
  trainingResource: DatasetsTrainingResource;
  params: WaitForDatasetTrainingParams;
  options?: RequestOptions;
}): Promise<WaitForDatasetTrainingResult> => {
  const pollIntervalMs = params.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
  const timeoutMs = params.timeoutMs ?? DEFAULT_WAIT_TIMEOUT_MS;
  const startedAt = Date.now();

  while (true) {
    if (options?.signal?.aborted) {
      throw new FastGptError({
        message: `Waiting for dataset "${params.datasetId}" training was aborted`,
        cause: options.signal.reason
      });
    }

    const queueStatus = await trainingResource.getQueue({ datasetId: params.datasetId }, options);
    const elapsedMs = Date.now() - startedAt;

    params.onProgress?.({
      datasetId: params.datasetId,
      hasTrainingTask: queueStatus.hasTrainingTask,
      elapsedMs
    });

    if (!queueStatus.hasTrainingTask) {
      const errorStatus = await trainingResource.hasErrors(
        { datasetId: params.datasetId },
        options
      );
      return {
        datasetId: params.datasetId,
        hasTrainingTask: false,
        hasError: errorStatus.hasError,
        elapsedMs
      };
    }

    if (timeoutMs > 0 && elapsedMs >= timeoutMs) {
      throw new FastGptTimeoutError({
        message: `Timed out waiting for dataset "${params.datasetId}" training queue after ${timeoutMs}ms`
      });
    }

    await sleepWithAbort(pollIntervalMs, options?.signal);
  }
};

/**
 * 知识库一键上传文件并创建集合（默认走 S3 预签名两阶段上传以透明支持大文件分片，可选等待训练完成）。
 */
export const uploadDatasetCollectionFile = async ({
  client,
  collectionsResource,
  filesResource,
  trainingResource,
  params,
  options
}: {
  client: BaseClient;
  collectionsResource: DatasetsCollectionsResource;
  filesResource: DatasetsFilesResource;
  trainingResource: DatasetsTrainingResource;
  params: UploadDatasetFileParams;
  options?: RequestOptions;
}): Promise<UploadDatasetFileResult> => {
  const {
    file,
    filename: explicitFilename,
    uploadStrategy = 'presign',
    onUploadProgress,
    retryBaseDelayMs,
    waitForTraining: waitConfig,
    ...createOptions
  } = params;

  const normalized = normalizeUploadableToBlob(file, explicitFilename ?? 'upload.bin');
  const finalFilename = explicitFilename ?? normalized.filename;

  // 1. 按所选策略上传文件并创建知识库集合
  const created = await (async (): Promise<{
    collectionId: string;
    fileKey?: string;
    previewUrl?: string;
    results: DatasetsCollectionsCreateByFileIdRes['results'];
  }> => {
    if (uploadStrategy === 'localFile') {
      const res = await collectionsResource.createByLocalFile(
        {
          ...createOptions,
          file: {
            data: normalized.blob,
            filename: finalFilename,
            ...(normalized.blob.type ? { contentType: normalized.blob.type } : {})
          }
        },
        options
      );
      return {
        collectionId: res.collectionId,
        results: res.results
      };
    }

    const session = await filesResource.presignUploadUrl(
      {
        datasetId: createOptions.datasetId,
        filename: finalFilename,
        size: normalized.blob.size
      },
      options
    );

    await uploadPresignedFile({
      client,
      session,
      blob: normalized.blob,
      onProgress: onUploadProgress,
      signal: options?.signal,
      timeoutMs: options?.timeoutMs,
      retryBaseDelayMs
    });

    const res = await collectionsResource.createByFileId(
      {
        ...createOptions,
        fileId: session.key
      },
      options
    );

    return {
      collectionId: res.collectionId,
      fileKey: session.key,
      previewUrl: session.previewUrl,
      results: res.results
    };
  })();

  // 2. 如调用方要求等待训练，则轮询集合训练详情直至入库完成
  if (waitConfig === false || waitConfig === undefined) {
    return created;
  }

  const training = await waitForCollectionTraining({
    collectionsResource,
    trainingResource,
    params: {
      collectionId: created.collectionId,
      ...(typeof waitConfig === 'object' ? waitConfig : {})
    },
    options
  });

  return {
    ...created,
    training
  };
};

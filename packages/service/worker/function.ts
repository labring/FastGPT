import type { SplitProps, SplitResponse } from '../common/string/textSplitter';
import { getWorkerController, WorkerNameEnum } from './utils';
import type { ReadFileResponse } from './readFile/type';
import { isTestEnv } from '@fastgpt/global/common/system/constants';
import { serviceEnv } from '../env';
import { uploadImage2S3Bucket } from '../common/s3/utils';
import { createOpaqueS3Filename } from '../common/s3/opaqueKey';
import { normalizeMimeType, resolveMimeExtension, resolveMimeType } from '../common/s3/utils/mime';
import path from 'node:path';
import {
  estimateFileParseMemoryBytes,
  estimateFileMaterializationMemoryBytes,
  fileParseResourceConstants,
  getFileParseMaxWorkers,
  getFileParseMemoryRule,
  getFileParseMemoryState,
  getUnknownFileParseBaseMemoryBytes
} from './fileParseResource';
import type { FileSource } from '../common/file/read/source';
import {
  resolveFileSourceDeclaredExtension,
  resolveFileSourceEncoding,
  resolveFileSourceExtension
} from '../common/file/read/source';
import { getLightweightWorkerPoolOptions } from './lightweightResource';

export const text2Chunks = async (props: SplitProps) => {
  // Test env, not run worker
  if (isTestEnv) {
    const { splitText2Chunks } = await import('../common/string/textSplitter');
    return splitText2Chunks(props);
  }
  return getWorkerController<SplitProps, SplitResponse>({
    name: WorkerNameEnum.text2Chunks,
    ...getLightweightWorkerPoolOptions<SplitProps>(),
    taskTimeoutMs: 300000,
    maxTasksPerWorker: 100
  }).run(props);
};

type ReadFileWorkerProps = {
  extension: string;
  encoding: string;
  buffer?: ArrayBuffer;
  sharedBuffer?: SharedArrayBuffer;
  bufferSize: number;
  initialResourceBytes?: number;
  sourceKind?: FileSource['kind'] | 'buffer';
  imageKeyOptions?: {
    prefix: string;
    expiredTime?: Date;
  };
};

const getReadFileWorker = () =>
  getWorkerController<ReadFileWorkerProps, ReadFileResponse>({
    name: WorkerNameEnum.readFile,
    maxReservedThreads: getFileParseMaxWorkers(),
    // 单任务超时：默认 600s（10min），由 PARSE_FILE_TIMEOUT_SECONDS（秒）配置
    taskTimeoutMs: serviceEnv.PARSE_FILE_TIMEOUT_SECONDS * 1000,
    // mammoth/xlsx/pdf-parse 历史上有 module 级缓存与潜在内存泄漏，定期回收 worker
    maxTasksPerWorker: 100,
    resourcePolicy: {
      getTaskResourceBytes: ({ extension, bufferSize, initialResourceBytes }) =>
        initialResourceBytes ??
        estimateFileParseMemoryBytes({ extension, fileSizeBytes: bufferSize }),
      getResourceSnapshot: () => {
        const memoryDetails = getFileParseMemoryState();
        return {
          availableResourceBytes: memoryDetails.currentlySchedulableMemoryBytes,
          maximumTaskResourceBytes: memoryDetails.maximumSafeTaskMemoryBytes,
          memoryDetails
        };
      },
      queueTimeoutMs: fileParseResourceConstants.queueTimeoutMs
    },
    // 扩展名集合由上传白名单约束，可作为结构化日志中稳定、低基数的任务类型。
    getTaskType: ({ extension }) => extension.replace(/^\./, '').toLowerCase() || 'unknown',
    idleWorkerTimeoutMs: fileParseResourceConstants.idleWorkerTimeoutMs,
    minIdleWorkers: fileParseResourceConstants.minIdleWorkers
  });

const createUploadFileHandler = (imageKeyOptions?: ReadFileWorkerProps['imageKeyOptions']) =>
  imageKeyOptions?.prefix
    ? async ({ name, mime, buffer }: { name: string; mime: string; buffer: ArrayBuffer }) => {
        const mimetype = normalizeMimeType(mime);
        if (!mimetype.startsWith('image/')) {
          throw new Error(`Unsupported worker uploadFile mime type: ${mimetype}`);
        }
        // uploadFile 是 worker 通用能力，主线程只接受文件名，避免 worker 传入路径片段越过 prefix。
        const filename = path.basename(name);
        const uploadFilename = createOpaqueS3Filename(resolveMimeExtension(mimetype));
        const key = await uploadImage2S3Bucket('private', {
          buffer: Buffer.from(buffer),
          uploadKey: `${imageKeyOptions.prefix}/${uploadFilename}`,
          mimetype: resolveMimeType([uploadFilename], mimetype),
          filename,
          expiredTime: imageKeyOptions.expiredTime
        });

        return { key };
      }
    : undefined;

/**
 * 把轻量 FileSource 提交给 readFile worker；只有任务获得 worker 和初始资源后才在主线程物化。
 *
 * S3 按可信大小一次性预留完整峰值。External HTTP 只按 base 启动，下载过程中执行两个硬限制并单调更新
 * 软预留；当前动态内存不足只会阻止后续任务，不会终止已经启动的下载。
 */
export const readRawContentFromSource = ({
  source,
  imageKeyOptions
}: {
  source: FileSource;
  imageKeyOptions?: ReadFileWorkerProps['imageKeyOptions'];
}) => {
  const initialExtension = resolveFileSourceDeclaredExtension(source.metadata);
  const initialResourceBytes = (() => {
    if (source.kind === 's3') {
      return Math.max(
        estimateFileParseMemoryBytes({
          extension: initialExtension,
          fileSizeBytes: source.sizeBytes
        }),
        estimateFileMaterializationMemoryBytes({
          extension: initialExtension,
          fileSizeBytes: source.sizeBytes
        })
      );
    }

    return initialExtension
      ? getFileParseMemoryRule(initialExtension).baseBytes
      : getUnknownFileParseBaseMemoryBytes();
  })();

  return getReadFileWorker().run(
    {
      extension: initialExtension,
      encoding: source.metadata.encoding ?? '',
      bufferSize: source.kind === 's3' ? source.sizeBytes : 0,
      initialResourceBytes,
      sourceKind: source.kind,
      imageKeyOptions
    },
    undefined,
    {
      uploadFile: createUploadFileHandler(imageKeyOptions),
      loadFile: async (controller, signal) => {
        const materialized = await source.materialize({
          signal,
          onReadBytes:
            source.kind === 'externalHttp'
              ? (readBytes) => {
                  controller.updateResourceBytes(
                    estimateFileMaterializationMemoryBytes({
                      extension: initialExtension,
                      fileSizeBytes: readBytes,
                      unknownUsesMaximumBase: true
                    })
                  );
                }
              : undefined
        });
        const finalExtension = resolveFileSourceExtension(materialized);
        if (!finalExtension) {
          throw new Error('Unable to determine a supported file extension from source metadata');
        }
        const finalEncoding = resolveFileSourceEncoding(materialized);

        if (source.kind === 'externalHttp') {
          const materializeBytes = estimateFileMaterializationMemoryBytes({
            extension: initialExtension,
            fileSizeBytes: materialized.buffer.length,
            unknownUsesMaximumBase: true
          });
          const parseBytes = estimateFileParseMemoryBytes({
            extension: finalExtension,
            fileSizeBytes: materialized.buffer.length
          });
          controller.updateResourceBytes(Math.max(materializeBytes, parseBytes));
        }

        const sourceArrayBuffer = materialized.buffer.buffer;
        const transferableBuffer =
          materialized.buffer.byteOffset === 0 &&
          materialized.buffer.byteLength === sourceArrayBuffer.byteLength &&
          sourceArrayBuffer instanceof ArrayBuffer
            ? sourceArrayBuffer
            : Uint8Array.from(materialized.buffer).buffer;

        return {
          buffer: transferableBuffer,
          bufferSize: materialized.buffer.length,
          metadata: {
            ...materialized.metadata,
            extension: finalExtension,
            encoding: finalEncoding
          }
        };
      }
    }
  );
};

export const readRawContentFromBuffer = (props: {
  extension: string;
  encoding: string;
  buffer: Buffer;
  imageKeyOptions?: {
    prefix: string;
    expiredTime?: Date;
  };
}) => {
  const bufferSize = props.buffer.length;
  const sourceArrayBuffer = props.buffer.buffer;
  const canTransferBuffer =
    props.buffer.byteOffset === 0 &&
    props.buffer.byteLength === sourceArrayBuffer.byteLength &&
    sourceArrayBuffer instanceof ArrayBuffer;

  const uploadFile = createUploadFileHandler(props.imageKeyOptions);

  if (canTransferBuffer) {
    /**
     * 大文件解析时优先 transfer 独占 ArrayBuffer，避免再复制一份 SharedArrayBuffer。
     * readFile worker 会消费输入 buffer，调用方不应在提交解析后继续复用该 buffer。
     */
    return getReadFileWorker().run(
      {
        extension: props.extension,
        encoding: props.encoding,
        buffer: sourceArrayBuffer,
        bufferSize,
        imageKeyOptions: props.imageKeyOptions
      },
      [sourceArrayBuffer],
      { uploadFile }
    );
  }

  const sharedBuffer = new SharedArrayBuffer(bufferSize);
  const sharedArray = new Uint8Array(sharedBuffer);
  sharedArray.set(props.buffer);

  return getReadFileWorker().run(
    {
      extension: props.extension,
      encoding: props.encoding,
      sharedBuffer,
      bufferSize,
      imageKeyOptions: props.imageKeyOptions
    },
    undefined,
    { uploadFile }
  );
};

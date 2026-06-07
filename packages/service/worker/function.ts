import {
  splitText2Chunks,
  type SplitProps,
  type SplitResponse
} from '@fastgpt/global/common/string/textSplitter';
import { getWorkerController, WorkerNameEnum } from './utils';
import type { ReadFileResponse } from './readFile/type';
import { isTestEnv } from '@fastgpt/global/common/system/constants';
import { serviceEnv } from '../env';
import { uploadImage2S3Bucket } from '../common/s3/utils';
import { normalizeMimeType, resolveMimeType } from '../common/s3/utils/mime';
import path from 'node:path';

export const text2Chunks = (props: SplitProps) => {
  // Test env, not run worker
  if (isTestEnv) {
    return splitText2Chunks(props);
  }
  return getWorkerController<SplitProps, SplitResponse>({
    name: WorkerNameEnum.text2Chunks,
    maxReservedThreads: serviceEnv.TEXT_TO_CHUNKS_WORKERS,
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
  imageKeyOptions?: {
    prefix: string;
    expiredTime?: Date;
  };
};

const getReadFileWorker = () =>
  getWorkerController<ReadFileWorkerProps, ReadFileResponse>({
    name: WorkerNameEnum.readFile,
    maxReservedThreads: serviceEnv.PARSE_FILE_WORKERS,
    // 单任务超时：默认 300s（5min），由 PARSE_FILE_TIMEOUT_SECONDS（秒）配置
    taskTimeoutMs: serviceEnv.PARSE_FILE_TIMEOUT_SECONDS * 1000,
    // mammoth/xlsx/pdf-parse 历史上有 module 级缓存与潜在内存泄漏，定期回收 worker
    maxTasksPerWorker: 100
  });

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

  const uploadFile = props.imageKeyOptions?.prefix
    ? async ({ name, mime, buffer }: { name: string; mime: string; buffer: ArrayBuffer }) => {
        const mimetype = normalizeMimeType(mime);
        if (!mimetype.startsWith('image/')) {
          throw new Error(`Unsupported worker uploadFile mime type: ${mimetype}`);
        }
        // uploadFile 是 worker 通用能力，主线程只接受文件名，避免 worker 传入路径片段越过 prefix。
        const filename = path.basename(name);
        const key = await uploadImage2S3Bucket('private', {
          buffer: Buffer.from(buffer),
          uploadKey: `${props.imageKeyOptions!.prefix}/${filename}`,
          mimetype: resolveMimeType([filename], mimetype),
          filename,
          expiredTime: props.imageKeyOptions?.expiredTime
        });

        return {
          key
        };
      }
    : undefined;

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

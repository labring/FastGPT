import {
  splitText2Chunks,
  type SplitProps,
  type SplitResponse
} from '@fastgpt/global/common/string/textSplitter';
import { getWorkerController, WorkerNameEnum } from './utils';
import type { ReadFileResponse } from './readFile/type';
import { isTestEnv } from '@fastgpt/global/common/system/constants';
import { serviceEnv } from '../env';

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

let readFileQueue: Promise<void> = Promise.resolve();

/**
 * 串行提交 readFile worker 任务。
 *
 * readFile worker 内部会加载 mammoth/xlsx/LiteParse 等解析库，这些库存在初始化缓存、
 * native 状态和内存峰值风险。文件解析通常不是高频轻量任务，这里在父进程统一串行提交，
 * 避免多种文件格式同时触发 worker 初始化或大文件 SharedArrayBuffer 复制。
 */
const runSerializedReadFile = async <T>(task: () => Promise<T>): Promise<T> => {
  const previousTask = readFileQueue;
  let releaseCurrentTask!: () => void;

  readFileQueue = new Promise<void>((resolve) => {
    releaseCurrentTask = resolve;
  });

  await previousTask;

  try {
    return await task();
  } finally {
    releaseCurrentTask();
  }
};

export const readRawContentFromBuffer = (props: {
  extension: string;
  encoding: string;
  buffer: Buffer;
}) => {
  const runTask = () => {
    const bufferSize = props.buffer.length;
    const sourceArrayBuffer = props.buffer.buffer;
    const canTransferBuffer =
      props.buffer.byteOffset === 0 &&
      props.buffer.byteLength === sourceArrayBuffer.byteLength &&
      sourceArrayBuffer instanceof ArrayBuffer;

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
          bufferSize
        },
        [sourceArrayBuffer]
      );
    }

    // SharedArrayBuffer 构造放在任务真正提交前，避免大文件并发排队时提前复制多份。
    const sharedBuffer = new SharedArrayBuffer(bufferSize);
    const sharedArray = new Uint8Array(sharedBuffer);
    sharedArray.set(props.buffer);

    return getReadFileWorker().run({
      extension: props.extension,
      encoding: props.encoding,
      sharedBuffer,
      bufferSize
    });
  };

  return runSerializedReadFile(runTask);
};

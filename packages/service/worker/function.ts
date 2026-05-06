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
  sharedBuffer: SharedArrayBuffer;
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

export const readRawContentFromBuffer = (props: {
  extension: string;
  encoding: string;
  buffer: Buffer;
}) => {
  const bufferSize = props.buffer.length;

  // 使用 SharedArrayBuffer，避免数据复制
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

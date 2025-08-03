import {
  splitText2Chunks,
  type SplitProps,
  type SplitResponse
} from '@fastgpt/global/common/string/textSplitter';
import { runWorker, WorkerNameEnum } from './utils';
import type { ReadFileResponse } from './readFile/type';
import { isTestEnv } from '@fastgpt/global/common/system/constants';

export const text2Chunks = (props: SplitProps) => {
  // Test env, not run worker
  if (isTestEnv) {
    return splitText2Chunks(props);
  }
  return runWorker<SplitResponse>(WorkerNameEnum.text2Chunks, props);
};

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

  return runWorker<ReadFileResponse>(WorkerNameEnum.readFile, {
    extension: props.extension,
    encoding: props.encoding,
    sharedBuffer: sharedBuffer,
    bufferSize: bufferSize
  });
};

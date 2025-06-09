import {
  splitText2Chunks,
  type SplitProps,
  type SplitResponse
} from '@fastgpt/global/common/string/textSplitter';
import { runWorker, WorkerNameEnum } from './utils';
import type { ReadFileResponse } from './readFile/type';

export const text2Chunks = (props: SplitProps) => {
  // Test env, not run worker
  if (process.env.NODE_ENV === 'test') {
    return splitText2Chunks(props);
  }
  return runWorker<SplitResponse>(WorkerNameEnum.text2Chunks, props);
};

export const readRawContentFromBuffer = (props: {
  extension: string;
  encoding: string;
  buffer: Buffer;
}) => {
  return runWorker<ReadFileResponse>(WorkerNameEnum.readFile, props);
};

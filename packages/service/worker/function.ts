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
  return runWorker<ReadFileResponse>(WorkerNameEnum.readFile, props);
};

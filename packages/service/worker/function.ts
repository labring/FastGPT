import type { SplitProps, SplitResponse } from '@fastgpt/global/common/string/textSplitter';
import { runWorker, WorkerNameEnum } from './utils';
import type { ReadFileResponse } from './readFile/type';

export const text2Chunks = (props: SplitProps) => {
  return runWorker<SplitResponse>(WorkerNameEnum.text2Chunks, props);
};

export const readRawContentFromBuffer = (props: {
  extension: string;
  encoding: string;
  buffer: Buffer;
}) => {
  return runWorker<ReadFileResponse>(WorkerNameEnum.readFile, props);
};

import { ReadFileByBufferParams } from '../../common/file/read/type';

export type ReadRawTextProps<T> = {
  csvFormat?: boolean;
  extension: string;
  buffer: T;
  encoding: string;
};

export type ReadRawTextByBuffer = ReadRawTextProps<Buffer>;

export type ReadFileResponse = {
  rawText: string;
  formatText?: string;
};

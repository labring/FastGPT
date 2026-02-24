import { ReadFileByBufferParams } from '../../common/file/read/type';

export type ReadRawTextProps<T> = {
  extension: string;
  buffer: T;
  encoding: string;
};

export type ReadRawTextByBuffer = ReadRawTextProps<Buffer>;

export type ImageType = {
  uuid: string;
  base64: string;
  mime: string;
};

export type ReadFileResponse = {
  rawText: string;
  formatText?: string;
  imageList?: ImageType[];
};

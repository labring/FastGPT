export type ReadRawTextProps<T> = {
  extension: string;
  buffer: T;
  encoding: string;
};

export type ReadRawTextByBuffer = ReadRawTextProps<Buffer>;

export type UploadedFileResult = {
  key: string;
  previewUrl?: string;
};

export type UploadFileHandler = (data: {
  name: string;
  mime: string;
  buffer: ArrayBuffer;
}) => Promise<UploadedFileResult>;

export type TextItem = {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  fontName?: string;
  fontSize?: number;
  confidence?: number;
};

export type ParsedPage = {
  pageNum: number;
  width: number;
  height: number;
  text: string;
  textItems: TextItem[];
};

export type ReadFileResponse = {
  rawText: string;
  formatText?: string;
};

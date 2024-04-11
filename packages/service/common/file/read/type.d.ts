export type ReadFileByBufferParams = {
  teamId: string;
  buffer: Buffer;
  encoding: string;
  metadata?: Record<string, any>;
};

export type ReadFileResponse = {
  rawText: string;
  formatText?: string;
  metadata?: Record<string, any>;
};

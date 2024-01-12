export type ReadFileParams = {
  preview: boolean;
  teamId: string;
  path: string;
  metadata?: Record<string, any>;
};

export type ReadFileResponse = {
  rawText: string;
};

export type ReadFileBufferItemType = ReadFileParams & {
  rawText: string;
};

declare global {
  var readFileBuffers: ReadFileBufferItemType[];
}

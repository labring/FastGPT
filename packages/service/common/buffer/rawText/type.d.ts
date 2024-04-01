export type RawTextBufferSchemaType = {
  sourceId: string;
  rawText: string;
  createTime: Date;
  metadata?: {
    filename: string;
  };
};

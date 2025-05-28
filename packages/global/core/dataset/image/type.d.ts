export type DatasetImageSchema = {
  _id: string;
  teamId: string;
  datasetId: string;
  collectionId?: string;
  createTime: Date;
  expiredTime: Date;
  size: number;
  name: string;
  path: string;
  contentType: string;
  metadata?: Record<string, any>;
};

// API请求参数类型
export type UploadDatasetImageProps = {
  datasetId: string;
  collectionId?: string;
};

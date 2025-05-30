export type DatasetImageSchema = {
  _id: string;
  teamId: string;
  datasetId: string;
  collectionId?: string;
  name: string;
  contentType: string;
  size: number;
  metadata?: Record<string, any>;
  expiredTime?: Date;
  createdAt: Date;
  updatedAt: Date;
};

// API请求参数类型
export type UploadDatasetImageProps = {
  datasetId: string;
  collectionId?: string;
};

export type S3TtlSchemaType = {
  _id: string;
  bucketName: string;
  minioKey: string;
  expiredTime: Date;
  /** 仅管理未接收上传或已提交删除的目录；已接收图片不保留逐对象记录。 */
  cleanupType?: 'collectionImageUpload' | 'collectionImagePrefix' | 'datasetPrefix' | 'datasetFile';
  cleanupClaimed?: boolean;
  multipart?: {
    uploadId: string;
    objectMarker?: string;
    totalSize?: number;
  };
};

export type S3TtlSchemaType = {
  _id: string;
  bucketName: string;
  minioKey: string;
  expiredTime: Date;
  /** 内嵌图片的持久归属；expiredTime 表示下一次引用检查时间。 */
  datasetInlineImage?: {
    teamId: string;
    datasetId: string;
    cleanupPending?: boolean;
  };
  multipart?: {
    uploadId: string;
    objectMarker?: string;
    totalSize?: number;
  };
};

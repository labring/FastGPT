export type S3TtlSchemaType = {
  _id: string;
  bucketName: string;
  minioKey: string;
  expiredTime: Date;
  multipart?: {
    uploadId: string;
    objectMarker?: string;
    totalSize?: number;
  };
};

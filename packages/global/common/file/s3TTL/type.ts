export type S3TtlSchemaType = {
  _id: string;
  bucketName: string;
  minioKey: string;
  expiredTime: Date;
};

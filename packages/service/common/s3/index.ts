import { S3Service } from './controller';

export const systemToolS3Service = new S3Service({
  bucket: process.env.S3_PLUGIN_BUCKET
});

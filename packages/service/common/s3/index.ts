import { S3Service } from './controller';

export const PluginS3Service = new S3Service({
  bucket: process.env.S3_PLUGIN_BUCKET,
  maxFileSize: 10 * 1024 * 1024 // 10MB
});

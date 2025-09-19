import { S3Service } from './controller';

export const PluginS3Service = (() => {
  if (!global.pluginS3Service) {
    global.pluginS3Service = new S3Service({
      bucket: process.env.S3_PLUGIN_BUCKET,
      maxFileSize: 10 * 1024 * 1024 // 10MB
    });
  }
  return global.pluginS3Service;
})();

declare global {
  var pluginS3Service: S3Service;
}

import { S3Service } from './controller';

export const PluginS3Service = (() => {
  if (!global.pluginS3Service) {
    global.pluginS3Service = new S3Service({
      bucket: process.env.S3_PLUGIN_BUCKET || 'fastgpt-plugin',
      maxFileSize: 50 * 1024 * 1024 // 50MB
    });
  }

  return global.pluginS3Service;
})();

declare global {
  var pluginS3Service: S3Service;
}

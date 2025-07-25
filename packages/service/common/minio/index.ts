import { Client } from 'minio';

export * from 'minio';
export { Client };

export const S3_ENDPOINT = process.env.S3_ENDPOINT || 'localhost';
export const S3_PORT = process.env.S3_PORT ? parseInt(process.env.S3_PORT) : 9000;
export const S3_USE_SSL = process.env.S3_USE_SSL === 'true';
export const S3_ACCESS_KEY = process.env.S3_ACCESS_KEY || 'minioadmin';
export const S3_SECRET_KEY = process.env.S3_SECRET_KEY || 'minioadmin';

export const connectionMinio = (() => {
  if (!global.minioClient) {
    global.minioClient = new Client({
      endPoint: S3_ENDPOINT,
      port: S3_PORT,
      useSSL: S3_USE_SSL,
      accessKey: S3_ACCESS_KEY,
      secretKey: S3_SECRET_KEY
    });
  }
  return global.minioClient;
})();

export const getMinioClient = () => connectionMinio;

export default connectionMinio;

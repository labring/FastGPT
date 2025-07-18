import { Client } from 'minio';

export * from 'minio';
export { Client };

export const MINIO_ENDPOINT = process.env.MINIO_ENDPOINT || 'localhost';
export const MINIO_PORT = process.env.MINIO_PORT ? parseInt(process.env.MINIO_PORT) : 9000;
export const MINIO_USE_SSL = process.env.MINIO_USE_SSL === 'true';
export const MINIO_ACCESS_KEY = process.env.MINIO_ACCESS_KEY || 'minioadmin';
export const MINIO_SECRET_KEY = process.env.MINIO_SECRET_KEY || 'minioadmin';

export const connectionMinio = (() => {
  if (!global.minioClient) {
    global.minioClient = new Client({
      endPoint: MINIO_ENDPOINT,
      port: MINIO_PORT,
      useSSL: MINIO_USE_SSL,
      accessKey: MINIO_ACCESS_KEY,
      secretKey: MINIO_SECRET_KEY
    });
  }
  return global.minioClient;
})();

export const getMinioClient = () => connectionMinio;

export default connectionMinio;

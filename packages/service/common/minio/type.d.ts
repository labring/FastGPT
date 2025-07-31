import type { Client } from 'minio';

declare global {
  var minioClient: Client;
}

import z from 'zod';
import { positiveNumber, urlWithDefault } from './primitives';

export const StorageConfigSchema = z.strictObject({
  downloadMode: z.enum(['short-proxy', 'short-redirect']).default('short-proxy'),
  // short-redirect 模式下客户端被重定向到的公开存储地址；空值时回落到 STORAGE_EXTERNAL_ENDPOINT
  externalEndpoint: urlWithDefault(),
  // 可选 CDN 地址，用于重写 pre-signed URL 的 host；空值时回落到 STORAGE_S3_CDN_ENDPOINT
  cdnEndpoint: urlWithDefault(),
  fileUrlExpiredDays: positiveNumber(90)
});

import z from 'zod';
import { positiveInteger, positiveNumber, urlWithDefault } from './primitives';

export const StorageConfigSchema = z.strictObject({
  downloadMode: z.enum(['short-proxy', 'short-redirect']).default('short-proxy'),
  // short-redirect 模式下客户端被重定向到的公开存储地址；空值表示未配置
  externalEndpoint: urlWithDefault(),
  // 可选 CDN 地址，用于重写 pre-signed URL 的 host；空值表示未配置
  cdnEndpoint: urlWithDefault(),
  fileUrlExpiredDays: positiveNumber(90),
  // short-redirect 302 预签名地址的临时有效期（秒），对应旧 STORAGE_DOWNLOAD_REDIRECT_TTL_SECONDS
  redirectTtlSeconds: positiveInteger(300)
});

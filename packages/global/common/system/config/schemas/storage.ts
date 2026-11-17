import z from 'zod';
import { isValidServiceBaseUrl } from '../../../string/url';
import { positiveNumber, urlWithDefault } from './primitives';

export const StorageConfigSchema = z.strictObject({
  // 指向 FastGPT 文件路由的公开地址；空值使用部署的站点访问地址。
  fileDomain: z
    .string()
    .trim()
    .refine((value) => value === '' || isValidServiceBaseUrl(value), {
      message: 'Expected an HTTP(S) file service URL without credentials, query or fragment'
    })
    .default(''),
  downloadMode: z.enum(['short-proxy', 'short-redirect']).default('short-proxy'),
  // short-redirect 模式下客户端被重定向到的公开存储地址；空值表示未配置
  externalEndpoint: urlWithDefault(),
  // 可选 CDN 地址，用于重写 pre-signed URL 的 host；空值表示未配置
  cdnEndpoint: urlWithDefault(),
  fileUrlExpiredDays: positiveNumber(90)
});

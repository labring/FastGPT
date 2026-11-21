import z from 'zod';
import { isValidServiceBaseUrl } from '../../../string/url';
import { positiveNumber, urlWithDefault } from './primitives';

export const StorageVendorSchema = z.enum(['minio', 'aws-s3', 'r2', 'cos', 'oss']);
export type StorageVendor = z.infer<typeof StorageVendorSchema>;

export const StorageVendorCapabilitiesSchema = z.object({
  vendor: StorageVendorSchema.meta({
    description: '当前部署环境配置的对象存储提供商',
    example: 'minio'
  }),
  supportsExternalEndpoint: z.boolean().meta({
    description: '是否支持配置存储服务外部访问端点（仅自建/S3 兼容 minio、aws-s3 支持）',
    example: true
  }),
  supportsCdnEndpoint: z.boolean().meta({
    description: '是否支持配置 CDN 加速地址（除 r2 外均支持）',
    example: true
  })
});
export type StorageVendorCapabilities = z.infer<typeof StorageVendorCapabilitiesSchema>;

/** 按部署侧 STORAGE_VENDOR 推导下载策略支持能力，前后端及配置校验共用同一口径。 */
export const getStorageVendorCapabilities = (vendor: StorageVendor): StorageVendorCapabilities => ({
  vendor,
  supportsExternalEndpoint: vendor === 'minio' || vendor === 'aws-s3',
  supportsCdnEndpoint: vendor !== 'r2'
});

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
  // short-redirect 模式下自建/S3 兼容存储（minio/aws-s3）对外签名的公开端点；托管云（r2/oss/cos）忽略该字段
  externalEndpoint: urlWithDefault(),
  // 可选 CDN 地址，用于重写 short-redirect 预签名 URL 的 host（r2 不支持）；空值表示未配置
  cdnEndpoint: urlWithDefault(),
  fileUrlExpiredDays: positiveNumber(90)
});

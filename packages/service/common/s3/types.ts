import type { ClientOptions } from 'minio';
import { HttpProxyAgent } from 'http-proxy-agent';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { z } from 'zod';

export const S3MetadataSchema = z.object({
  filename: z.string(),
  uploadedAt: z.date(),
  accessUrl: z.string(),
  contentType: z.string(),
  id: z.string().length(32),
  size: z.number().positive()
});
export type S3Metadata = z.infer<typeof S3MetadataSchema>;

export const Mimes = {
  '.gif': 'image/gif',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',

  '.csv': 'text/csv',
  '.txt': 'text/plain',

  '.pdf': 'application/pdf',
  '.zip': 'application/zip',
  '.json': 'application/json',
  '.doc': 'application/msword',
  '.js': 'application/javascript',
  '.xls': 'application/vnd.ms-excel',
  '.ppt': 'application/vnd.ms-powerpoint',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
} as const;
export type ContentType = (typeof Mimes)[keyof typeof Mimes];
export type ExtensionType = keyof typeof Mimes;

export const defaultS3Options: { externalBaseURL?: string; maxFileSize?: number } & ClientOptions =
  {
    maxFileSize: 1024 ** 3, // 1GB

    useSSL: process.env.S3_USE_SSL === 'true',
    endPoint: process.env.S3_ENDPOINT || 'localhost',
    externalBaseURL: process.env.S3_EXTERNAL_BASE_URL,
    accessKey: process.env.S3_ACCESS_KEY || 'minioadmin',
    secretKey: process.env.S3_SECRET_KEY || 'minioadmin',
    port: process.env.S3_PORT ? parseInt(process.env.S3_PORT) : 9000,
    transportAgent: process.env.HTTP_PROXY
      ? new HttpProxyAgent(process.env.HTTP_PROXY)
      : process.env.HTTPS_PROXY
        ? new HttpsProxyAgent(process.env.HTTPS_PROXY)
        : undefined
  };
export type S3Options = typeof defaultS3Options;

export const S3Buckets = {
  plugin: process.env.S3_PLUGIN_BUCKET || 'fastgpt-plugin',
  public: process.env.S3_PUBLIC_BUCKET || 'fastgpt-public',
  private: process.env.S3_PRIVATE_BUCKET || 'fastgpt-private'
} as const;
export type S3BucketName = (typeof S3Buckets)[keyof typeof S3Buckets];

export const S3SourcesSchema = z.enum([
  'avatar',
  'chat',
  'dataset',
  'dataset-image',
  'invoice',
  'rawtext',
  'temp'
]);
export const S3Sources = S3SourcesSchema.enum;
export type S3SourceType = z.infer<typeof S3SourcesSchema>;

export const CreateObjectKeyParamsSchema = z.object({
  filename: z.string().min(1),
  source: S3SourcesSchema,
  teamId: z.string().length(16)
});
export type CreateObjectKeyParams = z.infer<typeof CreateObjectKeyParamsSchema>;

export const CreatePostPresignedUrlParamsSchema = z.object({
  ...CreateObjectKeyParamsSchema.shape,
  visibility: z.enum(['public', 'private']).default('private')
});
export type CreatePostPresignedUrlParams = z.infer<typeof CreatePostPresignedUrlParamsSchema>;

export const CreatePostPresignedUrlOptionsSchema = z.object({
  temporay: z.boolean().optional()
});
export type CreatePostPresignedUrlOptions = z.infer<typeof CreatePostPresignedUrlOptionsSchema>;

export const CreatePostPresignedUrlResultSchema = z.object({
  url: z.string().min(1),
  fields: z.record(z.string(), z.string())
});
export type CreatePostPresignedUrlResult = z.infer<typeof CreatePostPresignedUrlResultSchema>;

export const S3APIPrefix = {
  avatar: '/api/system/img/'
} as const;
export type S3APIPrefixType = (typeof S3APIPrefix)[keyof typeof S3APIPrefix];

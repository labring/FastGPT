import { z } from 'zod';
import type { defaultS3Options, Mimes } from './constants';
import type { S3BaseBucket } from './buckets/base';

export const S3MetadataSchema = z.object({
  filename: z.string(),
  uploadedAt: z.date(),
  accessUrl: z.string(),
  contentType: z.string(),
  id: z.string().length(32),
  size: z.number().positive()
});
export type S3Metadata = z.infer<typeof S3MetadataSchema>;

export type ContentType = (typeof Mimes)[keyof typeof Mimes];
export type ExtensionType = keyof typeof Mimes;

export type S3OptionsType = typeof defaultS3Options;

export const S3SourcesSchema = z.enum(['avatar', 'chat', 'dataset', 'temp', 'rawText']);
export const S3Sources = S3SourcesSchema.enum;
export type S3SourceType = z.infer<typeof S3SourcesSchema>;

export const CreatePostPresignedUrlParamsSchema = z.object({
  filename: z.string().min(1),
  rawKey: z.string().min(1),
  metadata: z.record(z.string(), z.string()).optional()
});
export type CreatePostPresignedUrlParams = z.infer<typeof CreatePostPresignedUrlParamsSchema>;

export const CreatePostPresignedUrlOptionsSchema = z.object({
  expiredHours: z.number().positive().optional(), // TTL in Hours, default 7 * 24
  maxFileSize: z.number().positive().optional() // MB
});
export type CreatePostPresignedUrlOptions = z.infer<typeof CreatePostPresignedUrlOptionsSchema>;

export const CreatePostPresignedUrlResultSchema = z.object({
  url: z.string().nonempty(),
  fields: z.record(z.string(), z.string()),
  maxSize: z.number().positive().optional() // bytes
});
export type CreatePostPresignedUrlResult = z.infer<typeof CreatePostPresignedUrlResultSchema>;

export const CreateGetPresignedUrlParamsSchema = z.object({
  key: z.string().nonempty(),
  expiredHours: z.number().positive().optional()
});
export type createPreviewUrlParams = z.infer<typeof CreateGetPresignedUrlParamsSchema>;

export const UploadImage2S3BucketParamsSchema = z.object({
  base64Img: z.string().nonempty(),
  uploadKey: z.string().nonempty(),
  mimetype: z.string().nonempty(),
  filename: z.string().nonempty(),
  expiredTime: z.date().optional()
});
export type UploadImage2S3BucketParams = z.infer<typeof UploadImage2S3BucketParamsSchema>;

export const UploadFileByBufferSchema = z.object({
  buffer: z.instanceof(Buffer),
  contentType: z.string().optional(),
  key: z.string().nonempty()
});
export type UploadFileByBufferParams = z.infer<typeof UploadFileByBufferSchema>;

declare global {
  var s3BucketMap: {
    [key: string]: S3BaseBucket;
  };
}

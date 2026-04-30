import z from 'zod';
import { Readable } from 'node:stream';
import type { S3BaseBucket } from '../buckets/base';

export const S3MetadataSchema = z.object({
  filename: z.string(),
  uploadedAt: z.coerce.date(),
  accessUrl: z.string(),
  contentType: z.string(),
  id: z.string().length(32),
  size: z.number().positive()
});
export type S3Metadata = z.infer<typeof S3MetadataSchema>;

export type ContentType = string;
export type ExtensionType = `.${string}`;

export const UploadConstraintsSchema = z.object({
  defaultContentType: z.string().nonempty(),
  allowedExtensions: z.array(z.string().nonempty()).optional()
});
export type UploadConstraints = z.infer<typeof UploadConstraintsSchema>;

export const UploadConstraintsInputSchema = z.object({
  defaultContentType: z.string().nonempty().optional(),
  allowedExtensions: z.array(z.string().nonempty()).optional()
});
export type UploadConstraintsInput = z.infer<typeof UploadConstraintsInputSchema>;

export const S3SourcesSchema = z.enum([
  'avatar',
  'chat',
  'dataset',
  'temp',
  'rawText',
  'helperBot'
]);
export const S3Sources = S3SourcesSchema.enum;
export type S3SourceType = z.infer<typeof S3SourcesSchema>;

export const DownloadModeSchema = z.enum(['proxy', 'presigned']);
export type DownloadMode = z.infer<typeof DownloadModeSchema>;

export const CreatePostPresignedUrlParamsSchema = z.object({
  filename: z.string().min(1),
  rawKey: z.string().min(1),
  metadata: z.record(z.string(), z.string()).optional()
});
export type CreatePostPresignedUrlParams = z.infer<typeof CreatePostPresignedUrlParamsSchema>;

export const CreatePostPresignedUrlOptionsSchema = z.object({
  expiredHours: z.number().positive().optional().describe('小时'),
  maxFileSize: z.number().positive().optional().describe('MB'),
  uploadConstraints: UploadConstraintsInputSchema.optional()
});
export type CreatePostPresignedUrlOptions = z.infer<typeof CreatePostPresignedUrlOptionsSchema>;

export const CreatePostPresignedUrlResultSchema = z.object({
  url: z.string().nonempty(),
  key: z.string().nonempty(),
  headers: z.record(z.string(), z.string()),
  maxSize: z.number().positive().optional()
});
export type CreatePostPresignedUrlResult = z.infer<typeof CreatePostPresignedUrlResultSchema>;
export const CreateGetPresignedUrlParamsSchema = z.object({
  key: z.string().nonempty(),
  expiredHours: z.number().positive().optional(),
  mode: DownloadModeSchema.optional()
});
export type createPreviewUrlParams = z.infer<typeof CreateGetPresignedUrlParamsSchema>;

export const UploadImage2S3BucketParamsSchema = z.object({
  base64Img: z.string().nonempty(),
  uploadKey: z.string().nonempty(),
  mimetype: z.string().nonempty(),
  filename: z.string().nonempty(),
  expiredTime: z.coerce.date().optional()
});
export type UploadImage2S3BucketParams = z.infer<typeof UploadImage2S3BucketParamsSchema>;

export const UploadFileByBodySchema = z.object({
  body: z.union([z.instanceof(Buffer), z.string(), z.instanceof(Readable)]),
  contentType: z.string().optional(),
  key: z.string().nonempty(),
  filename: z.string().nonempty(),
  expiredTime: z.coerce.date().optional()
});
export type UploadFileByBodyParams = z.infer<typeof UploadFileByBodySchema>;
export type UploadFileByBufferParams = UploadFileByBodyParams;

declare global {
  var s3BucketMap: {
    [key: string]: S3BaseBucket;
  };
}

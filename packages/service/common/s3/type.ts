import { z } from 'zod';
import type { defaultS3Options, Mimes } from './constants';
import type { S3BaseBucket } from './buckets/base';
import { ObjectIdSchema } from '@fastgpt/global/common/type/mongo';

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

export const S3SourcesSchema = z.enum(['avatar', 'chat']);
export const S3Sources = S3SourcesSchema.enum;
export type S3SourceType = z.infer<typeof S3SourcesSchema>;

export const CreatePostPresignedUrlParamsSchema = z.union([
  // Option 1: Only rawKey
  z.object({
    filename: z.string().min(1),
    rawKey: z.string().min(1)
  }),
  // Option 2: filename with optional source and teamId
  z.object({
    filename: z.string().min(1),
    source: S3SourcesSchema.optional(),
    teamId: z.string().length(16).optional()
  })
]);
export type CreatePostPresignedUrlParams = z.infer<typeof CreatePostPresignedUrlParamsSchema>;

export const CreatePostPresignedUrlOptionsSchema = z.object({
  expiredHours: z.number().positive().optional() // TTL in Hours, default 7 * 24
});
export type CreatePostPresignedUrlOptions = z.infer<typeof CreatePostPresignedUrlOptionsSchema>;

export const CreatePostPresignedUrlResultSchema = z.object({
  url: z.string().min(1),
  fields: z.record(z.string(), z.string())
});
export type CreatePostPresignedUrlResult = z.infer<typeof CreatePostPresignedUrlResultSchema>;

export const CreateGetPresignedUrlParamsSchema = z.object({
  key: z.string().min(1),
  expiredHours: z.number().int().positive().optional()
});
export type CreateGetPresignedUrlParams = z.infer<typeof CreateGetPresignedUrlParamsSchema>;

export const CheckChatFileKeysSchema = z.object({
  appId: ObjectIdSchema,
  chatId: z.string().length(24),
  uId: z.string().min(1).max(24),
  filename: z.string().min(1)
});
export type CheckChatFileKeys = z.infer<typeof CheckChatFileKeysSchema>;

declare global {
  var s3BucketMap: {
    [key: string]: S3BaseBucket;
  };
}

import z from 'zod';
import { Readable } from 'node:stream';
import {
  UploadExtensionRuleSchema,
  UploadFileHintSchema,
  UploadPolicySchema
} from '../uploadPolicy/type';
import { assertStorageObjectKey } from '@fastgpt-sdk/storage';

/** FastGPT 入口与底层 Storage SDK 共用同一套对象 key 规范。 */
export const StorageObjectKeySchema = z.string().superRefine((key, context) => {
  try {
    assertStorageObjectKey(key);
  } catch (error) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: error instanceof Error ? error.message : 'Invalid storage object key'
    });
  }
});

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

export const UploadConstraintsSchema = UploadPolicySchema;
export type UploadConstraints = z.infer<typeof UploadConstraintsSchema>;

export const UploadConstraintsInputSchema = z.object({
  defaultContentType: z.string().nonempty().optional(),
  allowedExtensions: z.array(z.string().nonempty()).optional(),
  extensionRules: z.array(UploadExtensionRuleSchema).optional()
});
export type UploadConstraintsInput = z.infer<typeof UploadConstraintsInputSchema>;

export const S3SourcesSchema = z.enum(['avatar', 'chat', 'dataset', 'temp', 'rawText']);
export const S3Sources = S3SourcesSchema.enum;
export type S3SourceType = z.infer<typeof S3SourcesSchema>;

export const StorageDownloadUrlModeSchema = z.enum(['short-proxy', 'short-redirect']);
export type StorageDownloadUrlMode = z.infer<typeof StorageDownloadUrlModeSchema>;

export const CreatePostPresignedUrlParamsSchema = z.object({
  filename: z.string().min(1),
  rawKey: StorageObjectKeySchema,
  contentType: UploadFileHintSchema.shape.contentType,
  declaredExtension: UploadFileHintSchema.shape.declaredExtension,
  declaredFilename: UploadFileHintSchema.shape.declaredFilename,
  source: UploadFileHintSchema.shape.source,
  size: UploadFileHintSchema.shape.size,
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
  previewUrl: z.string().nonempty(),
  maxSize: z.number().positive().optional()
});
export type CreatePostPresignedUrlResult = z.infer<typeof CreatePostPresignedUrlResultSchema>;
export const CreateGetPresignedUrlParamsSchema = z.object({
  key: StorageObjectKeySchema,
  expiredHours: z.number().positive().optional(),
  responseContentType: z.string().nonempty().optional()
});
export type createPreviewUrlParams = z.infer<typeof CreateGetPresignedUrlParamsSchema>;

export const UploadImage2S3BucketParamsSchema = z
  .object({
    base64Img: z.string().nonempty().optional(),
    buffer: z.instanceof(Buffer).optional(),
    uploadKey: StorageObjectKeySchema,
    mimetype: z.string().nonempty(),
    filename: z.string().nonempty(),
    expiredTime: z.coerce.date().optional()
  })
  .refine((value) => value.base64Img || value.buffer, {
    message: 'base64Img or buffer is required'
  });
export type UploadImage2S3BucketParams = z.infer<typeof UploadImage2S3BucketParamsSchema>;

export const UploadFileByBodySchema = z.object({
  body: z.union([z.instanceof(Buffer), z.string(), z.instanceof(Readable)]),
  contentType: z.string().optional(),
  key: StorageObjectKeySchema,
  filename: z.string().nonempty(),
  expiredTime: z.coerce.date().optional()
});
export type UploadFileByBodyParams = z.infer<typeof UploadFileByBodySchema>;
export type UploadFileByBufferParams = UploadFileByBodyParams;

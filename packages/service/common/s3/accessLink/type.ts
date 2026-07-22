import z from 'zod';
import { StorageObjectKeySchema, UploadConstraintsSchema } from '../contracts/type';
import { UploadFileHintSchema, UploadPolicySchema } from '../uploadPolicy/type';
import { S3_DOWNLOAD_URL_BATCH_MAX_SIZE } from '@fastgpt-sdk/storage/access-link';

const UrlSafeTokenSchema = z.string().regex(/^[A-Za-z0-9_-]+$/);
const HexSha256Schema = z
  .string()
  .length(64)
  .regex(/^[a-f0-9]+$/);

export const S3AccessBucketNameSchema = z.string().min(1);
export const S3AccessObjectKeySchema = StorageObjectKeySchema;

export const S3DownloadAliasIdSchema = UrlSafeTokenSchema.min(12).max(32);
export const S3DownloadAliasKeySchema = HexSha256Schema;
export const S3DownloadExpiresMinuteSchema = z
  .string()
  .min(1)
  .max(8)
  .regex(/^[0-9a-z]+$/);
export const S3DownloadSignatureSchema = UrlSafeTokenSchema.min(16).max(64);
export const S3SignedDownloadAliasValueSchema = z
  .string()
  .regex(/^[A-Za-z0-9_-]{12,32}\.[0-9a-z]{1,8}\.[A-Za-z0-9_-]{16,64}$/);

export const S3DownloadAliasSchema = z.object({
  aliasId: S3DownloadAliasIdSchema,
  aliasKey: S3DownloadAliasKeySchema,
  bucketName: S3AccessBucketNameSchema,
  objectKey: S3AccessObjectKeySchema,
  filename: z.string().min(1).optional(),
  responseContentType: z.string().min(1).optional(),
  createTime: z.coerce.date(),
  updateTime: z.coerce.date(),
  lastIssuedAt: z.coerce.date(),
  purgeAt: z.coerce.date(),
  disabledAt: z.coerce.date().optional()
});
export type S3DownloadAliasType = z.infer<typeof S3DownloadAliasSchema>;

export const CreateS3DownloadAccessUrlParamsSchema = z.object({
  bucketName: S3AccessBucketNameSchema,
  objectKey: S3AccessObjectKeySchema,
  expiredTime: z.coerce.date(),
  filename: z.string().min(1).optional(),
  responseContentType: z.string().min(1).optional()
});
export type CreateS3DownloadAccessUrlParams = z.infer<typeof CreateS3DownloadAccessUrlParamsSchema>;
export const CreateS3DownloadAccessUrlsParamsSchema = z
  .array(CreateS3DownloadAccessUrlParamsSchema)
  .max(S3_DOWNLOAD_URL_BATCH_MAX_SIZE);

export const ParsedS3SignedDownloadAliasSchema = z.object({
  aliasId: S3DownloadAliasIdSchema,
  expMinute36: S3DownloadExpiresMinuteSchema,
  sig: S3DownloadSignatureSchema
});
export type ParsedS3SignedDownloadAlias = z.infer<typeof ParsedS3SignedDownloadAliasSchema>;

export const S3ProxyDownloadPayloadSchema = z.object({
  bucketName: S3AccessBucketNameSchema,
  objectKey: S3AccessObjectKeySchema,
  filename: z.string().min(1).optional(),
  responseContentType: z.string().min(1).optional()
});
export type S3ProxyDownloadPayload = z.infer<typeof S3ProxyDownloadPayloadSchema>;

export const VerifiedS3DownloadAccessSchema = S3ProxyDownloadPayloadSchema.extend({
  expiresAt: z.coerce.date()
});
export type VerifiedS3DownloadAccess = z.infer<typeof VerifiedS3DownloadAccessSchema>;

export const S3UploadTokenSchema = UrlSafeTokenSchema.min(20).max(64);
export const S3UploadTokenHashSchema = HexSha256Schema;

export const S3UploadSessionSchema = z.object({
  tokenHash: S3UploadTokenHashSchema,
  bucketName: S3AccessBucketNameSchema,
  objectKey: S3AccessObjectKeySchema,
  maxSize: z.number().positive(),
  uploadConstraints: UploadConstraintsSchema,
  uploadPolicy: UploadPolicySchema.optional(),
  fileHint: UploadFileHintSchema.optional(),
  metadata: z.record(z.string(), z.string()).optional(),
  createTime: z.coerce.date(),
  expiresAt: z.coerce.date(),
  usedAt: z.coerce.date().optional(),
  revokedAt: z.coerce.date().optional()
});
export type S3UploadSessionType = z.infer<typeof S3UploadSessionSchema>;

export const CreateS3UploadAccessUrlParamsSchema = z.object({
  bucketName: S3AccessBucketNameSchema,
  objectKey: S3AccessObjectKeySchema,
  expiredTime: z.coerce.date(),
  maxSize: z.number().positive(),
  uploadConstraints: UploadConstraintsSchema,
  uploadPolicy: UploadPolicySchema.optional(),
  fileHint: UploadFileHintSchema.optional(),
  metadata: z.record(z.string(), z.string()).optional()
});
export type CreateS3UploadAccessUrlParams = z.infer<typeof CreateS3UploadAccessUrlParamsSchema>;

export const S3ProxyUploadPayloadSchema = S3UploadSessionSchema.pick({
  bucketName: true,
  objectKey: true,
  maxSize: true,
  uploadConstraints: true,
  uploadPolicy: true,
  fileHint: true,
  metadata: true
});
export type S3ProxyUploadPayload = z.infer<typeof S3ProxyUploadPayloadSchema>;

export const S3DownloadAccessRouteQuerySchema = z.object({
  signedAlias: S3SignedDownloadAliasValueSchema
});

export const S3UploadAccessRouteQuerySchema = z.object({
  token: S3UploadTokenSchema
});

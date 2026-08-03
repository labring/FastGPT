import z from 'zod';
import { IntSchema } from '../../zod';

export const PresignFileUploadParamsSchema = z.object({
  filename: z.string().min(1),
  size: IntSchema.optional()
});
export type PresignFileUploadParams = z.infer<typeof PresignFileUploadParamsSchema>;

const CreatePostPresignedUrlBaseResponseSchema = z.object({
  url: z.string().nonempty(),
  key: z.string().nonempty(),
  headers: z.record(z.string(), z.string()),
  previewUrl: z.string().nonempty(),
  maxSize: z.number().positive().optional() // bytes
});

export const CreatePostPresignedUrlSingleResponseSchema =
  CreatePostPresignedUrlBaseResponseSchema.extend({
    uploadMode: z.literal('single').meta({ description: '单请求 PUT 上传' })
  });

export const CreatePostPresignedUrlMultipartResponseSchema =
  CreatePostPresignedUrlBaseResponseSchema.extend({
    uploadMode: z.literal('multipart').meta({ description: 'Multipart 分片上传' }),
    completeUrl: z.string().min(1).meta({ description: '完成 Multipart 上传的接口地址' }),
    abortUrl: z.string().min(1).meta({ description: '取消 Multipart 上传的接口地址' }),
    partSize: IntSchema.positive().meta({
      example: 8388608,
      description: '单个分片大小，单位 byte'
    }),
    concurrency: IntSchema.positive().meta({
      example: 3,
      description: '建议的并发分片数'
    }),
    maxRetry: IntSchema.meta({ example: 3, description: '单个分片最大重试次数' })
  });

export const CreatePostPresignedUrlResponseSchema = z
  .discriminatedUnion('uploadMode', [
    CreatePostPresignedUrlSingleResponseSchema,
    CreatePostPresignedUrlMultipartResponseSchema
  ])
  .meta({ description: 'S3 单 PUT 或 Multipart 上传参数' });

export type CreatePostPresignedUrlResponseType = z.infer<
  typeof CreatePostPresignedUrlResponseSchema
>;

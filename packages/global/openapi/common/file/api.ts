import { z } from 'zod';
import { BoolSchema } from '../../../common/zod';
import {
  CreatePostPresignedUrlResponseSchema,
  PresignFileUploadParamsSchema
} from '../../../common/file/s3/type';

/* ============================================================================
 * API: 获取头像上传预签名 URL
 * Route: POST /api/common/file/presignAvatarPostUrl
 * Method: POST
 * Description: 为当前团队生成头像文件上传预签名 URL
 * Tags: ['文件管理', 'Write']
 * ============================================================================ */

export const PresignAvatarPostUrlBodySchema = PresignFileUploadParamsSchema.extend({
  filename: PresignFileUploadParamsSchema.shape.filename.meta({
    example: 'avatar.png',
    description: '待上传的头像文件名'
  }),
  size: PresignFileUploadParamsSchema.shape.size.meta({
    example: 1048576,
    description: '头像文件大小，单位 byte'
  }),
  autoExpired: BoolSchema.optional().meta({
    example: true,
    description: '头像文件是否按临时资源自动过期'
  })
});
export type PresignAvatarPostUrlBody = z.infer<typeof PresignAvatarPostUrlBodySchema>;

export const PresignAvatarPostUrlResponseSchema = CreatePostPresignedUrlResponseSchema.meta({
  description: '头像文件的单 PUT 或 Multipart 上传参数'
});
export type PresignAvatarPostUrlResponse = z.infer<typeof PresignAvatarPostUrlResponseSchema>;

/* ============================================================================
 * API: 获取临时文件上传预签名 URL
 * Route: POST /api/common/file/presignTempFilePostUrl
 * Method: POST
 * Description: 为当前团队生成一小时有效的临时文件上传预签名 URL
 * Tags: ['文件管理', 'Write']
 * ============================================================================ */

export const PresignTempFilePostUrlBodySchema = PresignFileUploadParamsSchema.extend({
  filename: PresignFileUploadParamsSchema.shape.filename.meta({
    example: 'document.pdf',
    description: '待上传的临时文件名'
  }),
  size: PresignFileUploadParamsSchema.shape.size.meta({
    example: 5242880,
    description: '临时文件大小，单位 byte'
  })
});
export type PresignTempFilePostUrlBody = z.infer<typeof PresignTempFilePostUrlBodySchema>;

export const PresignTempFilePostUrlResponseSchema = CreatePostPresignedUrlResponseSchema.meta({
  description: '临时文件的单 PUT 或 Multipart 上传参数'
});
export type PresignTempFilePostUrlResponse = z.infer<typeof PresignTempFilePostUrlResponseSchema>;

/* ============================================================================
 * API: 读取文件
 * Route: GET /api/common/file/read/{filename}
 * Method: GET
 * Description: 使用文件访问 token 读取或下载知识库文件
 * Tags: ['文件管理', 'Read']
 * ============================================================================ */

export const ReadCommonFilePathSchema = z.object({
  filename: z.string().min(1).meta({
    example: 'document.pdf',
    description: '下载时展示的文件名'
  })
});
export type ReadCommonFilePath = z.infer<typeof ReadCommonFilePathSchema>;

export const ReadCommonFileQuerySchema = z.object({
  token: z.string().min(1).meta({
    example: 'eyJhbGciOiJIUzI1NiJ9...',
    description: '服务端签发的文件访问 token'
  })
});
export type ReadCommonFileQuery = z.infer<typeof ReadCommonFileQuerySchema>;

// Next.js Pages Router 会把动态路径参数和 query 合并到 req.query，路由边界使用该 schema 校验。
export const ReadCommonFileRequestQuerySchema = ReadCommonFilePathSchema.extend({
  token: ReadCommonFileQuerySchema.shape.token
});
export type ReadCommonFileRequestQuery = z.infer<typeof ReadCommonFileRequestQuerySchema>;

export const ReadCommonFileResponseSchema = z.string().meta({
  description: '文件二进制内容；Content-Type 和 Content-Disposition 由文件元数据决定'
});
export type ReadCommonFileResponse = z.infer<typeof ReadCommonFileResponseSchema>;

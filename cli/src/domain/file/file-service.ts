import { imageBaseUrl } from '@fastgpt/global/common/file/image/constants';
import {
  PresignAvatarPostUrlBodySchema,
  PresignAvatarPostUrlResponseSchema
} from '@fastgpt/global/openapi/common/file/api';
import type { LoadedBinaryFile } from '../../infra/fs/file-io';
import type { FastGptHttpClient } from '../../infra/http/fastgpt-http-client';
import { CliApiError, CliArgumentError } from '../../shared/errors';
import { isPlainObject, trimIfString } from '../../shared/input';
import { createChangedResult, createDryRunResult } from '../../shared/result';
import type { CliResult } from '../../shared/types';

const AVATAR_ALLOWED_EXTENSIONS = ['.jpg', '.jpeg', '.png'] as const;
const MAX_AVATAR_BYTES = 5 * 1024 * 1024;

export type UploadAvatarResultData = {
  avatar: string;
  key: string;
  previewUrl: string;
  filename: string;
  sizeBytes: number;
  autoExpired: boolean;
};

export type FileService = {
  uploadAvatar: (params: {
    client: FastGptHttpClient;
    file: LoadedBinaryFile;
    filenameOverride?: string;
    autoExpired?: boolean;
    dryRun?: boolean;
  }) => Promise<CliResult>;
};

function hasAllowedAvatarExtension(filename: string): boolean {
  const lower = filename.toLowerCase();
  return AVATAR_ALLOWED_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

/**
 * FastGPT 通用文件领域服务：封装预签名头像上传，返回可直接写入 app/dataset/skill 的标准 `avatar` 路径。
 */
export function createFileService(): FileService {
  return {
    uploadAvatar: async ({ client, file, filenameOverride, autoExpired = true, dryRun }) => {
      const filename = trimIfString(filenameOverride) || file.filename;

      if (!hasAllowedAvatarExtension(filename)) {
        throw new CliArgumentError(
          `Avatar file "${filename}" has an unsupported extension.`,
          undefined,
          'Avatar files must end with .jpg, .jpeg, or .png (max 5 MB).'
        );
      }

      if (file.size <= 0) {
        throw new CliArgumentError('Avatar file cannot be empty.');
      }

      if (file.size > MAX_AVATAR_BYTES) {
        throw new CliArgumentError(
          `Avatar file "${filename}" exceeds the 5 MB limit (${file.size} bytes).`,
          undefined,
          'Resize or compress the image to 5 MB or smaller and try again.'
        );
      }

      const validatedBody = PresignAvatarPostUrlBodySchema.parse({
        filename,
        size: file.size,
        autoExpired
      });

      if (dryRun) {
        return createDryRunResult({
          operation: 'file upload-avatar',
          risk: 'write',
          preview: {
            method: 'POST',
            path: '/common/file/presignAvatarPostUrl',
            payload: validatedBody,
            sizeBytes: file.size,
            mimeType: file.mimeType
          }
        });
      }

      const rawPresign = await client.request<unknown>({
        method: 'POST',
        path: '/common/file/presignAvatarPostUrl',
        body: validatedBody
      });

      // 兼容未声明 uploadMode 的旧服务端响应，默认按单请求 PUT 模式处理。
      const normalizedPresign =
        isPlainObject(rawPresign) && rawPresign.uploadMode === undefined
          ? { ...rawPresign, uploadMode: 'single' }
          : rawPresign;
      const presigned = PresignAvatarPostUrlResponseSchema.parse(normalizedPresign);

      if (presigned.maxSize !== undefined && file.size > presigned.maxSize) {
        throw new CliArgumentError(
          `Avatar file "${filename}" (${file.size} bytes) exceeds server maxSize (${presigned.maxSize} bytes).`
        );
      }

      if (presigned.uploadMode !== 'single') {
        throw new CliApiError({
          message: `Unsupported avatar uploadMode "${presigned.uploadMode}" returned by server.`
        });
      }

      await client.putPresignedUrl({
        url: presigned.url,
        body: file.data,
        headers: presigned.headers
      });

      // 必须返回 `/api/system/img/<key>` 形式的 avatar 路径，供应用/知识库/技能保存时触发 refreshAvatar 清除临时 TTL。
      const avatar = `${imageBaseUrl}${presigned.key}`;
      const data: UploadAvatarResultData = {
        avatar,
        key: presigned.key,
        previewUrl: presigned.previewUrl,
        filename,
        sizeBytes: file.size,
        autoExpired
      };

      return createChangedResult({
        data,
        message: `Avatar "${filename}" uploaded (${avatar}).`
      });
    }
  };
}

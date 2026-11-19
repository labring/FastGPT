import type { BaseClient } from '../core/baseClient';
import { normalizeUploadableToBlob } from '../core/multipart';
import type { RequestOptions, Uploadable } from '../core/types';
import type { ChatFilesResource } from '../generated/resources';
import type { ChatFilesPresignUploadUrlReq } from '../generated/types';
import { uploadPresignedFile, type UploadProgressInfo } from './s3Uploader';

const IMAGE_EXTENSION_RE = /\.(?:png|jpe?g|gif|webp|bmp|svg|avif|ico|tiff?)$/i;

export type ChatImageContentPart = {
  type: 'image_url';
  image_url: {
    url: string;
    detail?: 'auto' | 'low' | 'high';
  };
  key: string;
};

export type ChatFileContentPart = {
  type: 'file_url';
  name: string;
  url: string;
  key: string;
};

export type ChatUploadedContentPart = ChatImageContentPart | ChatFileContentPart;

export type UploadChatFileParams = {
  /** 对话 ID */
  chatId: string;
  /** 应用 ID（应用 API Key 或已配置 defaultAppId 时可省略） */
  appId?: string;
  /** 待上传的文件内容 */
  file: Uploadable;
  /** 显式覆盖上传文件名 */
  filename?: string;
  /** 显式指定 MIME 类型（未指定时复用 Blob.type） */
  contentType?: string;
  /** 无后缀来源显式声明的扩展名 */
  declaredExtension?: string;
  /** 无稳定文件名来源显式声明的文件名 */
  declaredFilename?: string;
  /** 外部使用者标识 */
  customUid?: string;
  /** 团队成员代理身份 */
  authProxy?: ChatFilesPresignUploadUrlReq['authProxy'];
  /** 上传进度回调 */
  onUploadProgress?: (progress: UploadProgressInfo) => void;
  /** Multipart 分片重试退避基础延迟（毫秒） */
  retryBaseDelayMs?: number;
};

export type UploadChatFileResult = {
  key: string;
  previewUrl: string;
  filename: string;
  contentType?: string;
  size: number;
  fileKind: 'image' | 'file';
  /** 生成可直接传入 chat.completionsV2({ messages }) 的标准多模态消息块 */
  toContentPart: (options?: { imageDetail?: 'auto' | 'low' | 'high' }) => ChatUploadedContentPart;
};

const detectChatFileKind = ({
  filename,
  contentType
}: {
  filename: string;
  contentType?: string;
}): 'image' | 'file' => {
  if (contentType !== undefined && contentType.toLowerCase().startsWith('image/')) {
    return 'image';
  }
  if (IMAGE_EXTENSION_RE.test(filename)) {
    return 'image';
  }
  return 'file';
};

/**
 * 一键上传对话附件（自动走 presignUploadUrl + 单 PUT/Multipart 上传），
 * 并返回可直接拼入 `chat.completionsV2` 多模态消息体的 `toContentPart()` 构造器。
 */
export const uploadChatAttachment = async ({
  client,
  chatFilesResource,
  params,
  options
}: {
  client: BaseClient;
  chatFilesResource: ChatFilesResource;
  params: UploadChatFileParams;
  options?: RequestOptions;
}): Promise<UploadChatFileResult> => {
  const normalized = normalizeUploadableToBlob(params.file, params.filename ?? 'attachment.bin');
  const finalFilename = params.filename ?? normalized.filename;
  const effectiveContentType = params.contentType ?? (normalized.blob.type || undefined);

  // 1. 向服务端申请预签名上传会话（根据文件大小自动决定单 PUT 或 Multipart）
  const session = await chatFilesResource.presignUploadUrl(
    {
      chatId: params.chatId,
      filename: finalFilename,
      size: normalized.blob.size,
      ...(params.appId !== undefined ? { appId: params.appId } : {}),
      ...(effectiveContentType !== undefined ? { contentType: effectiveContentType } : {}),
      ...(params.declaredExtension !== undefined
        ? { declaredExtension: params.declaredExtension }
        : {}),
      ...(params.declaredFilename !== undefined
        ? { declaredFilename: params.declaredFilename }
        : {}),
      ...(params.customUid !== undefined ? { customUid: params.customUid } : {}),
      ...(params.authProxy !== undefined ? { authProxy: params.authProxy } : {})
    },
    options
  );

  // 2. 通过标准 Web S3 上传器执行真实字节传输
  await uploadPresignedFile({
    client,
    session,
    blob: normalized.blob,
    onProgress: params.onUploadProgress,
    signal: options?.signal,
    timeoutMs: options?.timeoutMs,
    retryBaseDelayMs: params.retryBaseDelayMs
  });

  const fileKind = detectChatFileKind({
    filename: finalFilename,
    contentType: effectiveContentType
  });

  return {
    key: session.key,
    previewUrl: session.previewUrl,
    filename: finalFilename,
    ...(effectiveContentType !== undefined ? { contentType: effectiveContentType } : {}),
    size: normalized.blob.size,
    fileKind,
    toContentPart: (partOptions) => {
      if (fileKind === 'image') {
        return {
          type: 'image_url',
          image_url: {
            url: session.previewUrl,
            ...(partOptions?.imageDetail !== undefined ? { detail: partOptions.imageDetail } : {})
          },
          key: session.key
        };
      }
      return {
        type: 'file_url',
        name: finalFilename,
        url: session.previewUrl,
        key: session.key
      };
    }
  };
};

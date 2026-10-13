import { documentFileExtensions } from '@fastgpt/global/common/file/constants';
import {
  detectFileEncoding,
  parseContentDispositionFilename
} from '@fastgpt/global/common/file/tools';
import type { Readable } from 'node:stream';
import path from 'node:path';
import { readStreamToBuffer } from '../../s3/utils';
import { DEFAULT_CONTENT_TYPE, normalizeMimeType, resolveMimeExtension } from '../../s3/utils/mime';
import { readExternalFileBuffer } from './external';
import { isLikelyTextBuffer } from './text';

const documentExtensionSet = new Set(
  documentFileExtensions.map((extension) => extension.replace(/^\./, '').toLowerCase())
);

export type FileSourceMetadata = {
  filename?: string;
  contentType?: string;
  extension?: string;
  encoding?: string;
};

export type MaterializedFileSource = {
  buffer: Buffer;
  metadata: FileSourceMetadata;
};

export type MaterializeFileSourceOptions = {
  signal: AbortSignal;
  /** 在当前累计字节进入 chunks 前同步执行，可抛出硬限制错误终止读取。 */
  onReadBytes?: (readBytes: number) => void;
};

type FileSourceBase = {
  metadata: FileSourceMetadata;
  /** 每次调用都重新打开来源，不能缓存已 transfer 的 Buffer。 */
  materialize: (options: MaterializeFileSourceOptions) => Promise<MaterializedFileSource>;
};

export type S3FileSource = FileSourceBase & {
  kind: 's3';
  /** S3 HEAD Object 返回的可信 Content-Length。 */
  sizeBytes: number;
};

export type ExternalHttpFileSource = FileSourceBase & {
  kind: 'externalHttp';
  /** 已鉴权业务入口计算的单文件上限，单位为字节。 */
  maxSizeBytes: number;
};

export type FileSource = S3FileSource | ExternalHttpFileSource;

const normalizeExtension = (extension?: string) => {
  const normalized = extension?.trim().toLowerCase().replace(/^\./, '') ?? '';
  if (normalized === 'markdown') return 'md';
  if (normalized === 'htm') return 'html';
  return normalized;
};

const getFilenameExtension = (filename?: string) =>
  normalizeExtension(path.extname(filename ?? ''));

/** 不读取文件内容，仅从来源声明元数据得到初始调度扩展名。 */
export const resolveFileSourceDeclaredExtension = (metadata: FileSourceMetadata) => {
  const explicitExtension = normalizeExtension(metadata.extension);
  if (explicitExtension) return explicitExtension;

  const filenameExtension = getFilenameExtension(metadata.filename);
  if (filenameExtension) return filenameExtension;

  const normalizedContentType = normalizeMimeType(metadata.contentType, '');
  const mimeExtension = normalizeExtension(resolveMimeExtension(normalizedContentType));
  if (documentExtensionSet.has(mimeExtension)) return mimeExtension;
  if (normalizedContentType.startsWith('text/')) return 'txt';
  return '';
};

/**
 * 根据最终响应元数据和内容确定 readFile worker 使用的扩展名。
 *
 * 显式但不支持的扩展名会原样返回，由 worker 输出清晰的不支持错误；只有完全没有扩展名时才使用 MIME
 * 和轻量文本探测，二进制 octet-stream 不猜测 Office 等格式。
 */
export const resolveFileSourceExtension = ({
  metadata,
  buffer
}: {
  metadata: FileSourceMetadata;
  buffer: Buffer;
}) => {
  const declaredExtension = resolveFileSourceDeclaredExtension(metadata);
  if (declaredExtension) return declaredExtension;

  const normalizedContentType = normalizeMimeType(metadata.contentType, '');
  const mimeExtension = normalizeExtension(resolveMimeExtension(normalizedContentType));
  if (documentExtensionSet.has(mimeExtension)) return mimeExtension;
  if (normalizedContentType.startsWith('text/')) return 'txt';

  if (
    (!normalizedContentType || normalizedContentType === DEFAULT_CONTENT_TYPE) &&
    isLikelyTextBuffer(buffer)
  ) {
    return 'txt';
  }

  return '';
};

/** 根据显式编码、响应 charset 和内容探测依次确定解析编码。 */
export const resolveFileSourceEncoding = ({
  metadata,
  buffer
}: {
  metadata: FileSourceMetadata;
  buffer: Buffer;
}) => {
  if (metadata.encoding) return metadata.encoding;

  const charset = /charset=([^;]+)/i.exec(metadata.contentType ?? '')?.[1]?.trim();
  return charset || detectFileEncoding(buffer);
};

/** 创建已鉴权、已知可信大小的 S3 文件来源。 */
export const createS3FileSource = ({
  sizeBytes,
  metadata,
  getStream
}: {
  sizeBytes: number;
  metadata: FileSourceMetadata;
  getStream: (signal: AbortSignal) => Promise<Readable>;
}): S3FileSource => ({
  kind: 's3',
  sizeBytes: Math.max(0, sizeBytes),
  metadata,
  materialize: async ({ signal }) => {
    const stream = await getStream(signal);
    const buffer = await readStreamToBuffer({ stream, signal });
    return { buffer, metadata };
  }
});

/** 创建经过 URL 出站策略校验、大小仍未知的外部 HTTP 文件来源。 */
export const createExternalHttpFileSource = ({
  url,
  maxSizeBytes,
  metadata,
  timeoutMs,
  trustMetadataFilename = false
}: {
  url: string;
  maxSizeBytes: number;
  metadata: FileSourceMetadata;
  timeoutMs?: number;
  /** 已授权 File Ref 的 filename 优先于远端 Content-Disposition。 */
  trustMetadataFilename?: boolean;
}): ExternalHttpFileSource => ({
  kind: 'externalHttp',
  maxSizeBytes: Math.max(0, maxSizeBytes),
  metadata,
  materialize: async ({ signal, onReadBytes }) => {
    const response = await readExternalFileBuffer({
      url,
      maxSizeBytes,
      timeoutMs,
      signal,
      onReadBytes
    });
    const filename =
      (trustMetadataFilename ? metadata.filename : undefined) ||
      parseContentDispositionFilename(response.contentDisposition ?? '') ||
      metadata.filename;
    return {
      buffer: response.buffer,
      metadata: {
        ...metadata,
        filename,
        contentType: response.contentType ?? metadata.contentType
      }
    };
  }
});

/** 供非 readFile 消费者显式物化来源；解析任务应通过 worker loadFile bridge 调用。 */
export const materializeFileSource = (source: FileSource, options: MaterializeFileSourceOptions) =>
  source.materialize(options);

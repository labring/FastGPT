import { InvalidStorageObjectKeyError, type InvalidStorageObjectKeyReason } from './errors';
import type { MultipartUploadPart } from './types';

/** 四个 adapter 都可移植的对象 key 最大 UTF-8 字节数。 */
export const MAX_STORAGE_OBJECT_KEY_UTF8_BYTES = 800;

function throwInvalidStorageObjectKey({
  field,
  reason,
  actualBytes
}: {
  field: string;
  reason: InvalidStorageObjectKeyReason;
  actualBytes?: number;
}): never {
  throw new InvalidStorageObjectKeyError({
    field,
    reason,
    actualBytes,
    maxBytes: actualBytes === undefined ? undefined : MAX_STORAGE_OBJECT_KEY_UTF8_BYTES
  });
}

/**
 * 检查字符串是否不存在未配对的 UTF-16 surrogate。
 * Buffer 会把非法 surrogate 静默替换成 U+FFFD，因此必须在计算 UTF-8 长度前显式检查。
 */
function isWellFormedUnicode(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const codeUnit = value.charCodeAt(index);
    if (codeUnit >= 0xd800 && codeUnit <= 0xdbff) {
      const nextCodeUnit = value.charCodeAt(index + 1);
      if (nextCodeUnit < 0xdc00 || nextCodeUnit > 0xdfff) return false;
      index += 1;
      continue;
    }
    if (codeUnit >= 0xdc00 && codeUnit <= 0xdfff) return false;
  }
  return true;
}

/**
 * 按 SDK 统一规范预检对象 key；失败时不会把原始 key 写入错误消息。
 * 该规范取 AWS S3、MinIO、OSS、COS 可稳定处理范围的交集。
 */
export function assertStorageObjectKey(value: unknown, field = 'key'): asserts value is string {
  if (typeof value !== 'string') {
    throwInvalidStorageObjectKey({ field, reason: 'invalid_type' });
  }
  if (value.length === 0) {
    throwInvalidStorageObjectKey({ field, reason: 'empty' });
  }
  if (!isWellFormedUnicode(value)) {
    throwInvalidStorageObjectKey({ field, reason: 'invalid_unicode' });
  }

  const actualBytes = Buffer.byteLength(value, 'utf8');
  if (actualBytes > MAX_STORAGE_OBJECT_KEY_UTF8_BYTES) {
    throwInvalidStorageObjectKey({ field, reason: 'too_long', actualBytes });
  }
  if (value.startsWith('/')) {
    throwInvalidStorageObjectKey({ field, reason: 'leading_slash' });
  }
  if (value.includes('\\')) {
    throwInvalidStorageObjectKey({ field, reason: 'backslash' });
  }
  if (value.includes('//')) {
    throwInvalidStorageObjectKey({ field, reason: 'empty_path_segment' });
  }
  if (/[\u0000-\u001f\u007f]/u.test(value)) {
    throwInvalidStorageObjectKey({ field, reason: 'control_character' });
  }
  if (
    value.split('/').some((segment) => {
      const trimmedSegment = segment.trim();
      return trimmedSegment === '.' || trimmedSegment === '..';
    })
  ) {
    throwInvalidStorageObjectKey({ field, reason: 'dot_path_segment' });
  }
}

/** 批量方法必须完整预检数组后，调用方才能开始分块或产生远端副作用。 */
export function assertStorageObjectKeys(keys: unknown): asserts keys is string[] {
  if (!Array.isArray(keys)) {
    throwInvalidStorageObjectKey({ field: 'keys', reason: 'invalid_type' });
  }
  for (let index = 0; index < keys.length; index += 1) {
    assertStorageObjectKey(keys[index], `keys[${index}]`);
  }
}

/** listObjects 允许省略或传空 prefix；非空 prefix 与对象 key 使用同一规范。 */
export function assertStorageObjectPrefix(prefix: unknown): asserts prefix is string | undefined {
  if (prefix === undefined || prefix === '') return;
  assertStorageObjectKey(prefix, 'prefix');
}

/** 删除前缀必须非空；其余字符和长度限制与对象 key 完全一致。 */
export function assertRequiredStorageObjectPrefix(prefix: unknown): asserts prefix is string {
  if (typeof prefix === 'string' && prefix.trim().length === 0) {
    throw new Error('Prefix is required');
  }
  assertStorageObjectKey(prefix, 'prefix');
}

/** 校验 Multipart upload id，避免把空标识发送给对象存储。 */
export function assertMultipartUploadId(value: unknown): asserts value is string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error('Multipart uploadId is required');
  }
}

/** 校验对象存储通用的 Multipart 分片编号范围。 */
export function assertMultipartPartNumber(value: unknown): asserts value is number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > 10000) {
    throw new Error('Multipart partNumber must be an integer between 1 and 10000');
  }
}

/** 校验分片长度，确保 adapter 使用明确的 Content-Length。 */
export function assertMultipartContentLength(value: unknown): asserts value is number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) {
    throw new Error('Multipart contentLength must be a positive integer');
  }
}

/**
 * 校验完成 Multipart 所需的分片回执。
 *
 * 这里要求分片号严格递增，避免不同 adapter 对无序列表产生不同的合并结果；
 * 是否存在缺失分片由上层根据文件大小和上传策略继续校验。
 */
export function assertMultipartUploadParts(value: unknown): asserts value is MultipartUploadPart[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error('Multipart parts are required');
  }

  let previousPartNumber = 0;
  for (const part of value) {
    if (!part || typeof part !== 'object') {
      throw new Error('Multipart part is invalid');
    }

    const { partNumber, etag } = part as Partial<MultipartUploadPart>;
    assertMultipartPartNumber(partNumber);
    if (typeof etag !== 'string' || etag.trim().length === 0) {
      throw new Error('Multipart part etag is required');
    }
    if (partNumber <= previousPartNumber) {
      throw new Error('Multipart parts must be sorted by partNumber without duplicates');
    }
    previousPartNumber = partNumber;
  }
}

/** 判断厂商是否返回了“Multipart upload 不存在”，供 abort 做幂等处理。 */
export function isNoSuchMultipartUploadError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const value = error as { name?: unknown; code?: unknown; Code?: unknown };
  return [value.name, value.code, value.Code].some((item) => item === 'NoSuchUpload');
}

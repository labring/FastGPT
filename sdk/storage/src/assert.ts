import { InvalidStorageObjectKeyError, type InvalidStorageObjectKeyReason } from './errors';

/** 四个 adapter 都可移植的对象 key 最大 UTF-8 字节数。 */
export const MAX_STORAGE_OBJECT_KEY_UTF8_BYTES = 850;

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

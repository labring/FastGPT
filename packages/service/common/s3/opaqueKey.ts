import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { assertStorageObjectKey } from '@fastgpt-sdk/storage';
import { normalizeFileExtension } from './utils/extension';
import { encodeS3ObjectKeySegment } from './keySanitizer';

const OPAQUE_S3_FILE_ID_PATTERN = /^[0-9a-f]{32}$/;
const OPAQUE_S3_FILE_SEGMENT = 'file';
const OPAQUE_S3_PARSED_SEGMENT = 'parsed';
const MAX_OPAQUE_S3_EXTENSION_LENGTH = 32;

const isOpaqueS3FileId = (value: string | undefined): value is string =>
  Boolean(value && OPAQUE_S3_FILE_ID_PATTERN.test(value));

/**
 * 生成不携带文件名的 S3 文件 ID。
 * randomUUID 保留 128 bit 随机性，去除连字符后可直接作为安全的 key segment。
 */
export const createS3FileId = () => randomUUID().replaceAll('-', '');

const getSafeFileExtension = (extension?: string) => {
  const normalizedExtension = normalizeFileExtension(extension);
  const extensionWithoutDot = normalizedExtension.slice(1);
  return extensionWithoutDot.length <= MAX_OPAQUE_S3_EXTENSION_LENGTH &&
    /^[a-z0-9][a-z0-9._+-]*$/i.test(extensionWithoutDot)
    ? normalizedExtension
    : '';
};

const getSafeFilenameExtension = (filename?: string) => {
  if (!filename) return '';

  const basename = path.posix.basename(filename.replaceAll('\\', '/'));
  const extension = path.posix.extname(basename);
  return getSafeFileExtension(extension);
};

/**
 * 生成不携带业务文件名的随机 basename，供解析图片等没有展示名语义的对象复用。
 */
export const createOpaqueS3Filename = (extension?: string) =>
  createS3FileId() + getSafeFileExtension(extension);

/**
 * 生成新的 opaque S3 文件 key 和解析结果 prefix。
 * prefix 只允许由服务端已鉴权的资源 scope 组成，filename 仅用于提取安全扩展名。
 */
export const createOpaqueS3FileKey = ({
  prefix,
  filename
}: {
  prefix: string[];
  filename?: string;
}) => {
  const encodedPrefix = prefix
    .filter((segment) => segment.length > 0)
    .map(encodeS3ObjectKeySegment);
  const fileId = createS3FileId();
  const extension = getSafeFilenameExtension(filename);
  const objectKey = [...encodedPrefix, OPAQUE_S3_FILE_SEGMENT, fileId + extension].join('/');
  const parsedPrefix = [...encodedPrefix, OPAQUE_S3_PARSED_SEGMENT, fileId].join('/');

  assertStorageObjectKey(objectKey);
  assertStorageObjectKey(parsedPrefix);

  return {
    fileId,
    objectKey,
    parsedPrefix
  };
};

/**
 * 根据对象 key 得到解析图片目录。
 * 新 opaque-v2 key 使用 `parsed/{fileId}`；历史 key 继续使用 basename 派生的 `*-parsed`。
 * S3 key 没有额外版本字段，只有恰好匹配 file/{32hex} 形状的 legacy key 才存在理论碰撞；
 * 业务生成的新 key 始终使用本模块的布局。
 */
type OpaqueS3FileKeyParts = {
  fileId: string;
  prefix: string[];
};

const parseOpaqueS3FileKey = (key: string): OpaqueS3FileKeyParts | undefined => {
  const segments = key.split('/');
  const fileIndex = segments.length - 2;
  const objectName = segments.at(-1);
  const fileId = objectName ? path.posix.basename(objectName, path.posix.extname(objectName)) : '';

  if (
    fileIndex >= 0 &&
    segments[fileIndex] === OPAQUE_S3_FILE_SEGMENT &&
    objectName &&
    isOpaqueS3FileId(fileId)
  ) {
    return {
      fileId,
      prefix: segments.slice(0, fileIndex)
    };
  }
};

export const getS3ParsedPrefix = (key: string) => {
  const opaqueKey = parseOpaqueS3FileKey(key);
  if (opaqueKey) {
    return [...opaqueKey.prefix, OPAQUE_S3_PARSED_SEGMENT, opaqueKey.fileId].join('/');
  }

  if (!key.includes('/')) {
    return `${path.posix.basename(key, path.posix.extname(key))}-parsed`;
  }

  return `${path.posix.dirname(key)}/${path.posix.basename(key, path.posix.extname(key))}-parsed`;
};

export const isOpaqueS3FileKey = (key: string) => Boolean(parseOpaqueS3FileKey(key));

/** 判断对象是否是新格式的解析图片 key，避免误把历史文件名中的 parsed 当作目录。 */
export const isOpaqueS3ParsedObjectKey = (key: string) => {
  const segments = key.split('/');
  return (
    segments.length >= 3 &&
    segments.at(-3) === OPAQUE_S3_PARSED_SEGMENT &&
    isOpaqueS3FileId(segments.at(-2)) &&
    Boolean(segments.at(-1))
  );
};

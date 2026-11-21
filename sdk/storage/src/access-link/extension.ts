import { S3_DOWNLOAD_EXTENSION_PATTERN } from './constants';

/**
 * 将扩展名规范化为不含前导点的小写安全后缀。
 * 仅剥离单个前导点并校验长度与字符集，不合法时返回空串。
 */
export const normalizeS3DownloadExtension = (value?: string): string => {
  if (typeof value !== 'string') return '';

  const trimmed = value.trim();
  if (!trimmed) return '';

  const withoutDot = trimmed.startsWith('.') ? trimmed.slice(1) : trimmed;
  const normalized = withoutDot.toLowerCase();

  return S3_DOWNLOAD_EXTENSION_PATTERN.test(normalized) ? normalized : '';
};

const extractExtensionFromBasename = (basename: string): string => {
  const lastDotIndex = basename.lastIndexOf('.');
  if (lastDotIndex <= 0 || lastDotIndex === basename.length - 1) return '';

  return normalizeS3DownloadExtension(basename.slice(lastDotIndex + 1));
};

/**
 * 从原始展示文件名提取安全扩展名。
 * 业务 filename 已经处于解码态，不能再次 decodeURIComponent，避免字面量 `report%2Epng` 被误判为 `.png`。
 */
const extractExtensionFromFilename = (filename?: string): string => {
  if (typeof filename !== 'string' || !filename) return '';

  const basename = filename.replaceAll('\\', '/').split('/').at(-1) ?? '';
  if (!basename) return '';

  return extractExtensionFromBasename(basename);
};

/**
 * 从可能经 URI 编码的 S3 对象键末尾提取安全扩展名；忽略点文件、路径目录中的点号与纯数字后缀。
 */
const extractExtensionFromObjectKey = (objectKey?: string): string => {
  if (typeof objectKey !== 'string' || !objectKey) return '';

  const rawBasename = objectKey.replaceAll('\\', '/').split('/').at(-1) ?? '';
  if (!rawBasename) return '';

  const decodedBasename = (() => {
    try {
      return decodeURIComponent(rawBasename);
    } catch {
      return rawBasename;
    }
  })();

  // 防止编码后的路径分隔符在解码后跨段影响扩展名提取。
  const basename = decodedBasename.replaceAll('\\', '/').split('/').at(-1) ?? '';
  if (!basename) return '';

  return extractExtensionFromBasename(basename);
};

/**
 * 按原始 filename → 编码 objectKey → fallbackExtension（如明确 MIME）顺序推导短链安全后缀。
 * 返回不含前导点的小写扩展名，无法推导时返回空串。
 */
export const resolveS3DownloadExtension = ({
  filename,
  objectKey,
  fallbackExtension
}: {
  filename?: string;
  objectKey: string;
  fallbackExtension?: string;
}): string => {
  return (
    extractExtensionFromFilename(filename) ||
    extractExtensionFromObjectKey(objectKey) ||
    normalizeS3DownloadExtension(fallbackExtension)
  );
};

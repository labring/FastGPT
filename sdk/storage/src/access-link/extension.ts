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

/** 从文件名或对象键末尾提取安全扩展名；忽略点文件、路径目录中的点号与纯数字后缀。 */
const extractExtensionFromPathLike = (value?: string): string => {
  if (typeof value !== 'string' || !value) return '';

  const rawBasename = value.replaceAll('\\', '/').split('/').at(-1) ?? '';
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
  const lastDotIndex = basename.lastIndexOf('.');
  if (lastDotIndex <= 0 || lastDotIndex === basename.length - 1) return '';

  return normalizeS3DownloadExtension(basename.slice(lastDotIndex + 1));
};

/**
 * 按显式 extension → filename → objectKey 顺序推导短链可携带的安全后缀。
 * 返回不含前导点的小写扩展名，无法推导时返回空串。
 */
export const resolveS3DownloadExtension = ({
  extension,
  filename,
  objectKey
}: {
  extension?: string;
  filename?: string;
  objectKey: string;
}): string => {
  return (
    normalizeS3DownloadExtension(extension) ||
    extractExtensionFromPathLike(filename) ||
    extractExtensionFromPathLike(objectKey)
  );
};

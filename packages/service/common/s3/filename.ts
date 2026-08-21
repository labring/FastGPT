import path from 'node:path';
import { getContentDisposition } from '@fastgpt/global/common/file/tools';

/** S3 user metadata 的 filename value 预留空间，避免占满 provider 的约 2KB metadata 配额。 */
const MAX_S3_FILENAME_METADATA_LENGTH = 512;

/** 上传时的 Content-Disposition 也需要有界，避免超长文件名撑爆 provider 的请求头限制。 */
const MAX_S3_CONTENT_DISPOSITION_FILENAME_LENGTH = MAX_S3_FILENAME_METADATA_LENGTH;
const MAX_S3_CONTENT_DISPOSITION_EXTENSION_LENGTH = 128;

const normalizeS3Filename = (filename: string) => {
  let normalized = '';

  // encodeURIComponent 无法处理孤立代理项；将其替换为 U+FFFD，避免恶意 filename 让上传接口抛 500。
  for (let index = 0; index < filename.length; index += 1) {
    const code = filename.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff) {
      const nextCode = filename.charCodeAt(index + 1);
      if (nextCode >= 0xdc00 && nextCode <= 0xdfff) {
        normalized += filename[index] + filename[index + 1];
        index += 1;
      } else {
        normalized += '\ufffd';
      }
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      normalized += '\ufffd';
    } else {
      normalized += filename[index];
    }
  }

  return normalized;
};

const encodeRFC5987Value = (value: string) =>
  encodeURIComponent(value).replace(
    /['()*]/g,
    (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`
  );

const takeEncodedPrefix = (value: string, maxLength: number, encode: (value: string) => string) => {
  let result = '';
  let encodedLength = 0;
  for (const character of value) {
    const characterLength = encode(character).length;
    if (encodedLength + characterLength > maxLength) break;
    result += character;
    encodedLength += characterLength;
  }
  return result;
};

/** 将文件名编码为有界的 S3 user metadata ASCII 值；业务记录和下载 header 仍保留完整文件名。 */
export const encodeS3Filename = (filename: string) => {
  const normalizedFilename = normalizeS3Filename(filename);
  const encodedFilename = encodeURIComponent(normalizedFilename);
  if (encodedFilename.length <= MAX_S3_FILENAME_METADATA_LENGTH) {
    return encodedFilename;
  }

  const extension = path.posix.extname(normalizedFilename);
  const name = extension ? normalizedFilename.slice(0, -extension.length) : normalizedFilename;
  const encodedExtension = takeEncodedPrefix(
    extension,
    MAX_S3_FILENAME_METADATA_LENGTH - encodeURIComponent('file').length,
    encodeURIComponent
  );
  const maxEncodedNameLength =
    MAX_S3_FILENAME_METADATA_LENGTH - encodeURIComponent(encodedExtension).length;
  const truncatedName = takeEncodedPrefix(name, maxEncodedNameLength, encodeURIComponent);

  return encodeURIComponent(`${truncatedName || 'file'}${encodedExtension}`);
};

const truncateS3HeaderFilename = (filename?: string) => {
  const normalizedFilename =
    normalizeS3Filename(`${filename || 'file'}`)
      .replace(/[\r\n]/g, '')
      .replace(/[\\/]/g, '_')
      .trim() || 'file';
  const extension = path.posix.extname(normalizedFilename);
  const name = extension ? normalizedFilename.slice(0, -extension.length) : normalizedFilename;

  if (encodeRFC5987Value(normalizedFilename).length <= MAX_S3_CONTENT_DISPOSITION_FILENAME_LENGTH) {
    return normalizedFilename;
  }

  const safeExtension = takeEncodedPrefix(
    extension,
    Math.min(
      MAX_S3_CONTENT_DISPOSITION_EXTENSION_LENGTH,
      MAX_S3_CONTENT_DISPOSITION_FILENAME_LENGTH - encodeRFC5987Value('file').length
    ),
    encodeRFC5987Value
  );
  const maxEncodedNameLength =
    MAX_S3_CONTENT_DISPOSITION_FILENAME_LENGTH - encodeRFC5987Value(safeExtension).length;
  const truncatedName = takeEncodedPrefix(name, maxEncodedNameLength, encodeRFC5987Value);

  return `${truncatedName || 'file'}${safeExtension}`;
};

/** 生成上传时使用的有界 Content-Disposition；业务文件名和下载响应不受此限制。 */
export const getS3UploadContentDisposition = ({
  filename,
  type = 'attachment'
}: {
  filename?: string;
  type?: 'inline' | 'attachment';
}) => getContentDisposition({ filename: truncateS3HeaderFilename(filename), type });

/**
 * 解码 S3 metadata 中的 URI 编码文件名；metadata 的写入约定是 encodeS3Filename 的结果。
 * 历史 raw ASCII 值与 URI 编码值在存在合法 `%XX` 时无法从内容区分，因此这里优先兼容旧编码，
 * 业务调用方应优先传入数据库中的原始文件名，不能把 metadata 当作权威展示名称。
 */
export const decodeS3Filename = (filename?: string) => {
  if (!filename) return '';

  // S3 metadata 的写入方统一使用 encodeURIComponent，历史值需要完整 decode。
  // 原始 multipart filename 不应直接调用此函数，见 decodeMultipartFilename。
  if (/[^\x00-\x7f]/.test(filename)) return normalizeS3Filename(filename);

  try {
    return decodeURIComponent(filename);
  } catch {
    return normalizeS3Filename(filename);
  }
};

const containsEncodedUtf8Sequence = (filename: string) => {
  try {
    const decoded = decodeURIComponent(filename);
    // 仅将能完整解码为非 ASCII 字符的值视为历史 Unicode filename；合法 literal %XX 仍有内容歧义。
    return decoded !== filename && /[^\x00-\x7f]/.test(decoded);
  } catch {
    return false;
  }
};

/**
 * 解析客户端原始文件名，并兼容旧客户端对中文/Emoji 文件名做的 URI 编码。
 * ASCII 文件名中的百分号序列与旧版 URI 编码无法从内容一一区分；为保证旧客户端文件名恢复，
 * 检测到合法 UTF-8 lead byte 时按历史编码解析，literal `%XX` 文件名存在被解码的兼容性取舍。
 */
export const decodeRawS3Filename = (filename?: string) => {
  if (!filename || /[^\x00-\x7f]/.test(filename)) {
    return filename ? normalizeS3Filename(filename) : '';
  }
  return containsEncodedUtf8Sequence(filename) ? decodeS3Filename(filename) : filename;
};

/**
 * 解析 multipart filename 的历史编码。
 * 新客户端传原始文件名时，ASCII 文件名中的 `%20` 等字面量无法和旧编码区分，
 * 因此只自动解码包含 UTF-8 百分号字节的历史中文/Emoji 文件名。
 */
export const decodeMultipartFilename = decodeRawS3Filename;

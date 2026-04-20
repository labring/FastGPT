import { detect } from 'jschardet';

export const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 B';

  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

// 判断 buffer 是否包含非 ASCII 字节
export const hasNonAsciiByte = (buffer: Buffer) => {
  for (let i = 0; i < buffer.length; i++) {
    if (buffer[i] > 0x7f) return true;
  }
  return false;
};

/**
 * 检测文件编码
 * @param buffer - 文件缓冲区
 * @returns 编码类型
 */
const UTF8_BOM = [0xef, 0xbb, 0xbf] as const;
const DETECT_SAMPLE_SIZE = 1024;
const MAX_DETECT_SAMPLE_SIZE = DETECT_SAMPLE_SIZE * 3;
const MAX_UTF8_VALIDATE_SIZE = 1024 * 1024;
export const hasUtf8Bom = (buffer: Buffer) =>
  buffer.length >= UTF8_BOM.length && UTF8_BOM.every((byte, index) => buffer[index] === byte);
export const isContinuationByte = (byte: number) => byte >= 0x80 && byte <= 0xbf;
export const isValidUtf8 = (buffer: Buffer, end: number = buffer.length) => {
  for (let i = 0; i < end; i++) {
    const byte1 = buffer[i];

    if (byte1 <= 0x7f) continue;

    if (byte1 >= 0xc2 && byte1 <= 0xdf) {
      if (i + 1 >= end || !isContinuationByte(buffer[i + 1])) return false;
      i += 1;
      continue;
    }

    if (byte1 === 0xe0) {
      if (
        i + 2 >= end ||
        buffer[i + 1] < 0xa0 ||
        buffer[i + 1] > 0xbf ||
        !isContinuationByte(buffer[i + 2])
      ) {
        return false;
      }
      i += 2;
      continue;
    }

    if (byte1 >= 0xe1 && byte1 <= 0xec) {
      if (
        i + 2 >= end ||
        !isContinuationByte(buffer[i + 1]) ||
        !isContinuationByte(buffer[i + 2])
      ) {
        return false;
      }
      i += 2;
      continue;
    }

    if (byte1 === 0xed) {
      if (
        i + 2 >= end ||
        buffer[i + 1] < 0x80 ||
        buffer[i + 1] > 0x9f ||
        !isContinuationByte(buffer[i + 2])
      ) {
        return false;
      }
      i += 2;
      continue;
    }

    if (byte1 >= 0xee && byte1 <= 0xef) {
      if (
        i + 2 >= end ||
        !isContinuationByte(buffer[i + 1]) ||
        !isContinuationByte(buffer[i + 2])
      ) {
        return false;
      }
      i += 2;
      continue;
    }

    if (byte1 === 0xf0) {
      if (
        i + 3 >= end ||
        buffer[i + 1] < 0x90 ||
        buffer[i + 1] > 0xbf ||
        !isContinuationByte(buffer[i + 2]) ||
        !isContinuationByte(buffer[i + 3])
      ) {
        return false;
      }
      i += 3;
      continue;
    }

    if (byte1 >= 0xf1 && byte1 <= 0xf3) {
      if (
        i + 3 >= end ||
        !isContinuationByte(buffer[i + 1]) ||
        !isContinuationByte(buffer[i + 2]) ||
        !isContinuationByte(buffer[i + 3])
      ) {
        return false;
      }
      i += 3;
      continue;
    }

    if (byte1 === 0xf4) {
      if (
        i + 3 >= end ||
        buffer[i + 1] < 0x80 ||
        buffer[i + 1] > 0x8f ||
        !isContinuationByte(buffer[i + 2]) ||
        !isContinuationByte(buffer[i + 3])
      ) {
        return false;
      }
      i += 3;
      continue;
    }

    return false;
  }

  return true;
};
export const getDetectSample = (buffer: Buffer) => {
  if (buffer.length <= MAX_DETECT_SAMPLE_SIZE) return buffer;

  const head = buffer.subarray(0, DETECT_SAMPLE_SIZE);
  const middleStart = Math.floor((buffer.length - DETECT_SAMPLE_SIZE) / 2);
  const middle = buffer.subarray(middleStart, middleStart + DETECT_SAMPLE_SIZE);
  const tail = buffer.subarray(buffer.length - DETECT_SAMPLE_SIZE);

  return Buffer.concat([head, middle, tail] as unknown as Uint8Array[]);
};
// 大文件仅校验头部样本，并在 UTF-8 序列边界切分，避免把多字节字符截断导致误判
export const getUtf8ValidateEnd = (buffer: Buffer) => {
  if (buffer.length <= MAX_UTF8_VALIDATE_SIZE) return buffer.length;

  for (let p = MAX_UTF8_VALIDATE_SIZE; p >= MAX_UTF8_VALIDATE_SIZE - 3; p--) {
    const b = buffer[p];
    if (b <= 0x7f || b >= 0xc2) return p;
  }
  return MAX_UTF8_VALIDATE_SIZE;
};
export const detectFileEncoding = (buffer: Buffer) => {
  if (hasUtf8Bom(buffer) || isValidUtf8(buffer, getUtf8ValidateEnd(buffer))) {
    return 'utf-8';
  }

  const detectedEncoding = detect(getDetectSample(buffer))?.encoding?.toLocaleLowerCase();
  if (detectedEncoding === 'ascii' && hasNonAsciiByte(buffer)) {
    return 'utf-8';
  }

  return detectedEncoding;
};

const encodeRFC5987ValueChars = (value: string) => {
  return encodeURIComponent(value).replace(
    /['()*]/g,
    (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`
  );
};

const sanitizeHeaderFilename = (filename?: string) => {
  const normalized = `${filename || ''}`.replace(/[\r\n]/g, '').trim();
  if (!normalized) return 'file';

  const replacedSeparators = normalized.replace(/[\\/]/g, '_');
  const dotIndex = replacedSeparators.lastIndexOf('.');
  const name = dotIndex > 0 ? replacedSeparators.slice(0, dotIndex) : replacedSeparators;
  const ext = dotIndex > 0 ? replacedSeparators.slice(dotIndex) : '';

  const asciiName = name
    .replace(/[^\x20-\x7E]/g, '_')
    .replace(/["%;\\]/g, '_')
    .replace(/\s+/g, ' ')
    .trim();
  const asciiExt = ext.replace(/[^\x20-\x7E]/g, '').replace(/[^A-Za-z0-9._-]/g, '');

  return `${asciiName || 'file'}${asciiExt}` || 'file';
};

export const getContentDisposition = ({
  filename,
  type = 'inline'
}: {
  filename?: string;
  type?: 'inline' | 'attachment';
}) => {
  const normalizedFilename = `${filename || 'file'}`.replace(/[\r\n]/g, '').trim() || 'file';
  const fallbackFilename = sanitizeHeaderFilename(normalizedFilename);

  return `${type}; filename="${fallbackFilename}"; filename*=UTF-8''${encodeRFC5987ValueChars(
    normalizedFilename
  )}`;
};

export const parseContentDispositionFilename = (contentDisposition?: string) => {
  if (!contentDisposition) return '';

  const filenameStarRegex = /filename\*=([^']*)'([^']*)'([^;\n]*)/i;
  const starMatches = filenameStarRegex.exec(contentDisposition);
  if (starMatches?.[3]) {
    try {
      return decodeURIComponent(starMatches[3]);
    } catch {}
  }

  const filenameRegex = /filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/i;
  const matches = filenameRegex.exec(contentDisposition);
  if (matches?.[1]) {
    return matches[1].replace(/['"]/g, '');
  }

  return '';
};

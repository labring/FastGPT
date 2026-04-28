import { fileTypeFromBuffer } from 'file-type';
import { S3ErrEnum } from '@fastgpt/global/common/error/code/s3';
import path from 'node:path';
import type { UploadConstraints } from '../contracts/type';
import { DEFAULT_CONTENT_TYPE, resolveMimeType } from '../utils/mime';
import { normalizeAllowedExtensions, normalizeFileExtension } from '../utils/uploadConstraints';
import { env } from '../../../env';

const defaultInspectBytes = 8192;
const officeZipInspectBytes = 64 * 1024;
const textLikeMimePrefixes = ['text/'];
const textLikeMimeSet = new Set([
  'application/json',
  'application/javascript',
  'application/xml',
  'image/svg+xml'
]);
const officeZipFormats = [
  {
    extension: '.docx',
    mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    markers: ['word/', 'word/document.xml']
  },
  {
    extension: '.xlsx',
    mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    markers: ['xl/', 'xl/workbook.xml']
  },
  {
    extension: '.pptx',
    mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    markers: ['ppt/', 'ppt/presentation.xml']
  }
] as const;

const decodeFileName = (filename?: string) => {
  if (!filename) return '';
  try {
    return decodeURIComponent(filename);
  } catch {
    return filename;
  }
};

const isLikelyTextBuffer = (buffer: Buffer) => {
  if (buffer.length === 0) return true;

  let suspiciousBytes = 0;
  for (const byte of buffer) {
    if (byte === 0) return false;

    if (byte < 7 || (byte > 14 && byte < 32)) {
      suspiciousBytes += 1;
    }
  }

  return suspiciousBytes / buffer.length < 0.1;
};

const replaceFilenameExtension = (filename: string, extension: string) => {
  const normalizedExtension = normalizeFileExtension(extension);
  if (!normalizedExtension) return filename;

  const currentExtension = normalizeFileExtension(path.extname(filename));
  if (!currentExtension) {
    return `${filename}${normalizedExtension}`;
  }

  return `${filename.slice(0, -currentExtension.length)}${normalizedExtension}`;
};

const resolveExpectedMime = ({
  filename,
  extension,
  uploadConstraints
}: {
  filename: string;
  extension: string;
  uploadConstraints: UploadConstraints;
}) => {
  return resolveMimeType([filename, extension], uploadConstraints.defaultContentType);
};

const isTextLikeMime = (mime: string) => {
  return (
    textLikeMimePrefixes.some((prefix) => mime.startsWith(prefix)) || textLikeMimeSet.has(mime)
  );
};

const getOfficeZipFormatByExtension = (extension: string) =>
  officeZipFormats.find((format) => format.extension === extension);

/**
 * mime-types（按扩展名）与 file-type（按魔数）对同一容器可能给出不同登记名，例如 .avi：
 * lookup → video/x-msvideo，file-type → video/vnd.avi。.mpeg：lookup → video/mpeg，file-type 可能为
 * video/MP1S（MPEG-1 PS）、video/MP2P（MPEG-2 PS）或 video/mpeg（模糊检测）。
 * .m4a：lookup → audio/mp4（RFC），file-type（ftyp M4A）→ audio/x-m4a。
 * 比较前统一小写（忽略参数、大小写差异）。
 */
const MIME_EQUIVALENCE_GROUPS: ReadonlyArray<ReadonlySet<string>> = [
  new Set(['video/x-msvideo', 'video/vnd.avi', 'video/avi', 'video/msvideo']),
  new Set(['video/mpeg', 'video/mp1s', 'video/mp2p']),
  new Set(['audio/mp4', 'audio/x-m4a'])
];

const normalizeMimeForCompare = (mime: string) => mime.split(';')[0]?.trim().toLowerCase() || '';

const mimesMatchForUpload = (expected: string, detected: string): boolean => {
  const e = normalizeMimeForCompare(expected);
  const d = normalizeMimeForCompare(detected);
  if (e === d) return true;
  for (const group of MIME_EQUIVALENCE_GROUPS) {
    if (group.has(e) && group.has(d)) return true;
  }
  return false;
};

const resolveAllowedExtensionForMime = ({
  allowedExtensions,
  mime
}: {
  allowedExtensions: string[];
  mime: string;
}) => {
  return (
    allowedExtensions.find((extension) => {
      const allowedMime = resolveMimeType([extension], '');
      return Boolean(allowedMime) && mimesMatchForUpload(allowedMime, mime);
    }) || ''
  );
};

const detectOfficeDocumentMime = ({
  buffer,
  detectedMime
}: {
  buffer: Buffer;
  detectedMime?: string;
}) => {
  if (detectedMime && detectedMime !== 'application/zip') return;

  return officeZipFormats.find((format) =>
    format.markers.some((marker) => buffer.includes(Buffer.from(marker, 'utf8')))
  );
};

export const getUploadInspectBytes = (filename?: string) => {
  const extension = normalizeFileExtension(path.extname(decodeFileName(filename)));

  return getOfficeZipFormatByExtension(extension) ? officeZipInspectBytes : defaultInspectBytes;
};

export async function validateUploadFile({
  buffer,
  filename,
  uploadConstraints
}: {
  buffer: Buffer;
  filename?: string;
  uploadConstraints: UploadConstraints;
}) {
  const normalizedFileName = decodeFileName(filename);
  const extension = normalizeFileExtension(path.extname(normalizedFileName));
  const allowedExtensions = normalizeAllowedExtensions(uploadConstraints.allowedExtensions);

  if (allowedExtensions.length > 0 && (!extension || !allowedExtensions.includes(extension))) {
    throw new Error(S3ErrEnum.invalidUploadFileType);
  }

  const expectedMime = resolveExpectedMime({
    filename: normalizedFileName,
    extension,
    uploadConstraints
  });

  if (env.SKIP_FILE_TYPE_CHECK) {
    return {
      filename: normalizedFileName,
      contentType: expectedMime
    };
  }

  const detected = await fileTypeFromBuffer(buffer).catch((error) => {
    if (error?.name === 'EndOfStreamError' || error?.message === 'End-Of-Stream') {
      return undefined;
    }
    throw error;
  });
  const officeFormat = detectOfficeDocumentMime({
    buffer,
    detectedMime: detected?.mime
  });
  const detectedMime = officeFormat?.mime || detected?.mime;

  if (detectedMime) {
    if (expectedMime !== DEFAULT_CONTENT_TYPE && !mimesMatchForUpload(expectedMime, detectedMime)) {
      const matchedAllowedExtension = resolveAllowedExtensionForMime({
        allowedExtensions,
        mime: detectedMime
      });

      if (!matchedAllowedExtension) {
        throw new Error(S3ErrEnum.uploadFileTypeMismatch);
      }

      return {
        filename:
          matchedAllowedExtension !== extension
            ? replaceFilenameExtension(normalizedFileName, matchedAllowedExtension)
            : normalizedFileName,
        contentType: detectedMime
      };
    }
    return {
      filename: normalizedFileName,
      contentType: detectedMime
    };
  }

  if (isTextLikeMime(expectedMime) && isLikelyTextBuffer(buffer)) {
    return {
      filename: normalizedFileName,
      contentType: expectedMime
    };
  }

  if (!extension || expectedMime === DEFAULT_CONTENT_TYPE) {
    return {
      filename: normalizedFileName,
      contentType: expectedMime
    };
  }

  throw new Error(S3ErrEnum.invalidUploadFileType);
}

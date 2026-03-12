import { fileTypeFromBuffer } from 'file-type';
import { S3ErrEnum } from '@fastgpt/global/common/error/code/s3';
import path from 'node:path';
import type { UploadConstraints } from '../contracts/type';
import { DEFAULT_CONTENT_TYPE, resolveMimeType } from '../utils/mime';
import { normalizeAllowedExtensions, normalizeFileExtension } from '../utils/uploadConstraints';

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
    if (expectedMime !== DEFAULT_CONTENT_TYPE && detectedMime !== expectedMime) {
      throw new Error(S3ErrEnum.uploadFileTypeMismatch);
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

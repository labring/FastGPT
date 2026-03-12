import { fileTypeFromBuffer } from 'file-type';
import { S3ErrEnum } from '@fastgpt/global/common/error/code/s3';
import path from 'node:path';
import type { UploadConstraints } from '../contracts/type';
import { DEFAULT_CONTENT_TYPE, resolveMimeType } from '../utils/mime';
import { normalizeAllowedExtensions, normalizeFileExtension } from '../utils/uploadConstraints';

const maxInspectBytes = 8192;
const textLikeMimePrefixes = ['text/'];
const textLikeMimeSet = new Set([
  'application/json',
  'application/javascript',
  'application/xml',
  'image/svg+xml'
]);

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

export const getUploadInspectBytes = () => maxInspectBytes;

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

  if (detected?.mime) {
    if (expectedMime !== DEFAULT_CONTENT_TYPE && detected.mime !== expectedMime) {
      throw new Error(S3ErrEnum.uploadFileTypeMismatch);
    }
    return {
      filename: normalizedFileName,
      contentType: detected.mime
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

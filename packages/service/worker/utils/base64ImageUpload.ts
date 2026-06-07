import { type UploadFileHandler } from '../readFile/type';
import { resolveMimeExtension } from '../../common/s3/utils/mime';
import { getLogger, LogCategories } from '../../common/logger';

const logger = getLogger(LogCategories.INFRA.WORKER);
const MAX_PARSED_IMAGE_BUFFER_SIZE = 40 * 1024 * 1024;

export class ParsedImageTooLargeError extends Error {
  constructor(size: number, maxSize: number) {
    super(`Parsed image too large. Size: ${size} bytes, maximum allowed: ${maxSize} bytes`);
    this.name = 'ParsedImageTooLargeError';
  }
}

const getBase64DecodedSize = (base64: string) => {
  const normalizedBase64 = base64.replace(/\s/g, '');
  const padding = normalizedBase64.endsWith('==') ? 2 : normalizedBase64.endsWith('=') ? 1 : 0;

  return Math.max(0, Math.floor((normalizedBase64.length * 3) / 4) - padding);
};

const toTransferableArrayBuffer = (buffer: Buffer): ArrayBuffer => {
  if (
    buffer.buffer instanceof ArrayBuffer &&
    buffer.byteOffset === 0 &&
    buffer.byteLength === buffer.buffer.byteLength
  ) {
    return buffer.buffer;
  }

  const imageArrayBuffer = new Uint8Array(buffer.byteLength);
  imageArrayBuffer.set(buffer);
  return imageArrayBuffer.buffer;
};

export const uploadBase64Image = async ({
  mime,
  base64,
  uploadFile
}: {
  mime: string;
  base64: string;
  uploadFile?: UploadFileHandler;
}) => {
  if (!uploadFile) {
    logger.warn('Missing image upload handler when parsing document image', { mime });
    throw new Error('Missing imageKeyOptions.prefix for parsed document image upload');
  }

  const decodedSize = getBase64DecodedSize(base64);
  if (decodedSize > MAX_PARSED_IMAGE_BUFFER_SIZE) {
    throw new ParsedImageTooLargeError(decodedSize, MAX_PARSED_IMAGE_BUFFER_SIZE);
  }

  const imageBuffer = Buffer.from(base64, 'base64');
  const filename = `${crypto.randomUUID()}${resolveMimeExtension(mime)}`;

  return uploadFile({
    name: filename,
    mime,
    buffer: toTransferableArrayBuffer(imageBuffer)
  }).catch((error) => {
    logger.warn('Failed to upload parsed document image from worker', {
      filename,
      mime,
      error
    });
    throw error;
  });
};

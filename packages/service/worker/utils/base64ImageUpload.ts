import { type UploadFileHandler } from '../readFile/type';
import { resolveMimeExtension } from '../../common/s3/utils/mime';
import { getLogger, LogCategories } from '../../common/logger';

const logger = getLogger(LogCategories.INFRA.WORKER);

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

  const filename = `${crypto.randomUUID()}${resolveMimeExtension(mime)}`;
  const imageBuffer = Buffer.from(base64, 'base64');
  const imageArrayBuffer = new Uint8Array(imageBuffer.byteLength);
  imageArrayBuffer.set(imageBuffer);

  return uploadFile({
    name: filename,
    mime,
    buffer: imageArrayBuffer.buffer
  }).catch((error) => {
    logger.warn('Failed to upload parsed document image from worker', {
      filename,
      mime,
      error
    });
    throw error;
  });
};

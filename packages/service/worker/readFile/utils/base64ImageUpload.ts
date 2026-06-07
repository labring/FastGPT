import { type UploadFileHandler } from '../type';
import { resolveMimeExtension } from '../../../common/s3/utils/mime';
import { getLogger, LogCategories } from '../../../common/logger';

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

/**
 * 解析 HTML img src 中的 base64 图片时立即上传并替换为 S3 key。
 *
 * HTML 转 markdown 前先完成替换，后续 turndown 只会看到普通图片 key。
 */
export const replaceHtmlBase64Images = async (
  html: string,
  options: {
    uploadFile?: UploadFileHandler;
  } = {}
) => {
  const base64Regex = /src="data:([^;]+);base64,([A-Za-z0-9+/=]+)"/g;
  let result = '';
  let lastIndex = 0;

  for (const match of html.matchAll(base64Regex)) {
    const [fullMatch, mime, base64Data] = match;
    const index = match.index ?? 0;
    const { key } = await uploadBase64Image({
      mime,
      base64: base64Data,
      uploadFile: options.uploadFile
    });

    result += html.slice(lastIndex, index);
    result += `src="${key}"`;
    lastIndex = index + fullMatch.length;
  }

  if (lastIndex === 0) return html;

  return result + html.slice(lastIndex);
};

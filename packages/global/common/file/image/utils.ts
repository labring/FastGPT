import { providerImageMimeType } from '../constants';

const INLINE_IMAGE_DATA_URI_REGEX = /^data:(image\/[^;,]+);base64,([^,]+)$/i;

/** 主流视觉模型可消费的栅格图片 MIME 白名单。 */
export const providerImageMimeTypes: readonly string[] = providerImageMimeType
  .split(',')
  .map((item) => item.trim());

/** 判断 MIME 类型是否属于视觉模型支持的栅格图片格式。 */
export const isProviderImageMimeType = (mimeType: string) =>
  providerImageMimeTypes.includes(mimeType.toLowerCase());

/**
 * 解析内联图片 data URI（忽略协议、MIME 与 base64 标识大小写）。
 * 供工具图片校验、Pi 视觉解码、Fast 出站归一化、正文遮蔽与持久化限额统一复用。
 */
export const parseInlineImageDataUri = (
  url: string
): { mimeType: string; data: string } | undefined => {
  const match = url.match(INLINE_IMAGE_DATA_URI_REGEX);
  if (!match) return;
  return {
    mimeType: match[1].toLowerCase(),
    data: match[2]
  };
};

/** 判断字符串是否为可接受的内联图片 data URI。 */
export const isInlineImageDataUri = (url: string) => Boolean(parseInlineImageDataUri(url));

import axios from 'axios';
import { addLog } from '../../system/log';
import { serverRequestBaseUrl } from '../../api/serverRequest';
import { retryFn } from '@fastgpt/global/common/system/utils';
import { getContentTypeFromHeader } from '../utils';

// 图片格式魔数映射表
const IMAGE_SIGNATURES: { type: string; magic: number[]; check?: (buffer: Buffer) => boolean }[] = [
  { type: 'image/jpeg', magic: [0xff, 0xd8, 0xff] },
  { type: 'image/png', magic: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
  { type: 'image/gif', magic: [0x47, 0x49, 0x46, 0x38] },
  {
    type: 'image/webp',
    magic: [0x52, 0x49, 0x46, 0x46],
    check: (buffer) => buffer.length >= 12 && buffer.slice(8, 12).toString('ascii') === 'WEBP'
  },
  { type: 'image/bmp', magic: [0x42, 0x4d] },
  { type: 'image/tiff', magic: [0x49, 0x49, 0x2a, 0x00] },
  { type: 'image/tiff', magic: [0x4d, 0x4d, 0x00, 0x2a] },
  { type: 'image/svg+xml', magic: [0x3c, 0x73, 0x76, 0x67] },
  { type: 'image/x-icon', magic: [0x00, 0x00, 0x01, 0x00] }
];

// 有效的图片 MIME 类型
const VALID_IMAGE_TYPES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/bmp',
  'image/svg+xml',
  'image/tiff',
  'image/x-icon',
  'image/vnd.microsoft.icon',
  'image/ico',
  'image/heic',
  'image/heif',
  'image/avif'
]);

// Base64 首字符到图片类型的映射
const BASE64_PREFIX_MAP: Record<string, string> = {
  '/': 'image/jpeg',
  i: 'image/png',
  R: 'image/gif',
  U: 'image/webp',
  Q: 'image/bmp',
  P: 'image/svg+xml',
  T: 'image/tiff',
  J: 'image/jp2',
  S: 'image/x-tga',
  I: 'image/ief',
  V: 'image/vnd.microsoft.icon',
  W: 'image/vnd.wap.wbmp',
  X: 'image/x-xbitmap',
  Z: 'image/x-xpixmap',
  Y: 'image/x-xwindowdump'
};

const DEFAULT_IMAGE_TYPE = 'image/jpeg';

export const isValidImageContentType = (contentType: string): boolean => {
  if (!contentType) return false;
  return VALID_IMAGE_TYPES.has(contentType);
};

export const detectImageTypeFromBuffer = (buffer: Buffer): string | undefined => {
  if (!buffer || buffer.length === 0) return;

  for (const { type, magic, check } of IMAGE_SIGNATURES) {
    if (buffer.length < magic.length) continue;

    const matches = magic.every((byte, index) => buffer[index] === byte);
    if (matches && (!check || check(buffer))) {
      return type;
    }
  }

  return;
};

export const guessBase64ImageType = (str: string): string => {
  if (!str || typeof str !== 'string') return DEFAULT_IMAGE_TYPE;

  // 尝试从 base64 解码并检测文件头
  try {
    const buffer = Buffer.from(str, 'base64');
    const detectedType = detectImageTypeFromBuffer(buffer);
    if (detectedType) return detectedType;
  } catch {}

  // 回退到首字符映射
  return BASE64_PREFIX_MAP[str.charAt(0)] || DEFAULT_IMAGE_TYPE;
};

export const getImageBase64 = async (url: string) => {
  addLog.debug(`Load image to base64: ${url}`);

  try {
    const response = await retryFn(() =>
      axios.get(url, {
        baseURL: serverRequestBaseUrl,
        responseType: 'arraybuffer',
        proxy: false
      })
    );

    const buffer = Buffer.from(response.data);
    const base64 = buffer.toString('base64');
    const headerContentType = getContentTypeFromHeader(response.headers['content-type']);

    // 检测图片类型的优先级策略
    const imageType = (() => {
      // 1. 如果 Header 是有效的图片类型，直接使用
      if (headerContentType && isValidImageContentType(headerContentType)) {
        return headerContentType;
      }

      // 2. 使用文件头检测（适用于通用二进制类型或无效类型）
      const detectedType = detectImageTypeFromBuffer(buffer);
      if (detectedType) {
        return detectedType;
      }

      // 3. 回退到 base64 推断
      return guessBase64ImageType(base64);
    })();

    return {
      completeBase64: `data:${imageType};base64,${base64}`,
      base64,
      mime: imageType
    };
  } catch (error) {
    addLog.debug(`Load image to base64 failed: ${url}`);
    console.log(error);
    return Promise.reject(error);
  }
};

export const addEndpointToImageUrl = (text: string) => {
  const baseURL = process.env.FE_DOMAIN;
  const subRoute = process.env.NEXT_PUBLIC_BASE_URL || '';
  if (!baseURL) return text;
  const regex = new RegExp(
    `(?<!https?:\\/\\/[^\\s]*)(?:${subRoute}\\/api\\/system\\/img\\/[^\\s.]*\\.[^\\s]*)`,
    'g'
  );
  // 匹配 ${subRoute}/api/system/img/xxx.xx 的图片链接，并追加 baseURL
  return text.replace(regex, (match) => {
    return `${baseURL}${match}`;
  });
};

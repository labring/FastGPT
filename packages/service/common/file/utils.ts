import { isProduction } from '@fastgpt/global/common/system/constants';
import fs from 'fs';
import path from 'path';

export const getFileMaxSize = () => {
  const mb = global.feConfigs?.uploadFileMaxSize || 1000;
  return mb * 1024 * 1024;
};

export const removeFilesByPaths = (paths: string[]) => {
  paths.forEach((path) => {
    fs.unlink(path, (err) => {
      if (err) {
        // console.error(err);
      }
    });
  });
};

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

// 通用二进制类型列表
const GENERIC_BINARY_TYPES = [
  'application/octet-stream',
  'application/octst-stream', // 处理拼写错误
  'binary/octet-stream',
  'application/unknown'
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

// 工具函数：标准化 Content-Type
const normalizeContentType = (contentType: string): string => {
  return contentType.toLowerCase().split(';')[0].trim();
};

export const isValidImageContentType = (contentType: string): boolean => {
  if (!contentType) return false;
  return VALID_IMAGE_TYPES.has(normalizeContentType(contentType));
};

export const isGenericBinaryType = (contentType: string): boolean => {
  if (!contentType) return false;
  return GENERIC_BINARY_TYPES.includes(normalizeContentType(contentType));
};

export const detectImageTypeFromBuffer = (buffer: Buffer): string | null => {
  if (!buffer || buffer.length < 8) return null;

  for (const { type, magic, check } of IMAGE_SIGNATURES) {
    if (buffer.length < magic.length) continue;

    const matches = magic.every((byte, index) => buffer[index] === byte);
    if (matches && (!check || check(buffer))) {
      return type;
    }
  }

  return null;
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

export const getFileContentTypeFromHeader = (header: string): string | undefined => {
  const contentType = header.split(';')[0];
  return contentType?.trim();
};

export const clearDirFiles = (dirPath: string) => {
  if (!fs.existsSync(dirPath)) {
    return;
  }

  fs.rmdirSync(dirPath, {
    recursive: true
  });
};

export const clearTmpUploadFiles = () => {
  if (!isProduction) return;
  const tmpPath = '/tmp';

  fs.readdir(tmpPath, (err, files) => {
    if (err) return;

    for (const file of files) {
      if (file === 'v8-compile-cache-0') continue;

      const filePath = path.join(tmpPath, file);

      fs.stat(filePath, (err, stats) => {
        if (err) return;

        // 如果文件是在2小时前上传的，则认为是临时文件并删除它
        if (Date.now() - stats.mtime.getTime() > 2 * 60 * 60 * 1000) {
          fs.unlink(filePath, (err) => {
            if (err) return;
            console.log(`Deleted temp file: ${filePath}`);
          });
        }
      });
    }
  });
};

import axios from 'axios';
import { addLog } from '../../system/log';
import { serverRequestBaseUrl } from '../../api/serverRequest';
import {
  getFileContentTypeFromHeader,
  guessBase64ImageType,
  detectImageTypeFromBuffer,
  isValidImageContentType
} from '../utils';
import { retryFn } from '@fastgpt/global/common/system/utils';

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
    const headerContentType = getFileContentTypeFromHeader(response.headers['content-type']);

    // 检测图片类型的优先级策略
    const detectImageType = (): string => {
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
    };

    const imageType = detectImageType();

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

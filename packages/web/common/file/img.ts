import { i18nT } from '@fastgpt/global/common/i18n/utils';

export type CompressImgProps = {
  maxW?: number;
  maxH?: number;
  maxSize?: number;
};

export const compressBase64Img = ({
  base64Img,
  maxW = 1080,
  maxH = 1080,
  maxSize = 1024 * 500 // 500kb
}: CompressImgProps & {
  base64Img: string;
}) => {
  return new Promise<string>((resolve, reject) => {
    const fileType =
      /^data:([a-zA-Z0-9]+\/[a-zA-Z0-9-.+]+).*,/.exec(base64Img)?.[1] || 'image/jpeg';

    const img = new Image();
    img.src = base64Img;
    img.onload = async () => {
      let width = img.width;
      let height = img.height;

      if (width > height) {
        if (width > maxW) {
          height *= maxW / width;
          width = maxW;
        }
      } else {
        if (height > maxH) {
          width *= maxH / height;
          height = maxH;
        }
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');

      if (!ctx) {
        return reject(i18nT('common:image_compression_failed'));
      }

      ctx.drawImage(img, 0, 0, width, height);
      const compressedDataUrl = canvas.toDataURL(fileType, 1);
      // 移除 canvas 元素
      canvas.remove();

      if (compressedDataUrl.length > maxSize) {
        return reject(i18nT('common:image_too_large'));
      }

      resolve(compressedDataUrl);
    };
    img.onerror = reject;
  });
};

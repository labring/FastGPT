import { postUploadImg, postUploadFiles } from '@/web/common/file/api';
import { BucketNameEnum } from '@fastgpt/global/common/file/constants';

/**
 * upload file to mongo gridfs
 */
export const uploadFiles = ({
  files,
  bucketName,
  metadata = {},
  percentListen
}: {
  files: File[];
  bucketName: `${BucketNameEnum}`;
  metadata?: Record<string, any>;
  percentListen?: (percent: number) => void;
}) => {
  const form = new FormData();
  form.append('metadata', JSON.stringify(metadata));
  form.append('bucketName', bucketName);
  files.forEach((file) => {
    form.append('file', file, encodeURIComponent(file.name));
  });
  return postUploadFiles(form, (e) => {
    if (!e.total) return;

    const percent = Math.round((e.loaded / e.total) * 100);
    percentListen && percentListen(percent);
  });
};

/**
 * compress image. response base64
 * @param maxSize The max size of the compressed image
 */
export const compressBase64ImgAndUpload = ({
  base64,
  maxW = 200,
  maxH = 200,
  maxSize = 1024 * 100, // 100kb
  expiredTime
}: {
  base64: string;
  maxW?: number;
  maxH?: number;
  maxSize?: number;
  expiredTime?: Date;
}) => {
  return new Promise<string>((resolve, reject) => {
    const fileType = /^data:([a-zA-Z0-9]+\/[a-zA-Z0-9-.+]+).*,/.exec(base64)?.[1] || 'image/jpeg';

    const img = new Image();
    img.src = base64;
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
        return reject('压缩图片异常');
      }

      ctx.drawImage(img, 0, 0, width, height);
      const compressedDataUrl = canvas.toDataURL(fileType, 0.8);
      // 移除 canvas 元素
      canvas.remove();

      if (compressedDataUrl.length > maxSize) {
        return reject('图片太大了');
      }

      try {
        const src = await postUploadImg(compressedDataUrl, expiredTime);
        resolve(src);
      } catch (error) {
        reject(error);
      }
    };
  });
};
export const compressImgFileAndUpload = async ({
  file,
  maxW,
  maxH,
  maxSize,
  expiredTime
}: {
  file: File;
  maxW?: number;
  maxH?: number;
  maxSize?: number;
  expiredTime?: Date;
}) => {
  const reader = new FileReader();
  reader.readAsDataURL(file);

  const base64 = await new Promise<string>((resolve, reject) => {
    reader.onload = async () => {
      resolve(reader.result as string);
    };
    reader.onerror = (err) => {
      console.log(err);
      reject('压缩图片异常');
    };
  });

  return compressBase64ImgAndUpload({
    base64,
    maxW,
    maxH,
    maxSize,
    expiredTime
  });
};

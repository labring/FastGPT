import { postUploadImg, postUploadFiles } from '@/web/common/file/api';
import { UploadImgProps } from '@fastgpt/global/common/file/api';
import { BucketNameEnum } from '@fastgpt/global/common/file/constants';
import {
  compressBase64ImgAndUpload as compressBase64ImgAndUploadControl,
  type CompressImgProps
} from '@fastgpt/web/common/file/img';

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

export const getUploadMdImgController = ({
  base64Img,
  metadata
}: {
  base64Img: string;
  metadata: Record<string, any>;
}) =>
  compressBase64ImgAndUpload({
    base64Img,
    maxW: 4000,
    maxH: 4000,
    maxSize: 1024 * 1024 * 5,
    metadata
  });

/**
 * compress image. response base64
 * @param maxSize The max size of the compressed image
 */
export const compressBase64ImgAndUpload = ({
  expiredTime,
  metadata,
  shareId,
  ...props
}: UploadImgProps & CompressImgProps) => {
  return compressBase64ImgAndUploadControl({
    ...props,
    uploadController: (base64Img) =>
      postUploadImg({
        shareId,
        base64Img,
        expiredTime,
        metadata
      })
  });
};
export const compressImgFileAndUpload = async ({
  file,
  maxW,
  maxH,
  maxSize,
  expiredTime,
  shareId
}: {
  file: File;
  maxW?: number;
  maxH?: number;
  maxSize?: number;
  expiredTime?: Date;
  shareId?: string;
}) => {
  const reader = new FileReader();
  reader.readAsDataURL(file);

  const base64Img = await new Promise<string>((resolve, reject) => {
    reader.onload = async () => {
      resolve(reader.result as string);
    };
    reader.onerror = (err) => {
      console.log(err);
      reject('压缩图片异常');
    };
  });

  return compressBase64ImgAndUpload({
    base64Img,
    maxW,
    maxH,
    maxSize,
    expiredTime,
    shareId
  });
};

import { postUploadImg, postUploadFiles } from '@/web/common/file/api';
import type { UploadImgProps } from '@fastgpt/global/common/file/api';
import type { BucketNameEnum } from '@fastgpt/global/common/file/constants';
import type { preUploadImgProps } from '@fastgpt/global/common/file/api';
import { compressBase64Img, type CompressImgProps } from '@fastgpt/web/common/file/img';
import type { UploadChatFileProps, UploadDatasetFileProps } from '@/pages/api/common/file/upload';

/**
 * upload file to mongo gridfs
 */
export const uploadFile2DB = async ({
  file,
  bucketName,
  data,
  metadata = {},
  percentListen
}: {
  file: File;
  bucketName: `${BucketNameEnum}`;
  data: UploadChatFileProps | UploadDatasetFileProps;
  metadata?: Record<string, any>;
  percentListen?: (percent: number) => void;
}) => {
  const formData = new FormData();
  formData.append('metadata', JSON.stringify(metadata));
  formData.append('bucketName', bucketName);
  formData.append('file', file, encodeURIComponent(file.name));
  if (data) {
    formData.append('data', JSON.stringify(data));
  }

  const res = await postUploadFiles(formData, (e) => {
    if (!e.total) return;

    const percent = Math.round((e.loaded / e.total) * 100);
    percentListen?.(percent);
  });
  return res;
};

/**
 * compress image. response base64
 * @param maxSize The max size of the compressed image
 */
const compressBase64ImgAndUpload = async ({
  base64Img,
  maxW,
  maxH,
  maxSize,
  ...props
}: UploadImgProps & CompressImgProps) => {
  const compressUrl = await compressBase64Img({
    base64Img,
    maxW,
    maxH,
    maxSize
  });

  return postUploadImg({
    ...props,
    base64Img: compressUrl
  });
};

export const compressImgFileAndUpload = async ({
  file,
  ...props
}: preUploadImgProps &
  CompressImgProps & {
    file: File;
  }) => {
  const reader = new FileReader();
  reader.readAsDataURL(file);

  const base64Img = await new Promise<string>((resolve, reject) => {
    reader.onload = () => {
      resolve(reader.result as string);
    };
    reader.onerror = (err) => {
      reject('Load image error');
    };
  });

  return compressBase64ImgAndUpload({
    base64Img,
    ...props
  });
};

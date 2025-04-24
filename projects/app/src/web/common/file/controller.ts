import {
  postUploadImg,
  postUploadFiles,
  postS3PresignedUpload,
  postS3UploadFile
} from '@/web/common/file/api';
import { UploadImgProps } from '@fastgpt/global/common/file/api';
import { BucketNameEnum } from '@fastgpt/global/common/file/constants';
import { preUploadImgProps } from '@fastgpt/global/common/file/api';
import { compressBase64Img, type CompressImgProps } from '@fastgpt/web/common/file/img';
import type { UploadChatFileProps, UploadDatasetFileProps } from '@/pages/api/common/file/upload';

async function legacyUpload({
  file,
  bucketName,
  data,
  metadata,
  percentListen
}: {
  file: File;
  bucketName: `${BucketNameEnum}`;
  data: UploadChatFileProps | UploadDatasetFileProps;
  metadata?: Record<string, any>;
  percentListen?: (percent: number) => void;
}) {
  const form = new FormData();
  form.append('metadata', JSON.stringify(metadata));
  form.append('bucketName', bucketName);
  form.append('file', file, encodeURIComponent(file.name));
  form.append('data', JSON.stringify(data));

  return postUploadFiles(form, (e) => {
    if (!e.total) return;

    const percent = Math.round((e.loaded / e.total) * 100);
    percentListen?.(percent);
  });
}

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
  if (bucketName === BucketNameEnum.dataset) {
    return legacyUpload({ file, bucketName, data, metadata, percentListen });
  } else if (bucketName === BucketNameEnum.chat) {
    const { fileId, formData, postURL, previewUrl } = await postS3PresignedUpload({
      bucketName,
      fileName: file.name,
      metadata: JSON.stringify(metadata),
      data
    });

    if (previewUrl) {
      const form = new FormData();
      for (const [key, value] of Object.entries(formData)) {
        form.append(key, value);
      }

      form.append('file', file, encodeURIComponent(file.name));

      await postS3UploadFile(postURL, form, (e) => {
        if (!e.total) return;

        const percent = Math.round((e.loaded / e.total) * 100);
        percentListen?.(percent);
      });

      return Promise.resolve({ fileId, previewUrl });
    } else {
      // fallback to legacy upload
      return legacyUpload({ file, bucketName, data, metadata, percentListen });
    }
  }
  return Promise.resolve({ fileId: '', previewUrl: '' });
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
      console.log(err);
      reject('Load image error');
    };
  });

  return compressBase64ImgAndUpload({
    base64Img,
    ...props
  });
};

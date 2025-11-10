import { postUploadFiles } from '@/web/common/file/api';
import type { BucketNameEnum } from '@fastgpt/global/common/file/constants';
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

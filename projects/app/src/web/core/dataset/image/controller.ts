import { uploadDatasetImage } from './api';
import type { UploadDatasetImageProps } from '@fastgpt/global/core/dataset/image/type';

export const uploadImage2Dataset = async ({
  file,
  datasetId,
  collectionId
}: {
  file: File;
  datasetId: string;
  collectionId?: string;
}) => {
  const data: UploadDatasetImageProps = {
    datasetId,
    collectionId
  };

  return uploadDatasetImage(file, data);
};

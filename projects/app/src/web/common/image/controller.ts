import { uploadDatasetImage } from './api';
import type { UploadDatasetImageProps } from '@fastgpt/global/core/dataset/imageCollection';

export const uploadImage2Dataset = async ({
  file,
  datasetId,
  collectionId,
  percentListen
}: {
  file: File;
  datasetId: string;
  collectionId?: string;
  percentListen?: (percent: number) => void;
}) => {
  const data: UploadDatasetImageProps = {
    datasetId,
    collectionId
  };

  return uploadDatasetImage(file, data, percentListen);
};

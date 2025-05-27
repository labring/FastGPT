import { GET, POST, DELETE } from '@/web/common/api/request';
import { type AxiosProgressEvent } from 'axios';

export const uploadDatasetImage = (
  file: File,
  data: {
    datasetId: string;
    collectionId?: string;
  }
) => {
  const formData = new FormData();
  formData.append('file', file, encodeURIComponent(file.name));
  formData.append('data', JSON.stringify(data));

  return POST<{
    id: string;
  }>('/core/dataset/image/upload', formData, {
    timeout: 600000,
    headers: {
      'Content-Type': 'multipart/form-data; charset=utf-8'
    }
  });
};

export const createImageDatasetCollection = async ({
  datasetId,
  collectionName,
  imageIds,
  filesInfo
}: {
  datasetId: string;
  collectionName: string;
  imageIds: string[];
  filesInfo: Array<{
    name: string;
    size: number;
    type: string;
  }>;
}) => {
  try {
    // Call fileId_image interface once with all image IDs
    const fileIdParams = {
      fileIds: imageIds,
      datasetId: datasetId,
      imageIndex: true,
      customPdfParse: false,
      collectionName,
      metadata: {
        imageCount: imageIds.length,
        isImageCollection: true
      }
    };

    const processResponse = await fetch('/api/core/dataset/collection/create/fileId_image', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(fileIdParams)
    });

    if (!processResponse.ok) {
      const errorText = await processResponse.text();
      throw new Error(`处理图片失败: ${processResponse.status} ${errorText}`);
    }

    const processResult = await processResponse.json();

    // Create results for each image
    const processResults = imageIds.map((imageId, index) => ({
      imageId,
      collectionId: processResult.data?.collectionId || '',
      fileName: filesInfo[index]?.name || `图片${index + 1}`,
      result: processResult
    }));

    return {
      collectionId: processResult.data?.collectionId || '',
      processResults,
      successCount: processResults.length,
      totalCount: imageIds.length
    };
  } catch (error) {
    // If the batch processing fails, return error for all images
    const processResults = imageIds.map((imageId, index) => ({
      imageId,
      fileName: filesInfo[index]?.name || `图片${index + 1}`,
      error: error instanceof Error ? error.message : String(error)
    }));

    return {
      collectionId: '',
      processResults,
      successCount: 0,
      totalCount: imageIds.length
    };
  }
};

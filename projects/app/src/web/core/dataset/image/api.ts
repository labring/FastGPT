import { POST } from '@/web/common/api/request';
import type { UploadDatasetImageProps } from '@fastgpt/global/core/dataset/image/type';

export const uploadDatasetImage = async (
  file: File,
  data: {
    datasetId: string;
    collectionId?: string;
  }
) => {
  const formData = new FormData();
  formData.append('file', file, encodeURIComponent(file.name));
  formData.append('data', JSON.stringify(data));

  const imageId = await POST<string>('/core/dataset/image/upload', formData, {
    timeout: 600000,
    headers: {
      'Content-Type': 'multipart/form-data; charset=utf-8'
    }
  });

  // To maintain compatibility, the string ID is wrapped into an object and returned.
  return { id: imageId };
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
  if (!collectionName) {
    throw new Error('Collection name is required');
  }

  try {
    // Call fileId_image interface once with all image IDs
    const imageParams = {
      imageIds: imageIds,
      datasetId: datasetId,
      collectionName
    };

    const processResult = await POST<{ collectionId: string }>(
      '/core/dataset/collection/create/images',
      imageParams
    );

    // Create results for each image
    const processResults = imageIds.map((imageId, index) => ({
      imageId,
      collectionId: processResult.collectionId || '',
      fileName: filesInfo[index]?.name || `图片${index + 1}`,
      result: processResult
    }));

    return {
      collectionId: processResult.collectionId || '',
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

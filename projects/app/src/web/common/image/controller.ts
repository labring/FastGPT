import { uploadDatasetImage } from './api';
import type { UploadDatasetImageProps } from '@fastgpt/global/core/dataset/imageCollection';
import {
  DatasetCollectionTypeEnum,
  DatasetCollectionDataProcessModeEnum,
  ChunkSettingModeEnum
} from '@fastgpt/global/core/dataset/constants';

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
  try {
    const data: UploadDatasetImageProps = {
      datasetId,
      collectionId
    };

    const result = await uploadDatasetImage(file, data, percentListen);
    return result;
  } catch (error) {
    throw error;
  }
};

export const createImageDatasetCollection = async ({
  datasetId,
  parentId,
  collectionName,
  imageIds,
  filesInfo
}: {
  datasetId: string;
  parentId?: string;
  collectionName: string;
  imageIds: string[];
  filesInfo: Array<{
    name: string;
    size: number;
    type: string;
  }>;
}) => {
  try {
    // Create image collection
    const createCollectionResponse = await fetch('/api/core/dataset/collection/create', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        datasetId,
        parentId,
        imageIds,
        name: collectionName,
        type: DatasetCollectionTypeEnum.file,
        rawText: JSON.stringify({
          images: imageIds.length,
          files: filesInfo
        }),
        trainingType: DatasetCollectionDataProcessModeEnum.chunk,
        chunkSettingMode: ChunkSettingModeEnum.auto,
        metadata: {
          imageCount: imageIds.length,
          isImageCollection: true
        }
      })
    });

    if (!createCollectionResponse.ok) {
      const errorData = await createCollectionResponse.json();
      throw new Error(errorData.message || '创建集合失败');
    }

    const createResult = await createCollectionResponse.json();
    const collectionId = createResult.data;

    // Process each image and start training
    const processResults = [];
    for (let i = 0; i < imageIds.length; i++) {
      try {
        const imageId = imageIds[i];
        const fileInfo = filesInfo[i];

        const fileIdParams = {
          fileId: imageId,
          datasetId: datasetId,
          imageIndex: true,
          customPdfParse: false,
          parentId: collectionId
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

        processResults.push({
          imageId,
          fileName: fileInfo.name,
          result: processResult
        });
      } catch (error) {
        processResults.push({
          imageId: imageIds[i],
          fileName: filesInfo[i]?.name || `第${i}个文件`,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }

    return {
      collectionId,
      processResults,
      successCount: processResults.filter((r) => !r.error).length,
      totalCount: imageIds.length
    };
  } catch (error) {
    throw error;
  }
};

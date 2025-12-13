import type { NextApiRequest, NextApiResponse } from 'next';
import { authDataset } from '@fastgpt/service/support/permission/dataset/auth';
import { createCollectionAndInsertData } from '@fastgpt/service/core/dataset/collection/controller';
import { DatasetCollectionTypeEnum } from '@fastgpt/global/core/dataset/constants';
import { NextAPI } from '@/service/middleware/entry';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import { type CreateCollectionResponse } from '@/global/core/dataset/api';
import { multer } from '@fastgpt/service/common/file/multer';
import { getS3DatasetSource } from '@fastgpt/service/common/s3/sources/dataset';

async function handler(req: NextApiRequest): CreateCollectionResponse {
  const filepaths: string[] = [];

  try {
    const result = await multer.resolveFormData({
      request: req,
      maxFileSize: global.feConfigs?.uploadFileMaxSize
    });
    filepaths.push(result.fileMetadata.path);

    const { teamId, tmbId, dataset } = await authDataset({
      req,
      authToken: true,
      authApiKey: true,
      per: WritePermissionVal,
      datasetId: result.data.datasetId
    });

    const { fileMetadata, collectionMetadata, ...collectionData } = result.data;
    const collectionName = decodeURIComponent(result.fileMetadata.originalname);

    const fileId = await getS3DatasetSource().upload({
      datasetId: dataset._id,
      stream: result.getReadStream(),
      size: result.fileMetadata.size,
      filename: collectionName
    });

    const { collectionId, insertResults } = await createCollectionAndInsertData({
      dataset,
      createCollectionParams: {
        ...collectionData,
        datasetId: dataset._id,
        name: collectionName,
        teamId,
        tmbId,
        type: DatasetCollectionTypeEnum.file,
        fileId,
        metadata: {
          ...collectionMetadata,
          relatedImgId: fileId
        }
      }
    });

    return { collectionId, results: insertResults };
  } catch (error) {
    return Promise.reject(error);
  } finally {
    multer.clearDiskTempFiles(filepaths);
  }
}

export const config = {
  api: {
    bodyParser: false
  }
};

export default NextAPI(handler);

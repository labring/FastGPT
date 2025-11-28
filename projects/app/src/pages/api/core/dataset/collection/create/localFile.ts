import type { NextApiRequest, NextApiResponse } from 'next';
import { getUploadModel } from '@fastgpt/service/common/file/multer';
import { authDataset } from '@fastgpt/service/support/permission/dataset/auth';
import { type FileCreateDatasetCollectionParams } from '@fastgpt/global/core/dataset/api';
import { createCollectionAndInsertData } from '@fastgpt/service/core/dataset/collection/controller';
import { DatasetCollectionTypeEnum } from '@fastgpt/global/core/dataset/constants';
import { NextAPI } from '@/service/middleware/entry';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import { type CreateCollectionResponse } from '@/global/core/dataset/api';
import { getS3DatasetSource } from '@fastgpt/service/common/s3/sources/dataset';
import { removeS3TTL } from '@fastgpt/service/common/s3/utils';

async function handler(req: NextApiRequest, res: NextApiResponse<any>): CreateCollectionResponse {
  try {
    const upload = getUploadModel({ maxSize: global.feConfigs?.uploadFileMaxSize });
    const { buffer, originalname } = await upload.getFileBuffer(req, res);
    const data = (() => {
      try {
        return JSON.parse(req.body?.data || '{}');
      } catch (error) {
        return {};
      }
    })() as FileCreateDatasetCollectionParams;

    const { teamId, tmbId, dataset } = await authDataset({
      req,
      authToken: true,
      authApiKey: true,
      per: WritePermissionVal,
      datasetId: data.datasetId
    });

    const s3DatasetSource = getS3DatasetSource();

    const fileId = await s3DatasetSource.uploadDatasetFileByBuffer({
      datasetId: String(dataset._id),
      buffer,
      filename: originalname
    });

    await removeS3TTL({ key: fileId, bucketName: 'private' });

    const { fileMetadata, collectionMetadata, ...collectionData } = data;

    // 3. Create collection
    const { collectionId, insertResults } = await createCollectionAndInsertData({
      dataset,
      createCollectionParams: {
        ...collectionData,
        name: originalname,
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
  }
}

export const config = {
  api: {
    bodyParser: false
  }
};

export default NextAPI(handler);

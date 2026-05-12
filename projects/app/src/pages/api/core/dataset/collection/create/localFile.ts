import {
  authDataset,
  authDatasetCollection
} from '@fastgpt/service/support/permission/dataset/auth';
import {
  CreateCollectionByLocalFileBodySchema,
  type CreateCollectionWithResultResponseType
} from '@fastgpt/global/openapi/core/dataset/collection/createApi';
import { createCollectionAndInsertData } from '@fastgpt/service/core/dataset/collection/controller';
import { DatasetCollectionTypeEnum } from '@fastgpt/global/core/dataset/constants';
import { NextAPI } from '@/service/middleware/entry';
import { type ApiRequestProps } from '@fastgpt/service/type/next';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import { multer } from '@fastgpt/service/common/file/multer';
import { getS3DatasetSource } from '@fastgpt/service/common/s3/sources/dataset';
import { documentFileType } from '@fastgpt/global/common/file/constants';
import { parseAllowedExtensions } from '@fastgpt/service/common/s3/utils/uploadConstraints';
import { checkDatasetIndexLimit } from '@fastgpt/service/support/permission/teamLimit';
import { DatasetErrEnum } from '@fastgpt/global/common/error/code/dataset';

async function handler(req: ApiRequestProps): Promise<CreateCollectionWithResultResponseType> {
  const filepaths: string[] = [];

  try {
    const result = await multer.resolveFormData({
      request: req,
      maxFileSize: global.feConfigs.uploadFileMaxSize,
      allowedExtensions: parseAllowedExtensions(documentFileType)
    });
    filepaths.push(result.fileMetadata.path);

    const collectionData = CreateCollectionByLocalFileBodySchema.parse(result.data);

    const { teamId, tmbId, dataset } = collectionData.parentId
      ? await authDatasetCollection({
          req,
          authToken: true,
          authApiKey: true,
          collectionId: collectionData.parentId,
          per: WritePermissionVal
        }).then((res) => {
          if (
            result.data.datasetId &&
            String(res.collection.datasetId) !== String(result.data.datasetId)
          ) {
            return Promise.reject(DatasetErrEnum.unAuthDataset);
          }
          return {
            teamId: res.teamId,
            tmbId: res.tmbId,
            dataset: res.collection.dataset
          };
        })
      : await authDataset({
          req,
          authToken: true,
          authApiKey: true,
          per: WritePermissionVal,
          datasetId: result.data.datasetId
        });

    // Check dataset limit
    await checkDatasetIndexLimit({
      teamId,
      insertLen: 1
    });

    const collectionName = decodeURIComponent(result.fileMetadata.originalname);

    const fileId = await getS3DatasetSource().upload({
      datasetId: dataset._id,
      stream: result.getReadStream(),
      size: result.fileMetadata.size,
      filename: collectionName
    });

    return await createCollectionAndInsertData({
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
          ...collectionData.metadata,
          relatedImgId: fileId
        }
      }
    });
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

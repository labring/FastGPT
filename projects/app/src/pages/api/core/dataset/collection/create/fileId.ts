import {
  authDataset,
  authDatasetCollection
} from '@fastgpt/service/support/permission/dataset/auth';
import {
  CreateCollectionByFileIdBodySchema,
  type CreateCollectionWithResultResponseType
} from '@fastgpt/global/openapi/core/dataset/collection/createApi';
import { createCollectionAndInsertData } from '@fastgpt/service/core/dataset/collection/controller';
import { DatasetCollectionTypeEnum } from '@fastgpt/global/core/dataset/constants';
import { NextAPI } from '@/service/middleware/entry';
import { type ApiRequestProps } from '@fastgpt/service/type/next';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import { CommonErrEnum } from '@fastgpt/global/common/error/code/common';
import { getS3DatasetSource } from '@fastgpt/service/common/s3/sources/dataset';
import { isS3ObjectKey } from '@fastgpt/service/common/s3/utils';
import { checkDatasetIndexLimit } from '@fastgpt/service/support/permission/teamLimit';
import { DatasetErrEnum } from '@fastgpt/global/common/error/code/dataset';

async function handler(req: ApiRequestProps): Promise<CreateCollectionWithResultResponseType> {
  const { fileId, customPdfParse, ...body } = CreateCollectionByFileIdBodySchema.parse(req.body);

  const { teamId, tmbId, dataset } = body.parentId
    ? await authDatasetCollection({
        req,
        authToken: true,
        authApiKey: true,
        collectionId: body.parentId,
        per: WritePermissionVal
      }).then((res) => {
        if (body.datasetId && String(res.collection.datasetId) !== String(body.datasetId)) {
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
        datasetId: body.datasetId
      });

  if (!isS3ObjectKey(fileId, 'dataset')) {
    return Promise.reject('Invalid dataset file key');
  }

  const metadata = await getS3DatasetSource().getFileMetadata(fileId);
  if (!metadata) {
    return Promise.reject(CommonErrEnum.fileNotFound);
  }

  // Check dataset limit
  await checkDatasetIndexLimit({
    teamId,
    insertLen: 1
  });

  return createCollectionAndInsertData({
    dataset,
    createCollectionParams: {
      ...body,
      teamId,
      tmbId,
      type: DatasetCollectionTypeEnum.file,
      name: metadata.filename,
      fileId, // ObjectId -> ObjectKey
      customPdfParse
    }
  });
}

export default NextAPI(handler);

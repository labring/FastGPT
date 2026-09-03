import { authDatasetCollectionCreate } from '@fastgpt/service/support/permission/dataset/auth';
import {
  CreateCollectionByFileIdBodySchema,
  type CreateCollectionWithResultResponseType
} from '@fastgpt/global/openapi/core/dataset/collection/createApi';
import { createCollectionAndInsertData } from '@fastgpt/service/core/dataset/collection/controller';
import { DatasetCollectionTypeEnum } from '@fastgpt/global/core/dataset/constants';
import { NextAPI } from '@/service/middleware/entry';
import { type ApiRequestProps } from '@fastgpt/next/type';
import { CommonErrEnum } from '@fastgpt/global/common/error/code/common';
import { getS3DatasetSource } from '@fastgpt/service/common/s3/sources/dataset';
import { isS3ObjectKey } from '@fastgpt/service/common/s3/utils';
import { checkDatasetIndexLimit } from '@fastgpt/service/support/permission/teamLimit';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';

async function handler(req: ApiRequestProps): Promise<CreateCollectionWithResultResponseType> {
  const { fileId, customPdfParse, ...body } = parseApiInput({
    req,
    bodySchema: CreateCollectionByFileIdBodySchema
  }).body;

  const { teamId, tmbId, dataset } = await authDatasetCollectionCreate({
    req,
    authToken: true,
    authApiKey: true,
    datasetId: body.datasetId,
    parentId: body.parentId
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

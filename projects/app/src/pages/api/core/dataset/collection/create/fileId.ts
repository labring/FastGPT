import { authDatasetCollectionCreate } from '@fastgpt/service/support/permission/dataset/auth';
import {
  CreateCollectionByFileIdBodySchema,
  type CreateCollectionWithResultResponseType
} from '@fastgpt/global/openapi/core/dataset/collection/createApi';
import { createCollectionAndInsertData } from '@fastgpt/service/core/dataset/collection/controller';
import {
  DatasetAuditEventEnum,
  DatasetCollectionTypeEnum
} from '@fastgpt/global/core/dataset/constants';
import { NextAPI } from '@/service/middleware/entry';
import { type ApiRequestProps } from '@fastgpt/next/type';
import { CommonErrEnum } from '@fastgpt/global/common/error/code/common';
import { getS3DatasetSource } from '@fastgpt/service/common/s3/sources/dataset';
import { isAuthorizedDatasetFileS3Key } from '@fastgpt/service/common/s3/sources/dataset/key';
import { checkDatasetIndexLimit } from '@fastgpt/service/support/permission/teamLimit';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { addAuditLog } from '@fastgpt/service/support/user/audit/util';
import {
  getCollectionAuditLocation,
  getCollectionAuditObjectType
} from '@fastgpt/service/core/dataset/collection/audit';

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

  // fileId 由客户端传入，必须绑定到已鉴权的 datasetId，避免跨团队对象被导入。
  if (!isAuthorizedDatasetFileS3Key({ key: fileId, datasetId: body.datasetId })) {
    return Promise.reject(CommonErrEnum.unAuthFileKey);
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

  const result = await createCollectionAndInsertData({
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

  void addAuditLog({
    tmbId,
    teamId,
    event: DatasetAuditEventEnum.DATASET_COLLECTION_CREATE,
    params: {
      collectionName: metadata.filename,
      objectType: getCollectionAuditObjectType(DatasetCollectionTypeEnum.file),
      location: await getCollectionAuditLocation({
        datasetName: dataset.name,
        parentId: body.parentId
      })
    }
  });

  return result;
}

export default NextAPI(handler);

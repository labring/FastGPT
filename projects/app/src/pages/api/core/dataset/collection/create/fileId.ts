import { authDatasetCollectionCreate } from '@fastgpt/service/support/permission/dataset/auth';
import {
  CreateCollectionByFileIdBodySchema,
  type CreateCollectionWithResultResponseType
} from '@fastgpt/global/openapi/core/dataset/collection/createApi';
import { createCollectionAndInsertData } from '@fastgpt/service/core/dataset/collection/controller';
import { getDatasetModelAuthContext } from '@fastgpt/service/core/dataset/model';
import { DatasetCollectionTypeEnum } from '@fastgpt/global/core/dataset/constants';
import { NextAPI } from '@/service/middleware/entry';
import { type ApiRequestProps } from '@fastgpt/next/type';
import { CommonErrEnum } from '@fastgpt/global/common/error/code/common';
import { getS3DatasetSource } from '@fastgpt/service/common/s3/sources/dataset';
import { isAuthorizedDatasetFileS3Key } from '@fastgpt/service/common/s3/sources/dataset/key';
import { checkDatasetIndexLimit } from '@fastgpt/service/support/permission/teamLimit';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { addAuditLog } from '@fastgpt/service/support/user/audit/util';
import { buildCollectionCreateAuditLog } from '@fastgpt/service/core/dataset/audit/collection';

async function handler(req: ApiRequestProps): Promise<CreateCollectionWithResultResponseType> {
  const { fileId, customPdfParse, ...body } = parseApiInput({
    req,
    bodySchema: CreateCollectionByFileIdBodySchema
  }).body;

  const { teamId, tmbId, isRoot, dataset } = await authDatasetCollectionCreate({
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

  const modelAuthContext = await getDatasetModelAuthContext({
    dataset,
    teamId,
    tmbId,
    isRoot
  });
  const metadata = await getS3DatasetSource().getFileMetadata(fileId);
  if (!metadata) {
    return Promise.reject(CommonErrEnum.fileNotFound);
  }

  // Check dataset limit
  await checkDatasetIndexLimit({
    teamId,
    insertLen: 1
  });

  const collectionType = DatasetCollectionTypeEnum.file;
  const result = await createCollectionAndInsertData({
    dataset,
    modelAuthContext,
    createCollectionParams: {
      ...body,
      teamId,
      tmbId,
      type: collectionType,
      name: metadata.filename,
      fileId, // ObjectId -> ObjectKey
      customPdfParse
    }
  });

  void addAuditLog(
    await buildCollectionCreateAuditLog({
      teamId,
      tmbId,
      dataset,
      collection: {
        _id: result.collectionId,
        name: metadata.filename,
        type: collectionType,
        parentId: body.parentId
      }
    })
  );

  return result;
}

export default NextAPI(handler);

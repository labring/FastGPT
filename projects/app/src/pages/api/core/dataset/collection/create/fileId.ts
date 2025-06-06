import { getFileById } from '@fastgpt/service/common/file/gridfs/controller';
import { authDataset } from '@fastgpt/service/support/permission/dataset/auth';
import { type FileIdCreateDatasetCollectionParams } from '@fastgpt/global/core/dataset/api';
import { createCollectionAndInsertData } from '@fastgpt/service/core/dataset/collection/controller';
import { DatasetCollectionTypeEnum } from '@fastgpt/global/core/dataset/constants';
import { BucketNameEnum } from '@fastgpt/global/common/file/constants';
import { NextAPI } from '@/service/middleware/entry';
import { type ApiRequestProps } from '@fastgpt/service/type/next';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import { type CreateCollectionResponse } from '@/global/core/dataset/api';
import { deleteRawTextBuffer } from '@fastgpt/service/common/buffer/rawText/controller';
import { CommonErrEnum } from '@fastgpt/global/common/error/code/common';

async function handler(
  req: ApiRequestProps<FileIdCreateDatasetCollectionParams>
): CreateCollectionResponse {
  const { fileId, customPdfParse, ...body } = req.body;

  const { teamId, tmbId, dataset } = await authDataset({
    req,
    authToken: true,
    authApiKey: true,
    per: WritePermissionVal,
    datasetId: body.datasetId
  });

  // 1. read file
  const file = await getFileById({
    bucketName: BucketNameEnum.dataset,
    fileId
  });

  if (!file) {
    return Promise.reject(CommonErrEnum.fileNotFound);
  }

  const filename = file.filename;

  const { collectionId, insertResults } = await createCollectionAndInsertData({
    dataset,
    createCollectionParams: {
      ...body,
      teamId,
      tmbId,
      type: DatasetCollectionTypeEnum.file,
      name: filename,
      fileId,
      metadata: {
        relatedImgId: fileId
      },
      customPdfParse
    },

    relatedId: fileId
  });

  // remove buffer
  await deleteRawTextBuffer(fileId);

  return {
    collectionId,
    results: insertResults
  };
}

export default NextAPI(handler);

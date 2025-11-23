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
import { CommonErrEnum } from '@fastgpt/global/common/error/code/common';
import { getS3DatasetSource } from '@fastgpt/service/common/s3/sources/dataset';
import { isS3ObjectKey } from '@fastgpt/service/common/s3/utils';

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

  const filename = await (async () => {
    if (isS3ObjectKey(fileId, 'dataset')) {
      const metadata = await getS3DatasetSource().getFileMetadata(fileId);
      if (!metadata) return Promise.reject(CommonErrEnum.fileNotFound);
      return metadata.filename;
    }

    const file = await getFileById({
      bucketName: BucketNameEnum.dataset,
      fileId
    });
    if (!file) {
      return Promise.reject(CommonErrEnum.fileNotFound);
    }

    return file.filename;
  })();

  const { collectionId, insertResults } = await createCollectionAndInsertData({
    dataset,
    createCollectionParams: {
      ...body,
      teamId,
      tmbId,
      type: DatasetCollectionTypeEnum.file,
      name: filename,
      fileId, // ObjectId -> ObjectKey
      customPdfParse
    }
  });

  return {
    collectionId,
    results: insertResults
  };
}

export default NextAPI(handler);

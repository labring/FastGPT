import type { NextApiRequest } from 'next';
import type { TextCreateDatasetCollectionParams } from '@fastgpt/global/core/dataset/api.d';
import { authDataset } from '@fastgpt/service/support/permission/dataset/auth';
import { createCollectionAndInsertData } from '@fastgpt/service/core/dataset/collection/controller';
import { DatasetCollectionTypeEnum } from '@fastgpt/global/core/dataset/constants';
import { NextAPI } from '@/service/middleware/entry';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import { type CreateCollectionResponse } from '@/global/core/dataset/api';
import { getS3DatasetSource } from '@fastgpt/service/common/s3/sources/dataset';
import { removeS3TTL } from '@fastgpt/service/common/s3/utils';

async function handler(req: NextApiRequest): CreateCollectionResponse {
  const { name, text, ...body } = req.body as TextCreateDatasetCollectionParams;

  const { teamId, tmbId, dataset } = await authDataset({
    req,
    authToken: true,
    authApiKey: true,
    datasetId: body.datasetId,
    per: WritePermissionVal
  });

  // 1. Create file from text
  const filename = `${name}.txt`;
  const s3DatasetSource = getS3DatasetSource();
  const key = await s3DatasetSource.upload({
    datasetId: String(dataset._id),
    buffer: Buffer.from(text),
    filename
  });

  const { collectionId, insertResults } = await createCollectionAndInsertData({
    dataset,
    createCollectionParams: {
      ...body,
      teamId,
      tmbId,
      type: DatasetCollectionTypeEnum.file,
      fileId: key,
      name: filename
    }
  });

  await removeS3TTL({ key, bucketName: 'private' });

  return {
    collectionId,
    results: insertResults
  };
}

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '10mb'
    }
  }
};

export default NextAPI(handler);

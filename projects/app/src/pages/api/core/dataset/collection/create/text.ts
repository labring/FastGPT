import type { NextApiRequest } from 'next';
import type { TextCreateDatasetCollectionParams } from '@fastgpt/global/core/dataset/api.d';
import { authDataset } from '@fastgpt/service/support/permission/dataset/auth';
import { createCollectionAndInsertData } from '@fastgpt/service/core/dataset/collection/controller';
import { DatasetCollectionTypeEnum } from '@fastgpt/global/core/dataset/constants';
import { NextAPI } from '@/service/middleware/entry';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import { type CreateCollectionResponse } from '@/global/core/dataset/api';
import { createFileFromText } from '@fastgpt/service/common/file/gridfs/utils';

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
  const { fileId } = await createFileFromText({
    bucket: 'dataset',
    filename,
    text,
    metadata: {
      teamId,
      uid: tmbId
    }
  });

  const { collectionId, insertResults } = await createCollectionAndInsertData({
    dataset,
    createCollectionParams: {
      ...body,
      teamId,
      tmbId,
      type: DatasetCollectionTypeEnum.file,
      fileId,
      name: filename
    }
  });

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

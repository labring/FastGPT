import { authDatasetCollectionCreate } from '@fastgpt/service/support/permission/dataset/auth';
import { createCollectionAndInsertData } from '@fastgpt/service/core/dataset/collection/controller';
import { DatasetCollectionTypeEnum } from '@fastgpt/global/core/dataset/constants';
import { NextAPI } from '@/service/middleware/entry';
import { type ApiRequestProps } from '@fastgpt/next/type';
import { getS3DatasetSource } from '@fastgpt/service/common/s3/sources/dataset';
import { removeS3TTL } from '@fastgpt/service/common/s3/utils';
import {
  CreateTextCollectionBodySchema,
  type CreateCollectionWithResultResponseType
} from '@fastgpt/global/openapi/core/dataset/collection/createApi';
import { checkDatasetIndexLimit } from '@fastgpt/service/support/permission/teamLimit';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';

async function handler(req: ApiRequestProps): Promise<CreateCollectionWithResultResponseType> {
  const { name, text, ...body } = parseApiInput({
    req,
    bodySchema: CreateTextCollectionBodySchema
  }).body;

  const { teamId, tmbId, dataset } = await authDatasetCollectionCreate({
    req,
    authToken: true,
    authApiKey: true,
    datasetId: body.datasetId,
    parentId: body.parentId
  });

  // Check dataset limit
  await checkDatasetIndexLimit({
    teamId,
    insertLen: 1
  });

  const filename = `${name}.txt`;
  const s3DatasetSource = getS3DatasetSource();
  const key = await s3DatasetSource.upload({
    datasetId: String(dataset._id),
    buffer: Buffer.from(text),
    filename,
    contentType: 'text/plain; charset=UTF-8'
  });

  const res = await createCollectionAndInsertData({
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
  return res;
}

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '10mb'
    }
  }
};

export default NextAPI(handler);

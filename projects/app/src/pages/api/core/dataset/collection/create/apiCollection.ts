import { authDatasetCollectionCreate } from '@fastgpt/service/support/permission/dataset/auth';
import { NextAPI } from '@/service/middleware/entry';
import { type ApiRequestProps } from '@fastgpt/next/type';
import { getApiDatasetRequest } from '@fastgpt/service/core/dataset/apiDataset';
import { createApiDatasetCollection } from '@fastgpt/service/core/dataset/apiDataset/service';
import { authApiFileImportChanges } from '@fastgpt/service/core/dataset/apiDataset/auth';
import {
  CreateApiCollectionBodySchema,
  CreateApiCollectionV2ResponseSchema
} from '@fastgpt/global/openapi/core/dataset/collection/createApi';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';

async function handler(req: ApiRequestProps) {
  const { apiFileId, ...body } = parseApiInput({
    req,
    bodySchema: CreateApiCollectionBodySchema
  }).body;

  const { teamId, tmbId, dataset } = await authDatasetCollectionCreate({
    req,
    authToken: true,
    authApiKey: true,
    datasetId: body.datasetId,
    // V1 支持指定本地落位目录，写入前校验该目录权限。
    parentId: body.parentId
  });

  const fileDetailRes = await (
    await getApiDatasetRequest(dataset.apiDatasetServer)
  ).getFileDetail({
    apiFileId
  });

  if (!fileDetailRes.success) {
    return Promise.reject(fileDetailRes.message);
  }
  const fileDetail = fileDetailRes.data;

  return CreateApiCollectionV2ResponseSchema.parse(
    await createApiDatasetCollection({
      apiFiles: [fileDetail],
      teamId,
      tmbId,
      dataset,
      targetParentId: body.parentId,
      authorizeChanges: (changes) =>
        authApiFileImportChanges({
          req,
          authToken: true,
          authApiKey: true,
          datasetId: body.datasetId,
          ...changes
        }),
      ...body
    })
  );
}

export default NextAPI(handler);

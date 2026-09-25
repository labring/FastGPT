import { authDatasetCollectionCreate } from '@fastgpt/service/support/permission/dataset/auth';
import { NextAPI } from '@/service/middleware/entry';
import { type ApiRequestProps } from '@fastgpt/next/type';
import { getApiDatasetRequest } from '@fastgpt/service/core/dataset/apiDataset';
import { createApiDatasetCollection } from './apiCollectionV2';
import {
  CreateApiCollectionBodySchema,
  CreateApiCollectionResponseSchema
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
    // 保留 parentId：本路由是外部 API，不收紧要它的权限门槛。注意落位已与它无关
    // （createApiDatasetCollection 忽略该字段），这里只多校验一次目录写权限
    parentId: body.parentId
  });

  const fileDetail = await (
    await getApiDatasetRequest(dataset.apiDatasetServer)
  ).getFileDetail({
    apiFileId
  });

  return CreateApiCollectionResponseSchema.parse(
    await createApiDatasetCollection({
      apiFiles: [fileDetail],
      teamId,
      tmbId,
      dataset,
      ...body
    })
  );
}

export default NextAPI(handler);

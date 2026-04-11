import { NextAPI } from '@/service/middleware/entry';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import { getApiDatasetRequest } from '@fastgpt/service/core/dataset/apiDataset';
import { authDataset } from '@fastgpt/service/support/permission/dataset/auth';
import type { ApiRequestProps } from '@fastgpt/service/type/next';
import {
  GetApiDatasetFileListBodySchema,
  GetApiDatasetFileListResponseSchema,
  type GetApiDatasetFileListBody,
  type GetApiDatasetFileListResponse
} from '@fastgpt/global/openapi/core/dataset/apiDataset/api';

async function handler(
  req: ApiRequestProps<GetApiDatasetFileListBody>
): Promise<GetApiDatasetFileListResponse> {
  const { datasetId, searchKey = '', parentId } = GetApiDatasetFileListBodySchema.parse(req.body);

  const { dataset } = await authDataset({
    req,
    authToken: true,
    authApiKey: true,
    datasetId,
    per: ReadPermissionVal
  });

  const files = await (
    await getApiDatasetRequest(dataset.apiDatasetServer)
  ).listFiles({ searchKey: searchKey, parentId });

  return GetApiDatasetFileListResponseSchema.parse(files);
}

export default NextAPI(handler);

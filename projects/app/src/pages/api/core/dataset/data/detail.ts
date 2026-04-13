import { NextAPI } from '@/service/middleware/entry';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import { authDatasetData } from '@fastgpt/service/support/permission/dataset/auth';
import type { ApiRequestProps } from '@fastgpt/service/type/next';
import {
  GetDatasetDataDetailQuerySchema,
  GetDatasetDataDetailResponseSchema,
  type GetDatasetDataDetailResponse
} from '@fastgpt/global/openapi/core/dataset/data/api';

async function handler(req: ApiRequestProps): Promise<GetDatasetDataDetailResponse> {
  const { id: dataId } = GetDatasetDataDetailQuerySchema.parse(req.query);

  const { datasetData } = await authDatasetData({
    req,
    authToken: true,
    authApiKey: true,
    dataId,
    per: ReadPermissionVal
  });

  return GetDatasetDataDetailResponseSchema.parse(datasetData);
}

export default NextAPI(handler);

import { NextAPI } from '@/service/middleware/entry';
import { authDataset } from '@fastgpt/service/support/permission/dataset/auth';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { getDatasetTagFilterOptions } from '@fastgpt/service/core/dataset/collection/tagFilter';
import type { ApiRequestProps } from '@fastgpt/next/type';
import {
  GetTagFilterOptionsQuerySchema,
  GetTagFilterOptionsResponseSchema,
  type GetTagFilterOptionsResponseType
} from '@fastgpt/global/openapi/core/dataset/collection/api';

async function handler(req: ApiRequestProps): Promise<GetTagFilterOptionsResponseType> {
  const { datasetId } = parseApiInput({
    req,
    querySchema: GetTagFilterOptionsQuerySchema
  }).query;

  const { teamId } = await authDataset({
    req,
    authToken: true,
    authApiKey: true,
    datasetId,
    per: ReadPermissionVal
  });

  const list = await getDatasetTagFilterOptions({ teamId, datasetId });

  return GetTagFilterOptionsResponseSchema.parse({ list });
}

export default NextAPI(handler);

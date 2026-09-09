import { NextAPI } from '@/service/middleware/entry';
import { formatReadableReferencedApps } from '@/service/core/app/reference';
import type { ApiRequestProps } from '@fastgpt/next/type';
import {
  GetDatasetReferencedAppsQuerySchema,
  type GetDatasetReferencedAppsQuery,
  type GetDatasetReferencedAppsResponse
} from '@fastgpt/global/openapi/core/dataset/api';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { authDataset } from '@fastgpt/service/support/permission/dataset/auth';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import { findAppsByCurrentResourceRefs } from '@fastgpt/service/core/app/currentResourceRefs';

async function handler(
  req: ApiRequestProps<unknown, GetDatasetReferencedAppsQuery>
): Promise<GetDatasetReferencedAppsResponse> {
  const { datasetId } = parseApiInput({
    req,
    querySchema: GetDatasetReferencedAppsQuerySchema
  }).query;
  const { teamId } = await authDataset({
    req,
    authToken: true,
    authApiKey: true,
    datasetId,
    per: ReadPermissionVal
  });
  const apps = await findAppsByCurrentResourceRefs({
    teamId,
    resourceType: 'dataset',
    resourceIds: [datasetId]
  });

  return formatReadableReferencedApps({ req, apps });
}

export default NextAPI(handler);

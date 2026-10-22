import { authDatasetCollection } from '@fastgpt/service/support/permission/dataset/auth';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import { NextAPI } from '@/service/middleware/entry';
import type { ApiRequestProps } from '@fastgpt/next/type';
import {
  GetCollectionPathsQuerySchema,
  GetCollectionPathsResponseSchema,
  type GetCollectionPathsResponseType
} from '@fastgpt/global/openapi/core/dataset/collection/api';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { getDatasetCollectionPaths } from '@fastgpt/service/core/dataset/collection/paths';

export async function handler(req: ApiRequestProps): Promise<GetCollectionPathsResponseType> {
  const { sourceId } = parseApiInput({ req, querySchema: GetCollectionPathsQuerySchema }).query;

  if (!sourceId) {
    return [];
  }

  await authDatasetCollection({
    req,
    authToken: true,
    collectionId: sourceId,
    per: ReadPermissionVal
  });

  const paths = await getDatasetCollectionPaths({ parentId: sourceId });

  return GetCollectionPathsResponseSchema.parse(paths);
}

export default NextAPI(handler);

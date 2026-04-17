import { MongoDataset } from '@fastgpt/service/core/dataset/schema';
import type { ParentTreePathItemType } from '@fastgpt/global/common/parentFolder/type';
import { authDataset } from '@fastgpt/service/support/permission/dataset/auth';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import { NextAPI } from '@/service/middleware/entry';
import type { ApiRequestProps } from '@fastgpt/service/type/next';
import {
  GetDatasetPathsQuerySchema,
  GetDatasetPathsResponseSchema,
  type GetDatasetPathsResponse
} from '@fastgpt/global/openapi/core/dataset/api';

async function handler(req: ApiRequestProps): Promise<GetDatasetPathsResponse> {
  const { sourceId: datasetId, type } = GetDatasetPathsQuerySchema.parse(req.query);

  if (!datasetId) {
    return [];
  }

  const { dataset } = await authDataset({
    req,
    authToken: true,
    datasetId,
    per: ReadPermissionVal
  });

  const paths = await getParents(type === 'current' ? dataset._id : dataset.parentId ?? undefined);

  return GetDatasetPathsResponseSchema.parse(paths);
}

export async function getParents(parentId?: string): Promise<ParentTreePathItemType[]> {
  if (!parentId) {
    return [];
  }

  const parent = await MongoDataset.findById(parentId, 'name parentId');

  if (!parent) return [];

  const paths = await getParents(parent.parentId ?? undefined);
  paths.push({ parentId, parentName: parent.name });

  return paths;
}

export default NextAPI(handler);

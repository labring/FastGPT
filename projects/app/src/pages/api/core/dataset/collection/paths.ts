import { authDatasetCollection } from '@fastgpt/service/support/permission/dataset/auth';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import type {
  ParentIdType,
  ParentTreePathItemType
} from '@fastgpt/global/common/parentFolder/type';
import { MongoDatasetCollection } from '@fastgpt/service/core/dataset/collection/schema';
import { NextAPI } from '@/service/middleware/entry';
import type { ApiRequestProps } from '@fastgpt/service/type/next';
import {
  GetCollectionPathsQuerySchema,
  GetCollectionPathsResponseSchema,
  type GetCollectionPathsResponseType
} from '@fastgpt/global/openapi/core/dataset/collection/api';

export async function handler(req: ApiRequestProps): Promise<GetCollectionPathsResponseType> {
  const { sourceId } = GetCollectionPathsQuerySchema.parse(req.query);

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

export async function getDatasetCollectionPaths({
  parentId = ''
}: {
  parentId?: string;
}): Promise<ParentTreePathItemType[]> {
  async function find(parentId: ParentIdType): Promise<ParentTreePathItemType[]> {
    if (!parentId) {
      return [];
    }
    const parent = await MongoDatasetCollection.findOne({ _id: parentId }, 'name parentId');

    if (!parent) return [];

    const paths = await find(parent.parentId ?? undefined);
    paths.push({ parentId, parentName: parent.name });

    return paths;
  }

  return find(parentId);
}

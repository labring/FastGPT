import {
  authDataset,
  authDatasetCollection
} from '@fastgpt/service/support/permission/dataset/auth';
import { DatasetErrEnum } from '@fastgpt/global/common/error/code/dataset';
import { DatasetCollectionTypeEnum } from '@fastgpt/global/core/dataset/constants';
import { checkCollectionFolderNavigable } from '@/service/core/dataset/collectionVisibleList';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import type {
  ParentIdType,
  ParentTreePathItemType
} from '@fastgpt/global/common/parentFolder/type';
import { MongoDatasetCollection } from '@fastgpt/service/core/dataset/collection/schema';
import { NextAPI } from '@/service/middleware/entry';
import type { ApiRequestProps } from '@fastgpt/next/type';
import {
  GetCollectionPathsQuerySchema,
  GetCollectionPathsResponseSchema,
  type GetCollectionPathsResponseType
} from '@fastgpt/global/openapi/core/dataset/collection/api';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';

export async function handler(req: ApiRequestProps): Promise<GetCollectionPathsResponseType> {
  const { sourceId } = parseApiInput({ req, querySchema: GetCollectionPathsQuerySchema }).query;

  if (!sourceId) {
    return [];
  }

  // 先只做 Dataset 读门槛并解析 Collection 有效权限，再决定当前目录是真实可读还是仅可导航。
  const { collection, teamId, tmbId, permission } = await authDatasetCollection({
    req,
    authToken: true,
    collectionId: sourceId
  });

  let folderAccessMode: 'read' | 'navigate' = 'read';
  if (!permission.hasReadPer) {
    // 导航目录只允许文件夹，且子树内必须存在可读 Collection。
    const { permission: datasetPermission } = await authDataset({
      req,
      authToken: true,
      datasetId: String(collection.datasetId),
      per: ReadPermissionVal
    });
    const navigable =
      collection.type === DatasetCollectionTypeEnum.folder &&
      (await checkCollectionFolderNavigable({
        teamId,
        tmbId,
        datasetId: String(collection.datasetId),
        folderId: String(collection._id),
        datasetPermission: datasetPermission.role,
        collectionPermissionEnabled: collection.dataset.collectionPermissionEnabled
      }));
    if (!navigable) return Promise.reject(DatasetErrEnum.unAuthDatasetCollection);
    folderAccessMode = 'navigate';
  }

  const paths = await getDatasetCollectionPaths({ parentId: sourceId });

  return GetCollectionPathsResponseSchema.parse(
    paths.map((path) => (path.parentId === sourceId ? { ...path, folderAccessMode } : path))
  );
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

import {
  authDataset,
  authDatasetCollection
} from '@fastgpt/service/support/permission/dataset/auth';
import { DatasetErrEnum } from '@fastgpt/global/common/error/code/dataset';
import { DatasetCollectionTypeEnum } from '@fastgpt/global/core/dataset/constants';
import { checkCollectionFolderNavigable } from '@/service/core/dataset/collectionVisibleList';
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

  const paths = await getDatasetCollectionPaths({
    parentId: sourceId,
    teamId: String(collection.teamId),
    datasetId: String(collection.datasetId)
  });

  return GetCollectionPathsResponseSchema.parse(
    paths.map((path) => (path.parentId === sourceId ? { ...path, folderAccessMode } : path))
  );
}

export default NextAPI(handler);

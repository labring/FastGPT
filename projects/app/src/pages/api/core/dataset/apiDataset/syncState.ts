import type { ApiRequestProps } from '@fastgpt/next/type';
import { NextAPI } from '@/service/middleware/entry';
import { authDataset } from '@fastgpt/service/support/permission/dataset/auth';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import { MongoDatasetCollection } from '@fastgpt/service/core/dataset/collection/schema';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { isCollectionSyncChildrenEnabled } from '@fastgpt/global/core/dataset/collection/utils';
import { buildApiCollectionSourceIdResolver } from '@fastgpt/service/core/dataset/apiDataset/utils';
import {
  GetApiDatasetSyncStateQuerySchema,
  GetApiDatasetSyncStateResponseSchema,
  type GetApiDatasetSyncStateQuery,
  type GetApiDatasetSyncStateResponse
} from '@fastgpt/global/openapi/core/dataset/apiDataset/api';

/**
 * 返回 API 知识库根级 syncAll 标记及所有已导入 API 集合的同步状态，
 * 供前端导入弹窗计算树节点三态勾选状态（未选 / 半选 / 已同步）与初始目录定位。
 */
async function handler(
  req: ApiRequestProps<unknown, GetApiDatasetSyncStateQuery>
): Promise<GetApiDatasetSyncStateResponse> {
  const { datasetId } = parseApiInput({
    req,
    querySchema: GetApiDatasetSyncStateQuerySchema
  }).query;

  const { dataset } = await authDataset({
    req,
    datasetId,
    per: ReadPermissionVal,
    authToken: true,
    authApiKey: true
  });

  const collections = await MongoDatasetCollection.find(
    {
      teamId: dataset.teamId,
      datasetId: dataset._id,
      apiFileId: { $exists: true, $ne: null }
    },
    '_id apiFileId apiFileParentId parentId type syncChildren metadata'
  ).lean();

  const sourceIdOf = buildApiCollectionSourceIdResolver(collections);

  return GetApiDatasetSyncStateResponseSchema.parse({
    syncAll: Boolean(dataset.syncAll),
    collections: collections.flatMap((col) => {
      if (!col.apiFileId) return [];
      const sourceId = sourceIdOf(col);
      if (!sourceId) return [];
      return [
        {
          collectionId: String(col._id),
          apiFileId: col.apiFileId,
          sourceId,
          type: col.type,
          syncChildren: isCollectionSyncChildrenEnabled(col),
          parentId: col.parentId ? String(col.parentId) : null
        }
      ];
    })
  });
}

export default NextAPI(handler);

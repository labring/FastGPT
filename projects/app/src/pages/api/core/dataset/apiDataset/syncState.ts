import type { ApiRequestProps } from '@fastgpt/next/type';
import { NextAPI } from '@/service/middleware/entry';
import { authDataset } from '@fastgpt/service/support/permission/dataset/auth';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import { MongoDatasetCollection } from '@fastgpt/service/core/dataset/collection/schema';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { isCollectionSyncChildrenEnabled } from '@fastgpt/global/core/dataset/collection/utils';
import {
  createApiFileSourceResolver,
  LEGACY_SYSTEM_ROOT_API_FILE_ID
} from '@fastgpt/service/core/dataset/apiDataset/utils';
import {
  canShortCircuitCollectionPermission,
  getReadableCollectionIds
} from '@fastgpt/service/support/permission/collection/auth';
import { isDisableSuperAdmin } from '@fastgpt/service/support/permission/dataset/disableSuperAdmin';
import { getGroupsByTmbId } from '@fastgpt/service/support/permission/memberGroup/controllers';
import { getTmbInfoByTmbId } from '@fastgpt/service/support/user/team/controller';
import { getOrgIdSetWithParentByTmbId } from '@fastgpt/service/support/permission/org/controllers';
import { findDatasetCollectionsForVisibility } from '@/service/core/dataset/collectionVisibleList';
import {
  GetApiDatasetSyncStateQuerySchema,
  GetApiDatasetSyncStateResponseSchema,
  type GetApiDatasetSyncStateQuery,
  type GetApiDatasetSyncStateResponse
} from '@fastgpt/global/openapi/core/dataset/apiDataset/api';

/**
 * 返回 API 知识库整库 syncAll 标记及当前用户可读的已导入 API 集合的同步状态，
 * 供前端导入弹窗计算树节点三态勾选状态（未选 / 半选 / 已同步）与初始目录定位。
 */
async function handler(
  req: ApiRequestProps<unknown, GetApiDatasetSyncStateQuery>
): Promise<GetApiDatasetSyncStateResponse> {
  const { datasetId } = parseApiInput({
    req,
    querySchema: GetApiDatasetSyncStateQuerySchema
  }).query;

  const { dataset, teamId, tmbId, permission, isRoot } = await authDataset({
    req,
    datasetId,
    per: ReadPermissionVal,
    authToken: true,
    authApiKey: true
  });

  // 资源范围以 dataset 归属为准：root 可跨团队，用请求侧 teamId 会把集合列表过滤成空。
  const scopeTeamId = String(dataset.teamId);
  const tmbInfo = await getTmbInfoByTmbId({ tmbId });
  const shortCircuit =
    isRoot ||
    (await canShortCircuitCollectionPermission({
      teamId,
      datasetIds: [String(dataset._id)],
      tmbId,
      tmbInfo,
      ignoreTeamOwner: isDisableSuperAdmin(dataset.apiDatasetServer)
    }));

  let readableIdSet: Set<string> | undefined;
  if (!shortCircuit) {
    const [groupIds, orgIds, visibilityCollections] = await Promise.all([
      getGroupsByTmbId({ tmbId, teamId }).then((list) => list.map((item) => String(item._id))),
      getOrgIdSetWithParentByTmbId({ tmbId, teamId }).then((set) => Array.from(set)),
      findDatasetCollectionsForVisibility({ teamId: scopeTeamId, datasetId: String(dataset._id) })
    ]);
    const readableIds = await getReadableCollectionIds({
      collections: visibilityCollections,
      tmbId,
      teamId: scopeTeamId,
      groupIds,
      orgIds,
      datasetPermission: permission.role,
      collectionPermissionEnabled: dataset.collectionPermissionEnabled
    });
    readableIdSet = new Set(readableIds);
  }

  const collections = await MongoDatasetCollection.find(
    {
      teamId: dataset.teamId,
      datasetId: dataset._id,
      apiFileId: { $exists: true, $ne: null }
    },
    '_id name apiFileId apiFileParentId parentId type syncChildren metadata'
  ).lean();

  const legacySentinelIdSet = new Set(
    collections
      .filter((col) => col.apiFileId === LEGACY_SYSTEM_ROOT_API_FILE_ID)
      .map((col) => String(col._id))
  );
  const hasLegacySystemRoot = legacySentinelIdSet.size > 0;
  const effectiveCollections = collections.filter(
    (col) => col.apiFileId !== LEGACY_SYSTEM_ROOT_API_FILE_ID
  );
  const { getSourceId } = createApiFileSourceResolver(effectiveCollections);

  return GetApiDatasetSyncStateResponseSchema.parse({
    syncAll: Boolean(dataset.syncAll) || hasLegacySystemRoot,
    collections: effectiveCollections.flatMap((col) => {
      const idStr = String(col._id);
      if (readableIdSet && !readableIdSet.has(idStr)) return [];
      if (!col.apiFileId) return [];
      const sourceId = getSourceId(col);
      if (!sourceId) return [];
      const rawParentId = col.parentId ? String(col.parentId) : null;
      // 不可读父目录或历史 SYSTEM_ROOT 哨兵的本地 ID 不向外暴露，归一化为根级 null。
      const parentId =
        rawParentId &&
        !legacySentinelIdSet.has(rawParentId) &&
        (!readableIdSet || readableIdSet.has(rawParentId))
          ? rawParentId
          : null;
      return [
        {
          collectionId: idStr,
          apiFileId: col.apiFileId,
          sourceId,
          name: col.name,
          type: col.type,
          syncChildren: isCollectionSyncChildrenEnabled(col),
          parentId
        }
      ];
    })
  });
}

export default NextAPI(handler);

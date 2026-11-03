import { MongoDataset } from '../../schema';
import { MongoDatasetCollection } from '../../collection/schema';
import { getApiDatasetRequest } from '../index';
import { isPermissionSyncDataset } from '@fastgpt/global/core/dataset/apiDataset/utils';
import { DatasetCollectionTypeEnum } from '@fastgpt/global/core/dataset/constants';
import { DatasetErrEnum } from '@fastgpt/global/common/error/code/dataset';
import { PerResourceTypeEnum } from '@fastgpt/global/support/permission/constant';
import type { CollaboratorItemType } from '@fastgpt/global/support/permission/collaborator';
import { buildLegacyApiFileDirSourceMap } from '../utils';
import { resourcePermissionRepo } from '../../../../support/permission/repository/resourcePermissionRepo';
import { pickCollaboratorIdFields } from '../../../../support/permission/utils';
import { getLogger, LogCategories } from '../../../../common/logger';
import { Types } from '../../../../common/mongo';
import { fetchApiFilePermissions } from './adapters';
import { resolveApiDatasetPermissionItems, ensureOwnerAccess } from './resolver';
import { assertPermissionSyncActive } from './utils';
import { applyCollectionPermissionStates, isSameCollaboratorSet } from './writer';
import type { CollectionPermissionSyncStats, CollectionPermissionTargetState } from './types';
import type { ApiDatasetPermissionItemType } from '@fastgpt/global/core/dataset/apiDataset/type';
import type { RedisLeaseContext } from '@fastgpt/dal/redis/caches';

const logger = getLogger(LogCategories.MODULE.DATASET);

type PermissionSyncCollectionRow = {
  _id: unknown;
  apiFileId: unknown;
  apiFileParentId?: unknown;
  type: string;
  parentId?: unknown;
  inheritPermission?: boolean;
  metadata?: { apiFileSourceId?: unknown };
};

const SYNC_TARGET_FIELDS = '_id apiFileId apiFileParentId type parentId inheritPermission metadata';

/**
 * collection 对应的外部文件 ID。
 *
 * 带子文档的文件会额外生成 `doc#dir` 派生目录，它本地存的是派生 ID，真实外部 ID 在
 * `metadata.apiFileSourceId`；直接拿 `apiFileId` 拉权限会在外部 404，被误判成「外部未表达」。
 * 更早的派生目录没有 metadata，改用本地挂载关系推导，仍推导不出时保持原值（不盲裁后缀）。
 */
const getPermissionSourceId = (
  row: PermissionSyncCollectionRow,
  legacySourceByDirId: Map<string, string>
) => {
  const apiFileId = String(row.apiFileId);
  if (row.type !== DatasetCollectionTypeEnum.folder) return apiFileId;
  const sourceId = row.metadata?.apiFileSourceId;
  if (typeof sourceId === 'string' && sourceId) return sourceId;
  return legacySourceByDirId.get(apiFileId) ?? apiFileId;
};

/**
 * 把定向同步的根节点展开成本轮的目标节点集，按层级逐层下钻。
 *
 * 为什么执行时才展开：调用方（导入接口）只声明根节点，作业可能延后执行，
 * 期间还会有新的子节点导入，入队时定死范围会漏同步。
 *
 * 规则：
 *  - 只有带 `apiFileId` 的节点算目标，外部文件才有权限可拉；
 *  - 没有 `apiFileId` 的本地节点不产出目标，但仍要继续下钻，否则挂在它下面的外部文件会漏掉；
 *  - 独立态不剪枝：它们同样有自己的外部权限要同步；
 *  - 非法 ObjectId 的根先过滤掉；跨库 / 已删除的根匹配不到行，静默忽略；
 *  - `visited` 让每个节点只入队一次，兼作脏 `parentId` 环的保护。
 */
const expandPermissionSyncCollections = async ({
  teamId,
  datasetId,
  rootCollectionIds
}: {
  teamId: string;
  datasetId: string;
  rootCollectionIds: string[];
}): Promise<PermissionSyncCollectionRow[]> => {
  const rootIds = [
    ...new Set(rootCollectionIds.map(String).filter((id) => Types.ObjectId.isValid(id)))
  ];
  if (rootIds.length === 0) return [];

  const targets: PermissionSyncCollectionRow[] = [];
  const visited = new Set<string>();
  let frontier: string[] = [];

  // 处理一层查询结果：命中过的节点不再重复收集，本层所有节点 id 就是下一层的 parentId 条件
  const collect = (rows: PermissionSyncCollectionRow[]) => {
    const nextFrontier: string[] = [];
    for (const row of rows) {
      const id = String(row._id);
      if (visited.has(id)) continue;
      visited.add(id);
      if (row.apiFileId != null) targets.push(row);
      nextFrontier.push(id);
    }
    frontier = nextFrontier;
  };

  collect(
    await MongoDatasetCollection.find(
      { teamId, datasetId, _id: { $in: rootIds } },
      SYNC_TARGET_FIELDS
    ).lean<PermissionSyncCollectionRow[]>()
  );

  while (frontier.length > 0) {
    collect(
      await MongoDatasetCollection.find(
        { teamId, datasetId, parentId: { $in: frontier } },
        SYNC_TARGET_FIELDS
      ).lean<PermissionSyncCollectionRow[]>()
    );
  }

  return targets;
};

/**
 * 把外部 API 文件库的文件权限同步到本地 collection ACL。
 *
 * 入口只有一个，两类调用方：每日同步作业（全量，不传 collectionIds）与导入接口（定向）。
 * 定向的 `collectionIds` 是**根节点**，作业内展开整棵子树，只同步带 `apiFileId` 的节点。
 * 三态语义：外部 `permissions` 缺失 / 详情 NOT_FOUND → 跳过该节点；`[]` → 独立态 + owner 兜底；
 * 非空 → 独立态 = 解析后的列表（无 owner 行时追加 owner 兜底）。
 *
 * 抓取阶段单节点失败只记 failed 并跳过该节点；凭据失效（UNAUTHORIZED）或一整批全部失败
 * 视为外部整体不可用，抛出中止整轮，避免半轮写入。写入阶段最终一致，失败由重试收敛。
 */
export const syncCollectionPermissions = async ({
  teamId,
  datasetId,
  collectionIds,
  traceId,
  deadlineAt,
  lease
}: {
  teamId: string;
  datasetId: string;
  /** 定向同步的根节点；缺省 = 全库全量。作业内展开整棵子树。 */
  collectionIds?: string[];
  traceId?: string;
  /** 本轮截止时间；到达后不再发起新的拉取或写入。 */
  deadlineAt?: number;
  /** 同库租约上下文：丢失后立即停止拉取和写入。 */
  lease?: RedisLeaseContext;
}): Promise<CollectionPermissionSyncStats> => {
  const stats: CollectionPermissionSyncStats = { checked: 0, updated: 0, skipped: 0, failed: 0 };

  assertPermissionSyncActive({ deadlineAt, lease });

  const dataset = await MongoDataset.findOne(
    { _id: datasetId, teamId },
    'teamId tmbId collectionPermissionEnabled apiDatasetServer'
  ).lean();
  if (!dataset) throw DatasetErrEnum.unExist;
  if (!isPermissionSyncDataset(dataset.apiDatasetServer)) return stats;

  // 兜底异常组合：权限同步已开但 collection 权限未开时，写进去的 ACL 没有任何读者。
  // 正常链路由 update 接口同事务开启，这里只告警并跳过，避免把 job 判成失败反复重试。
  if (dataset.collectionPermissionEnabled !== true) {
    logger.warn('[permissionSync] collection permission not enabled, skip round', {
      teamId,
      datasetId,
      traceId
    });
    return stats;
  }

  const request = await getApiDatasetRequest(dataset.apiDatasetServer);

  const collections = collectionIds?.length
    ? await expandPermissionSyncCollections({ teamId, datasetId, rootCollectionIds: collectionIds })
    : await MongoDatasetCollection.find(
        { teamId, datasetId, apiFileId: { $exists: true, $ne: null } },
        SYNC_TARGET_FIELDS
      ).lean<PermissionSyncCollectionRow[]>();

  stats.checked = collections.length;
  if (collections.length === 0) return stats;

  // 正文与派生目录共用同一个外部文件 ID，本轮只拉一次。
  const legacySourceByDirId = buildLegacyApiFileDirSourceMap(
    collections.map((row) => ({
      _id: row._id,
      apiFileId: String(row.apiFileId),
      apiFileParentId: row.apiFileParentId == null ? null : String(row.apiFileParentId),
      parentId: row.parentId,
      type: row.type as DatasetCollectionTypeEnum,
      metadata: row.metadata
    }))
  );
  const sourceIdByCollectionId = new Map(
    collections.map((collection) => [
      String(collection._id),
      getPermissionSourceId(collection, legacySourceByDirId)
    ])
  );
  const apiFileIds = Array.from(new Set(sourceIdByCollectionId.values()));

  logger.info('[permissionSync] round started', {
    teamId,
    datasetId,
    traceId,
    nodeCount: collections.length,
    rootCount: collectionIds?.length,
    targeted: !!collectionIds?.length
  });

  const snapshots = await fetchApiFilePermissions({
    apiDatasetServer: dataset.apiDatasetServer,
    request,
    apiFileIds,
    deadlineAt,
    lease
  });
  // 只把拿到外部结论的节点交给解析；失败节点本轮保持本地不动。
  const okPermissionsByFileId = new Map<string, ApiDatasetPermissionItemType[] | undefined>();
  const failedFileIds = new Set<string>();
  for (const apiFileId of apiFileIds) {
    const snapshot = snapshots.get(apiFileId);
    if (snapshot?.status === 'failed') {
      stats.failed++;
      failedFileIds.add(apiFileId);
      continue;
    }
    okPermissionsByFileId.set(apiFileId, snapshot?.permissions);
  }
  assertPermissionSyncActive({ deadlineAt, lease });
  const resolved = await resolveApiDatasetPermissionItems({
    teamId,
    itemsByFileId: okPermissionsByFileId
  });

  assertPermissionSyncActive({ deadlineAt, lease });
  const currentRows = await resourcePermissionRepo.findByResourceIds({
    teamId,
    resourceType: PerResourceTypeEnum.collection,
    resourceIds: collections.map((collection) => String(collection._id))
  });
  const currentByResourceId = new Map<string, CollaboratorItemType[]>();
  for (const row of currentRows) {
    const resourceId = String(row.resourceId);
    const collaborators = currentByResourceId.get(resourceId) ?? [];
    collaborators.push({
      ...pickCollaboratorIdFields(row),
      permission: row.permission
    } as CollaboratorItemType);
    currentByResourceId.set(resourceId, collaborators);
  }

  const ownerTmbId = String(dataset.tmbId);
  const states: CollectionPermissionTargetState[] = [];
  assertPermissionSyncActive({ deadlineAt, lease });
  for (const collection of collections) {
    const collectionId = String(collection._id);
    const sourceId = sourceIdByCollectionId.get(collectionId)!;
    // 抓取失败已在上面计入 failed，这里不能再算 skipped
    if (failedFileIds.has(sourceId)) continue;
    const rawPermissions = okPermissionsByFileId.get(sourceId);
    const collaborators = resolved.get(sourceId);
    // undefined = 外部未提供（或本条失败）：本地保持不动（跳过，不算失败）
    if (collaborators === undefined) {
      stats.skipped++;
      continue;
    }
    // 外部给了非空列表却一个都没解析出来（跨团队主体、非法角色）：不能退化成「仅 owner」，
    // 否则等于按不可解析的输入撤权。保持本地不动。
    if (rawPermissions && rawPermissions.length > 0 && collaborators.length === 0) {
      logger.warn('[permissionSync] external permissions resolve to empty, skip node', {
        teamId,
        datasetId,
        collectionId,
        itemCount: rawPermissions.length
      });
      stats.skipped++;
      continue;
    }

    const target = ensureOwnerAccess({ collaborators, ownerTmbId });
    const current = currentByResourceId.get(collectionId) ?? [];
    const changed =
      collection.inheritPermission === false ? !isSameCollaboratorSet(current, target) : true;

    if (!changed) {
      stats.skipped++;
      continue;
    }

    states.push({
      collectionId,
      type: collection.type,
      parentId: collection.parentId ? String(collection.parentId) : null,
      collaborators: target,
      currentCollaborators: current,
      isIndependent: collection.inheritPermission === false,
      changed
    });
  }

  assertPermissionSyncActive({ deadlineAt, lease });
  const { updated } = await applyCollectionPermissionStates({
    teamId,
    datasetId,
    states,
    deadlineAt,
    lease
  });
  stats.updated = updated;

  logger.info('[permissionSync] round finished', {
    teamId,
    datasetId,
    traceId,
    ...stats
  });

  return stats;
};

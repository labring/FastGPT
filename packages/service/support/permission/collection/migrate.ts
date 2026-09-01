import { OwnerRoleVal, PerResourceTypeEnum } from '@fastgpt/global/support/permission/constant';
import { DatasetCollectionTypeEnum } from '@fastgpt/global/core/dataset/constants';
import { MongoDatasetCollection } from '../../../core/dataset/collection/schema';
import { MongoDataset } from '../../../core/dataset/schema';
import { MongoResourcePermission } from '../schema';
import { connectionMongo, type ClientSession } from '../../../common/mongo';
import { getResourceOwnedClbs } from '../controller';
import { syncRootCollections } from './controller';
import { getLogger, LogCategories } from '../../../common/logger';
import {
  markDatasetCollectionPermissionsPureInherit,
  markDatasetCollectionPermissionsSet
} from './datasetFlag';

const logger = getLogger(LogCategories.MODULE.PERMISSION.INHERIT);

/**
 * 存量 collection 权限迁移（initCollectionPermission）。
 *
 * 迁移前 collection 无独立权限记录，所有存量 collection 按 dataset 权限语义初始化：
 *  - 根 collection（parentId=null）以所属 dataset 有效 clbs 为父级，快照 = merge(dataset, [owner])；
 *  - 非根以父 collection folder 快照为父级，folder 递归（复用运行时原语 syncRootCollections /
 *    syncResourceTreePermissions，保证迁移后与运行时同步结果一致）；
 *  - 独立态（inheritPermission=false）的 Collection 保持原 ACL 与继承态；
 *  - 其余 Collection 按 Dataset 权限语义刷新快照。
 *
 * 幂等：独立态 Collection 不会被重置；其他资源按快照 diff 写入。重复执行结果一致，无需迁移
 * 版本号。历史 ACL 不能作为迁移判据。
 *
 * 校验优先：迁移前先分析 parentId 图，存在孤儿（父不存在 / 父不是 folder）或循环即报错退出，
 * 不静默降级。dryRun 仅校验与统计，不写库。
 *
 * 性能与原子性：迁移是幂等收敛的（重跑可修复任意中断留下的部分状态），因此不加事务——
 * find、树校验、dataset 有效 clbs 等只读步骤放最前，写路径用普通 session 串行执行。
 * 事务受 maxCommitTimeMS=60s 限制，大 dataset 会超时；无事务则不受提交上限约束。
 */

type CollectionForMigration = {
  _id: unknown;
  tmbId: unknown;
  teamId: unknown;
  datasetId: unknown;
  parentId?: unknown;
  inheritPermission?: boolean;
  type: string;
};

const toId = (value: unknown) => (value == null ? undefined : String(value));

const isFolder = (collection: CollectionForMigration) =>
  collection.type === DatasetCollectionTypeEnum.folder;

export type CollectionTreeAnalysis = {
  /** parentId 指向不存在或非 folder 的 collection。 */
  orphans: string[];
  /** 参与 parentId 循环的 folder。 */
  cycles: string[];
};

/**
 * 分析一个 Dataset 下 collection 的 parentId 图：
 *  - 孤儿：parentId 无效（父不存在 / 父不是 folder）；
 *  - 循环：folder 图用 Kahn 拓扑排序，剩余未处理节点即循环成员。
 */
export const analyzeCollectionTree = (
  collections: CollectionForMigration[]
): CollectionTreeAnalysis => {
  const idToCollection = new Map(
    collections.map((collection) => [String(collection._id), collection])
  );

  // 孤儿检测
  const orphans: string[] = [];
  for (const collection of collections) {
    const parentId = toId(collection.parentId);
    if (!parentId) continue;
    const parent = idToCollection.get(parentId);
    if (!parent || !isFolder(parent)) orphans.push(String(collection._id));
  }

  // 循环检测（仅 folder 参与 folder-parent 图）
  const childrenMap = new Map<string, string[]>();
  const inDegree = new Map<string, number>();
  for (const collection of collections) {
    if (!isFolder(collection)) continue;
    const id = String(collection._id);
    inDegree.set(id, 0);
  }
  for (const collection of collections) {
    const id = String(collection._id);
    const parentId = toId(collection.parentId);
    if (!parentId || !isFolder(collection)) continue;
    const parent = idToCollection.get(parentId);
    if (!parent || !isFolder(parent)) continue;
    const siblings = childrenMap.get(parentId) ?? [];
    siblings.push(id);
    childrenMap.set(parentId, siblings);
    inDegree.set(id, (inDegree.get(id) ?? 0) + 1);
  }

  const queue = Array.from(inDegree.keys()).filter((id) => (inDegree.get(id) ?? 0) === 0);
  const processed = new Set<string>();
  while (queue.length) {
    const id = queue.shift()!;
    if (processed.has(id)) continue;
    processed.add(id);
    for (const childId of childrenMap.get(id) ?? []) {
      if (!inDegree.has(childId)) continue;
      const degree = (inDegree.get(childId) ?? 0) - 1;
      inDegree.set(childId, degree);
      if (degree === 0) queue.push(childId);
    }
  }
  const cycles = Array.from(inDegree.keys()).filter((id) => !processed.has(id));

  return { orphans, cycles };
};

/** 校验 parentId 图；孤儿 / 循环即数据损坏，直接抛错（不静默修复）。 */
const assertValidCollectionTree = (collections: CollectionForMigration[], datasetId: string) => {
  const { orphans, cycles } = analyzeCollectionTree(collections);
  if (orphans.length === 0 && cycles.length === 0) return;
  throw new Error(
    `Dataset ${datasetId} collection tree is invalid: ` +
      `${orphans.length} orphan(s) [${orphans.join(', ')}], ` +
      `${cycles.length} cycle(s) [${cycles.join(', ')}]`
  );
};

export type MigrateDatasetResult = {
  /** 该 dataset 下参与迁移的 collection 数量（dryRun 下为将处理数量）。 */
  collectionCount: number;
  issues: string[];
};

/**
 * 无事务 session 包装：保留 .session() 调用形态，但不开事务、无提交上限、无回滚。
 * 迁移幂等收敛，中断残留部分状态由重跑修复；事务的 maxCommitTimeMS=60s 反而会掐断大 dataset。
 */
const runWithoutTransaction = async <T>(fn: (session: ClientSession) => Promise<T>): Promise<T> => {
  const session = await connectionMongo.startSession();
  try {
    return await fn(session);
  } finally {
    await session.endSession();
  }
};

/**
 * 迁移单个 Dataset 下全部 collection 的权限快照。
 * 幂等：owner upsert + 快照 diff 写入 + 标志 $ne:false 重置，重复执行结果一致。
 *
 * 只读步骤（find、树校验、dataset 有效 clbs）先完成；写路径不加事务（幂等收敛，见文件头）。
 */
export const migrateDatasetCollections = async ({
  teamId,
  datasetId,
  dryRun
}: {
  teamId: string;
  datasetId: string;
  /** 仅校验与统计，不写库。 */
  dryRun?: boolean;
}): Promise<MigrateDatasetResult> => {
  logger.info(
    `[initCollectionPermission] migrate dataset start: datasetId=${datasetId} teamId=${teamId} dryRun=${dryRun ?? false}`
  );

  // 只读前置：不占事务，校验 / 统计失败时零写开销。
  const collections = await MongoDatasetCollection.find(
    { teamId, datasetId },
    '_id tmbId parentId inheritPermission type teamId datasetId'
  ).lean<CollectionForMigration[]>();

  if (collections.length === 0) {
    return { collectionCount: 0, issues: [] };
  }

  // 校验优先：孤儿 / 循环即数据损坏，报错退出，避免静默降级。
  assertValidCollectionTree(collections, datasetId);

  const dataset = await MongoDataset.findOne({ _id: datasetId, teamId }).lean();
  if (!dataset) {
    throw new Error(`Dataset ${datasetId} not found in team ${teamId}`);
  }

  // dataset 已完全物化权限：有效 clbs = 自身快照（无需沿 parentId 链合并）。
  const datasetEffectiveClbs = await getResourceOwnedClbs({
    resourceType: PerResourceTypeEnum.dataset,
    teamId,
    resourceId: datasetId
  });

  if (dryRun) {
    return { collectionCount: collections.length, issues: [] };
  }

  return runWithoutTransaction(async (session) => {
    // 迁移只信任 Collection 的继承态；历史 ACL 可能不完整或错误，不能用于判断是否需要刷新。
    const preservedCollectionIds = new Set(
      collections
        .filter((collection) => collection.inheritPermission === false)
        .map((collection) => String(collection._id))
    );
    const collectionsToRefresh = collections.filter(
      (collection) => !preservedCollectionIds.has(String(collection._id))
    );

    // 1. 未配置独立 ACL 的存量 Collection 统一回到继承态，建立可重放的纯继承基线。
    await MongoDatasetCollection.updateMany(
      {
        teamId,
        datasetId,
        inheritPermission: { $ne: false }
      },
      { $set: { inheritPermission: true } },
      { session }
    );

    // 2. 旧 ACL 不能参与快照计算，否则会被误当成子级独有权限保留。
    // 独立态 Collection 保持原样，仅清理待刷新 Collection 的全部权限记录。
    if (collectionsToRefresh.length > 0) {
      await MongoResourcePermission.deleteMany(
        {
          resourceType: PerResourceTypeEnum.collection,
          teamId,
          resourceId: { $in: collectionsToRefresh.map((collection) => String(collection._id)) }
        },
        { session }
      );

      // 3. 为待刷新 collection 创建 owner 记录（记录已清空，upsert 后 owner 唯一不变量成立）。
      await MongoResourcePermission.bulkWrite(
        collectionsToRefresh.map((collection) => ({
          updateOne: {
            filter: {
              resourceType: PerResourceTypeEnum.collection,
              teamId,
              resourceId: String(collection._id),
              tmbId: String(collection.tmbId)
            },
            update: { $set: { permission: OwnerRoleVal } },
            upsert: true
          }
        })),
        { session }
      );
    }

    // 4. 重建根级继承态 collection 快照（父级 = dataset 有效 clbs），folder 递归子树。
    // 独立配置节点被 syncRootCollections/syncResourceTreePermissions 自动跳过。
    await syncRootCollections({
      teamId,
      datasetId,
      oldRootClbs: [],
      rootClbs: datasetEffectiveClbs,
      session
    });

    // 5. 已存在独立 ACL 或已有自定义标记时，不能开启纯继承短路。
    if (preservedCollectionIds.size > 0 || dataset.hasSetCollectionPermissions === true) {
      await markDatasetCollectionPermissionsSet({ datasetId, session });
    } else {
      await markDatasetCollectionPermissionsPureInherit({ datasetId, session });
    }

    // 注：owner 记录已全量重建（步骤 2 清空 + 步骤 3 upsert），无重复 owner / 缺失 owner 场景。
    return { collectionCount: collections.length, issues: [] };
  });
};

export type InitCollectionPermissionOptions = {
  teamId?: string;
  /** 指定 dataset 列表（可选，仅处理这些 dataset）；未传处理全部。 */
  datasetIds?: string[];
  /** 仅校验与统计，不写库。 */
  dryRun?: boolean;
};

export type InitCollectionPermissionResult = {
  datasetCount: number;
  processedDatasetCount: number;
  collectionCount: number;
  issues: string[];
  errors: string[];
};

/**
 * 迁移（或 dryRun 校验）collection 权限。每 dataset 独立事务、失败隔离；
 * 每次处理范围内全部 dataset。幂等，可重复执行。
 */
export const migrateCollectionPermissions = async ({
  teamId,
  datasetIds,
  dryRun
}: InitCollectionPermissionOptions): Promise<InitCollectionPermissionResult> => {
  const result: InitCollectionPermissionResult = {
    datasetCount: 0,
    processedDatasetCount: 0,
    collectionCount: 0,
    issues: [],
    errors: []
  };

  const datasetIdsWithCollections = await MongoDatasetCollection.distinct('datasetId', {
    ...(teamId ? { teamId } : {})
  });
  const allDatasets = (await MongoDataset.find(
    {
      ...(teamId ? { teamId } : {}),
      ...(datasetIds ? { _id: { $in: datasetIds } } : {}),
      _id: { $in: datasetIdsWithCollections }
    },
    '_id teamId'
  ).lean()) as Array<{ _id: unknown; teamId: unknown }>;

  result.datasetCount = allDatasets.length;

  for (const dataset of allDatasets) {
    const datasetId = String(dataset._id);
    try {
      const migrated = await migrateDatasetCollections({
        teamId: String(dataset.teamId),
        datasetId,
        dryRun
      });
      result.collectionCount += migrated.collectionCount;
      if (migrated.collectionCount > 0) result.processedDatasetCount += 1;
      result.issues.push(...migrated.issues);
    } catch (error) {
      result.errors.push(
        `datasetId=${datasetId}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  return result;
};

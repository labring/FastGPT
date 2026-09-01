import { OwnerRoleVal, PerResourceTypeEnum } from '@fastgpt/global/support/permission/constant';
import { DatasetCollectionTypeEnum } from '@fastgpt/global/core/dataset/constants';
import { MongoDatasetCollection } from '../../../core/dataset/collection/schema';
import { MongoDataset } from '../../../core/dataset/schema';
import { MongoResourcePermission } from '../schema';
import type { ClientSession } from '../../../common/mongo';
import { mongoSessionRun } from '../../../common/mongo/sessionRun';
import { getResourceOwnedClbs } from '../controller';
import { syncRootCollections } from './controller';
import { markDatasetCollectionPermissionsPureInherit } from './datasetFlag';

/**
 * 存量 collection 权限迁移（initCollectionPermission）。
 *
 * 迁移前 collection 无独立权限记录，所有存量 collection 按 dataset 权限语义初始化：
 *  - 根 collection（parentId=null）以所属 dataset 有效 clbs 为父级，快照 = merge(dataset, [owner])；
 *  - 非根以父 collection folder 快照为父级，folder 递归（复用运行时原语 syncRootCollections /
 *    syncResourceTreePermissions，保证迁移后与运行时同步结果一致）；
 *  - 为每个 dataset 重置 hasSetCollectionPermissions=false（纯继承短路）。
 *
 * 幂等：owner 记录按 resource_permissions 唯一键 upsert；快照按 diff 写入；标志重置为 $ne:false
 * 条件更新。重复执行结果一致，无需版本号。
 *
 * 校验优先：迁移前先分析 parentId 图，存在孤儿（父不存在 / 父不是 folder）或循环即报错退出，
 * 不静默降级。dryRun 仅校验与统计，不写库。
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
 * 迁移单个 Dataset 下全部 collection 的权限快照（一个事务）。
 * 幂等：owner upsert + 快照 diff 写入 + 标志 $ne:false 重置，重复执行结果一致。
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
  return mongoSessionRun(async (session) => {
    const collections = await MongoDatasetCollection.find(
      { teamId, datasetId },
      '_id tmbId parentId inheritPermission type teamId datasetId'
    )
      .lean<CollectionForMigration[]>()
      .session(session);

    if (collections.length === 0) {
      return { collectionCount: 0, issues: [] };
    }

    // 校验优先：孤儿 / 循环即数据损坏，报错退出，避免静默降级。
    assertValidCollectionTree(collections, datasetId);

    const dataset = await MongoDataset.findOne({ _id: datasetId, teamId }).lean().session(session);
    if (!dataset) {
      throw new Error(`Dataset ${datasetId} not found in team ${teamId}`);
    }

    // dataset 已完全物化权限：有效 clbs = 自身快照（无需沿 parentId 链合并）。
    const datasetEffectiveClbs = await getResourceOwnedClbs({
      resourceType: PerResourceTypeEnum.dataset,
      teamId,
      resourceId: datasetId,
      session
    });

    if (dryRun) {
      return { collectionCount: collections.length, issues: [] };
    }

    // 1. 统一置为继承态（迁移建立纯继承基线）
    await MongoDatasetCollection.updateMany(
      { teamId, datasetId },
      { $set: { inheritPermission: true } },
      { session }
    );

    // 2. 为每个 collection 创建 owner 记录（幂等 upsert，resource_permissions 唯一键去重）
    await MongoResourcePermission.bulkWrite(
      collections.map((collection) => ({
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

    // 3. 重建根级继承态 collection 快照（父级 = dataset 有效 clbs），folder 递归子树
    await syncRootCollections({
      teamId,
      datasetId,
      oldRootClbs: [],
      rootClbs: datasetEffectiveClbs,
      session
    });

    // 4. 清理重复 owner 记录（同一 tmbId 的多条 owner 记录只保留主记录）
    const issues = await cleanupOwnerRecords({ teamId, collections, session });

    // 5. 重置短路标志为纯继承（全部 collection 无自定义权限）
    await markDatasetCollectionPermissionsPureInherit({ datasetId, session });

    return { collectionCount: collections.length, issues };
  });
};

/** 删除同一 collection 下同一 tmbId 的非主 owner 记录（owner 唯一不变量）。 */
const cleanupOwnerRecords = async ({
  teamId,
  collections,
  session
}: {
  teamId: string;
  collections: CollectionForMigration[];
  session: ClientSession;
}): Promise<string[]> => {
  const issues: string[] = [];
  const owners = await MongoResourcePermission.find(
    {
      resourceType: PerResourceTypeEnum.collection,
      teamId,
      resourceId: { $in: collections.map((collection) => String(collection._id)) },
      permission: OwnerRoleVal
    },
    '_id resourceId tmbId',
    { session }
  ).lean();

  const countByCollection = new Map<string, number>();
  for (const owner of owners) {
    const resourceId = String(owner.resourceId);
    countByCollection.set(resourceId, (countByCollection.get(resourceId) ?? 0) + 1);
  }

  // 收集每个 collection 应保留的主 owner（tmbId = collection.tmbId 的记录）
  const keepIds = new Set<string>();
  const collectionByResourceId = new Map(
    collections.map((collection) => [String(collection._id), collection])
  );
  for (const owner of owners) {
    const resourceId = String(owner.resourceId);
    const collection = collectionByResourceId.get(resourceId);
    if (collection && String(owner.tmbId) === String(collection.tmbId)) {
      keepIds.add(String(owner._id));
    }
  }

  const duplicateOwners = owners.filter((owner) => !keepIds.has(String(owner._id)));
  if (duplicateOwners.length > 0) {
    await MongoResourcePermission.deleteMany(
      { _id: { $in: duplicateOwners.map((owner) => owner._id) } },
      { session }
    );
    for (const owner of duplicateOwners) {
      issues.push(`duplicate owner removed: ${String(owner.resourceId)}/${String(owner.tmbId)}`);
    }
  }

  // 缺失 owner 的 collection（理论上 owner upsert 已覆盖，仅记录异常）
  for (const collection of collections) {
    const resourceId = String(collection._id);
    if ((countByCollection.get(resourceId) ?? 0) === 0) {
      issues.push(`missing owner: ${resourceId}`);
    }
  }

  return issues;
};

export type InitCollectionPermissionOptions = {
  teamId?: string;
  /** 单次调用最多处理的 dataset 数（分批调用以控制单请求耗时）；未传处理该团队全部。 */
  limit?: number;
  /** 仅校验与统计，不写库。 */
  dryRun?: boolean;
};

export type InitCollectionPermissionResult = {
  datasetCount: number;
  processedDatasetCount: number;
  collectionCount: number;
  remainingDatasetCount: number;
  issues: string[];
  errors: string[];
};

/**
 * 迁移（或 dryRun 校验）collection 权限。每 dataset 独立事务、失败隔离；
 * 支持按 limit 分批，返回剩余未处理数量供断点续跑。幂等，可重复执行。
 */
export const migrateCollectionPermissions = async ({
  teamId,
  limit,
  dryRun
}: InitCollectionPermissionOptions): Promise<InitCollectionPermissionResult> => {
  const result: InitCollectionPermissionResult = {
    datasetCount: 0,
    processedDatasetCount: 0,
    collectionCount: 0,
    remainingDatasetCount: 0,
    issues: [],
    errors: []
  };

  const datasetIdsWithCollections = await MongoDatasetCollection.distinct('datasetId', {
    ...(teamId ? { teamId } : {})
  });
  const allDatasets = (await MongoDataset.find(
    {
      ...(teamId ? { teamId } : {}),
      _id: { $in: datasetIdsWithCollections }
    },
    '_id teamId'
  ).lean()) as Array<{ _id: unknown; teamId: unknown }>;

  const pending = limit === undefined ? allDatasets : allDatasets.slice(0, limit);
  result.remainingDatasetCount = Math.max(0, allDatasets.length - pending.length);
  result.datasetCount = allDatasets.length;

  for (const dataset of pending) {
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

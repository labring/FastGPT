import { OwnerRoleVal, PerResourceTypeEnum } from '@fastgpt/global/support/permission/constant';
import { DatasetCollectionTypeEnum } from '@fastgpt/global/core/dataset/constants';
import { MongoDatasetCollection } from '../../../core/dataset/collection/schema';
import { MongoDataset } from '../../../core/dataset/schema';
import { MongoResourcePermission } from '../schema';
import { mongoSessionRun } from '../../../common/mongo/sessionRun';
import { getResourceOwnedClbs } from '../controller';
import { syncRootCollections } from './controller';
import { getLogger, LogCategories } from '../../../common/logger';
import { setDatasetCollectionPermissionEnabled } from './datasetSwitch';

const logger = getLogger(LogCategories.MODULE.PERMISSION.INHERIT);

/**
 * 启用 / 关闭 collection 级权限（替代原存量迁移方案）。
 *
 * 关闭态（默认，含全部存量数据）读路径短路到 dataset 有效权限，不需要任何 collection ACL 行，
 * 因此升级无需迁移；只有用户显式启用时才按需物化，关闭时清理。
 *
 * 关键不变量：
 *  - **开关最后置位**：物化 / 清理失败时开关保持原值，读语义不变，重试即再执行一次（幂等）；
 *  - **关闭态无残留**：关闭会删除 ACL 行并把 collection 的 `inheritPermission` 重置为 `true`，
 *    因此重新启用等价于首次启用。
 */

type CollectionForEnable = {
  _id: unknown;
  tmbId: unknown;
  parentId?: unknown;
  inheritPermission?: boolean;
  type: string;
};

const toId = (value: unknown) => (value == null ? undefined : String(value));

const isFolder = (collection: CollectionForEnable) =>
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
 *
 * 供启用前校验使用：图损坏时不应静默降级（否则会生成错误的继承快照）。
 */
export const analyzeCollectionTree = (
  collections: CollectionForEnable[]
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
    inDegree.set(String(collection._id), 0);
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
const assertValidCollectionTree = (collections: CollectionForEnable[], datasetId: string) => {
  const { orphans, cycles } = analyzeCollectionTree(collections);
  if (orphans.length === 0 && cycles.length === 0) return;
  throw new Error(
    `Dataset ${datasetId} collection tree is invalid: ` +
      `${orphans.length} orphan(s) [${orphans.join(', ')}], ` +
      `${cycles.length} cycle(s) [${cycles.join(', ')}]`
  );
};

/** owner 行 upsert：记录已清空或本就缺失时重建，保证 owner 唯一不变量成立。 */
const buildOwnerUpserts = ({
  teamId,
  collections
}: {
  teamId: string;
  collections: Array<{ _id: unknown; tmbId: unknown }>;
}) =>
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
  }));

export type EnableDatasetCollectionResult = {
  /** 该 dataset 下参与物化的 collection 数量。 */
  collectionCount: number;
};

/**
 * 启用 collection 级权限：物化该 dataset 全部 collection 快照，成功后置位开关。
 *
 * 顺序（与设计 §12.1 一致）：
 *  1. 只读前置：父级图校验（孤儿 / 循环即报错）+ dataset 有效 clbs；
 *  2. 事务内：非独立态 collection 归位继承态 → 清空待刷新 collection 的旧 ACL 行 →
 *     upsert owner 行 → `syncRootCollections` 重建根级快照并递归 folder 子树；
 *  3. 开关最后置位。
 *
 * 幂等：清行 + owner upsert + 快照 diff 写入都可在同一 dataset 上重复执行；失败中断后重跑即可收敛。
 */
export const enableDatasetCollectionPermissions = async ({
  teamId,
  datasetId
}: {
  teamId: string;
  datasetId: string;
}): Promise<EnableDatasetCollectionResult> => {
  logger.info(`[collectionPermission] enable dataset: datasetId=${datasetId} teamId=${teamId}`);

  // 只读前置：校验与统计失败时零写入。
  const collections = await MongoDatasetCollection.find(
    { teamId, datasetId },
    '_id tmbId parentId inheritPermission type'
  ).lean<CollectionForEnable[]>();

  assertValidCollectionTree(collections, datasetId);

  const dataset = await MongoDataset.findOne({ _id: datasetId, teamId }, 'teamId').lean();
  if (!dataset) {
    throw new Error(`Dataset ${datasetId} not found in team ${teamId}`);
  }

  // dataset 已完全物化权限：有效 clbs = 自身快照（无需沿 parentId 链合并）。
  const datasetEffectiveClbs = await getResourceOwnedClbs({
    resourceType: PerResourceTypeEnum.dataset,
    teamId,
    resourceId: datasetId
  });

  await mongoSessionRun(async (session) => {
    // 启用态下不应存在独立态 collection（关闭会重置、未启用时创建被拒）；这里防御性保留，
    // 避免异常数据被静默改写语义。
    const preservedCollectionIds = new Set(
      collections
        .filter((collection) => collection.inheritPermission === false)
        .map((collection) => String(collection._id))
    );
    const collectionsToRefresh = collections.filter(
      (collection) => !preservedCollectionIds.has(String(collection._id))
    );

    if (collectionsToRefresh.length > 0) {
      // 1. 未配置独立 ACL 的 collection 统一回到继承态，建立可重放的纯继承基线。
      await MongoDatasetCollection.updateMany(
        { teamId, datasetId, inheritPermission: { $ne: false } },
        { $set: { inheritPermission: true } },
        { session }
      );

      // 2. 旧 ACL 不能参与快照计算，否则会被误当成子级独有权限保留。
      await MongoResourcePermission.deleteMany(
        {
          resourceType: PerResourceTypeEnum.collection,
          teamId,
          resourceId: { $in: collectionsToRefresh.map((collection) => String(collection._id)) }
        },
        { session }
      );
    }

    if (collections.length > 0) {
      // 3. 重建 owner 行（待刷新记录刚被清空；独立态记录补 owner，保证 owner 唯一不变量）。
      await MongoResourcePermission.bulkWrite(buildOwnerUpserts({ teamId, collections }), {
        session
      });
    }

    // 4. 重建根级继承态 collection 快照（父级 = dataset 有效 clbs），folder 递归子树。
    // 独立态节点由 syncRootCollections / syncResourceTreePermissions 自动跳过。
    await syncRootCollections({
      teamId,
      datasetId,
      oldRootClbs: [],
      rootClbs: datasetEffectiveClbs,
      session
    });

    // 5. 开关最后置位：失败时读语义保持关闭态，重试即再执行一次。
    await setDatasetCollectionPermissionEnabled({ datasetId, enabled: true, session });
  });

  return { collectionCount: collections.length };
};

export type DisableDatasetCollectionResult = {
  /** 被清理的 collection 数量。 */
  collectionCount: number;
};

/**
 * 关闭 collection 级权限：清理该 dataset 全部 collection 的 ACL 行、把 collection 重置为继承态，
 * 最后置位开关为 `false`。
 *
 * 清理是「关闭」语义的一部分：只改开关会让重新启用进入「独立态但无行」的悬空状态。
 * 关闭后读路径全部短路到 dataset 有效权限，重新启用等价于首次启用。
 */
export const disableDatasetCollectionPermissions = async ({
  teamId,
  datasetId
}: {
  teamId: string;
  datasetId: string;
}): Promise<DisableDatasetCollectionResult> => {
  logger.info(`[collectionPermission] disable dataset: datasetId=${datasetId} teamId=${teamId}`);

  const collectionIds = (await MongoDatasetCollection.distinct('_id', { teamId, datasetId })).map(
    String
  );

  await mongoSessionRun(async (session) => {
    if (collectionIds.length > 0) {
      await MongoResourcePermission.deleteMany(
        {
          resourceType: PerResourceTypeEnum.collection,
          teamId,
          resourceId: { $in: collectionIds }
        },
        { session }
      );
    }

    // 关闭即清理：collection 回到纯继承，避免重新启用时出现「独立态但无行」的悬空状态。
    await MongoDatasetCollection.updateMany(
      { teamId, datasetId },
      { $set: { inheritPermission: true } },
      { session }
    );

    await setDatasetCollectionPermissionEnabled({ datasetId, enabled: false, session });
  });

  return { collectionCount: collectionIds.length };
};

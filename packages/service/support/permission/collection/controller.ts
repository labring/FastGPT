import { PerResourceTypeEnum } from '@fastgpt/global/support/permission/constant';
import type { CollaboratorItemType } from '@fastgpt/global/support/permission/collaborator';
import { DatasetCollectionTypeEnum } from '@fastgpt/global/core/dataset/constants';
import type { ParentIdType } from '@fastgpt/global/common/parentFolder/type';
import type { ClientSession } from '../../../common/mongo';
import { MongoDatasetCollection } from '../../../core/dataset/collection/schema';
import { MongoDataset } from '../../../core/dataset/schema';
import { MongoResourcePermission } from '../schema';
import { getCollaboratorId } from '@fastgpt/global/support/permission/utils';
import { markDatasetCollectionPermissionsSet } from './datasetFlag';
import type { SyncChildrenPermissionResourceType } from '../inheritPermission';
import type { DatasetCollectionSchemaType } from '@fastgpt/global/core/dataset/type';
import {
  createResourcePermissions,
  moveResourcePermissions,
  resumeResourcePermissionInheritance,
  syncResourceTreePermissions
} from '../resourcePermissionService';
import {
  calculateInheritedResourceCollaborators,
  createInheritedResourceCollaboratorCalculator,
  toInheritedCollaborators
} from '../resourcePermissionPolicy';
import {
  resourcePermissionRepo,
  type ResourcePermissionPatch
} from '../repository/resourcePermissionRepo';

/**
 * 读取 collection 的父级有效 clbs（跨类型父级解析——collection 适配层的唯一边界）：
 *  - parentId 有值：父级为 collection folder（同类型），读其物化快照；
 *  - parentId 为空（根）：父级为 dataset，读其物化快照（main 已物化为完整有效 ACL）。
 */
export const resolveCollectionParentClbs = async ({
  teamId,
  datasetId,
  parentId,
  session
}: {
  teamId: string;
  datasetId: string;
  parentId: ParentIdType;
  session?: ClientSession;
}): Promise<CollaboratorItemType[]> => {
  return resourcePermissionRepo.findByResource({
    teamId,
    resourceType: parentId ? PerResourceTypeEnum.collection : PerResourceTypeEnum.dataset,
    resourceId: parentId ? String(parentId) : datasetId,
    session
  });
};

/** 创建 Collection 时需要的资源最小字段。 */
export type CollectionCreateResourceType = SyncChildrenPermissionResourceType & {
  datasetId: string;
  tmbId: string;
};

/**
 * 创建 Collection 时初始化权限记录（全快照模型）：
 * - `inheritPermission=true`（默认）：完整快照 = `merge(父级有效 clbs, [owner])`，
 *   根 collection 父级 = dataset（跨类型覆盖），非根 = 父 collection folder；
 * - `inheritPermission=false`（独立态）：仅 owner 快照（createResourcePermissions 内部父级读空），
 *   并标记所属 dataset 已配置 collection 权限（短路失效）。
 */
export async function createCollectionPermission({
  resource,
  tmbId,
  session
}: {
  resource: CollectionCreateResourceType;
  tmbId: string;
  session: ClientSession;
}): Promise<void> {
  await createResourcePermissions({
    resource,
    resourceType: PerResourceTypeEnum.collection,
    parentResourceType: resource.parentId
      ? PerResourceTypeEnum.collection
      : PerResourceTypeEnum.dataset,
    parentResourceId: resource.parentId ? String(resource.parentId) : resource.datasetId,
    tmbId,
    session
  });

  if (resource.inheritPermission === false) {
    await markDatasetCollectionPermissionsSet({ datasetId: resource.datasetId, session });
  }
}

/** 移动 Collection 所需的最小字段。 */
export type CollectionMoveResourceType = Pick<
  DatasetCollectionSchemaType,
  '_id' | 'type' | 'teamId' | 'parentId' | 'datasetId' | 'tmbId' | 'inheritPermission'
>;

/**
 * 移动 Collection 时的权限处理（全快照模型），以 collection **自身当前继承态**为策略：
 * - `inheritPermission=false`：仅更新 parentId，快照与独立态保持不变（不合并目标父级）；
 * - `inheritPermission=true`（默认）：
 *   - 目标父级 = `resolveCollectionParentClbs(targetParentId)`（根 → dataset 有效 clbs）；
 *   - 源父级 = `resolveCollectionParentClbs(collection.parentId)`（根 → dataset 有效 clbs，
 *     用于剥离旧父级贡献）；
 *   - `moveResourcePermissions` 剥离旧父级、合并新父级，folder 经 `syncResourceTreePermissions`
 *     递归子树；最后更新 parentId 并保持 `inheritPermission=true`。
 */
export async function moveCollectionPermission({
  collection,
  targetParentId,
  session
}: {
  collection: CollectionMoveResourceType;
  /** 目标位置（null 表示 Dataset 根目录）。 */
  targetParentId: ParentIdType;
  session: ClientSession;
}): Promise<void> {
  const teamId = collection.teamId;

  // 保持独立配置：仅更新 parentId，快照与 inheritPermission=false 保持不变
  if (collection.inheritPermission === false) {
    await markDatasetCollectionPermissionsSet({ datasetId: collection.datasetId, session });
    await MongoDatasetCollection.updateOne(
      { _id: collection._id },
      { $set: { parentId: targetParentId || null, inheritPermission: false } },
      { session }
    );
    return;
  }

  // 继承态（含当前无父级的根 collection）：剥离源父级贡献、合并目标父级贡献，保持继承态
  const newParentClbs = await resolveCollectionParentClbs({
    teamId,
    datasetId: collection.datasetId,
    parentId: targetParentId,
    session
  });
  const oldParentClbs = await resolveCollectionParentClbs({
    teamId,
    datasetId: collection.datasetId,
    parentId: collection.parentId,
    session
  });

  await moveResourcePermissions({
    resource: collection,
    newParentId: targetParentId,
    resourceModel: MongoDatasetCollection,
    resourceType: PerResourceTypeEnum.collection,
    newParentCollaborators: newParentClbs,
    oldParentCollaborators: oldParentClbs,
    session
  });

  await MongoDatasetCollection.updateOne(
    { _id: collection._id },
    { $set: { parentId: targetParentId || null, inheritPermission: true } },
    { session }
  );
}

/**
 * 恢复 Collection 继承（全快照模型）：保留相对当前父级独有的权限位并同步子树。
 * 根 collection（parentId 空）父级 = dataset，经 parentResourceType/parentResourceId 覆盖。
 */
export async function resumeCollectionInheritPermission({
  collection,
  session
}: {
  collection: Pick<
    DatasetCollectionSchemaType,
    '_id' | 'tmbId' | 'parentId' | 'datasetId' | 'type' | 'teamId'
  >;
  session?: ClientSession;
}): Promise<void> {
  return resumeResourcePermissionInheritance({
    resource: collection,
    resourceModel: MongoDatasetCollection,
    resourceType: PerResourceTypeEnum.collection,
    parentResourceType: collection.parentId
      ? PerResourceTypeEnum.collection
      : PerResourceTypeEnum.dataset,
    parentResourceId: collection.parentId ? String(collection.parentId) : collection.datasetId,
    session
  });
}

/**
 * Batch-delete Collection 权限记录（`resourceType=collection`），用于 Dataset/Collection 删除
 * 在同一事务内清理，失败整体回滚。幂等。
 */
export async function deleteCollectionPermissions({
  teamId,
  collectionIds,
  session
}: {
  teamId: string;
  collectionIds: string[];
  session: ClientSession;
}): Promise<void> {
  if (collectionIds.length === 0) return;

  await MongoResourcePermission.deleteMany({
    resourceType: PerResourceTypeEnum.collection,
    teamId,
    resourceId: { $in: collectionIds }
  }).session(session);
}

/** 单个 collection 快照 old→new 的 diff patches（insert/update/delete）。 */
const buildSnapshotPatches = ({
  resourceId,
  oldCollaborators,
  newCollaborators
}: {
  resourceId: string;
  oldCollaborators: CollaboratorItemType[];
  newCollaborators: CollaboratorItemType[];
}): ResourcePermissionPatch[] => {
  const patches: ResourcePermissionPatch[] = [];
  const oldMap = new Map(oldCollaborators.map((clb) => [getCollaboratorId(clb), clb]));
  const newMap = new Map(newCollaborators.map((clb) => [getCollaboratorId(clb), clb]));

  for (const newClb of newCollaborators) {
    const oldClb = oldMap.get(getCollaboratorId(newClb));
    if (oldClb?.permission === newClb.permission) continue;
    const { permission, ...collaborator } = newClb;
    patches.push({
      resourceId,
      collaborator,
      action: oldClb ? 'update' : 'insert',
      permission
    });
  }
  for (const oldClb of oldCollaborators) {
    if (newMap.has(getCollaboratorId(oldClb))) continue;
    const { permission: _, ...collaborator } = oldClb;
    patches.push({ resourceId, collaborator, action: 'delete' });
  }

  return patches;
};

/**
 * 将单个 Dataset 的根级继承态 Collection（`parentId: null`）从旧有效 clbs 物化到新有效 clbs，
 * folder 经 `syncResourceTreePermissions` 递归子树。父级来源 = dataset 有效 clbs。
 * 供运行时跨树同步（syncDatasetToCollections）与存量迁移（initCollectionPermission）复用。
 */
export const syncRootCollections = async ({
  teamId,
  datasetId,
  oldRootClbs,
  rootClbs,
  session
}: {
  teamId: string;
  datasetId: string;
  /** Dataset 旧有效 clbs（变更前）。 */
  oldRootClbs: CollaboratorItemType[];
  /** Dataset 新有效 clbs（变更后，作为根级 Collection 的父级来源）。 */
  rootClbs: CollaboratorItemType[];
  session: ClientSession;
}): Promise<void> => {
  // 只处理实际变化的协作者：由父级（dataset 有效 clbs）old/new 对比筛出 affected。
  // 合并计算按 collaborator 独立，无 affected 时子级快照不变，直接短路（零 DB 读）。
  const oldInherited = toInheritedCollaborators(oldRootClbs);
  const newInherited = toInheritedCollaborators(rootClbs);
  const parentCollaboratorsById = new Map(
    [...oldInherited, ...newInherited].map((collaborator) => [
      getCollaboratorId(collaborator),
      collaborator
    ])
  );
  const oldParentPermissions = new Map(
    oldInherited.map((collaborator) => [getCollaboratorId(collaborator), collaborator.permission])
  );
  const newParentPermissions = new Map(
    newInherited.map((collaborator) => [getCollaboratorId(collaborator), collaborator.permission])
  );
  const affectedCollaborators = Array.from(parentCollaboratorsById.values()).filter(
    (collaborator) => {
      const collaboratorId = getCollaboratorId(collaborator);
      return oldParentPermissions.get(collaboratorId) !== newParentPermissions.get(collaboratorId);
    }
  );
  const affectedIdSet = new Set(affectedCollaborators.map(getCollaboratorId));
  if (affectedCollaborators.length === 0) {
    return;
  }
  const oldAffectedRootClbs = oldRootClbs.filter((collaborator) =>
    affectedIdSet.has(getCollaboratorId(collaborator))
  );
  const newAffectedRootClbs = rootClbs.filter((collaborator) =>
    affectedIdSet.has(getCollaboratorId(collaborator))
  );

  const rootChildren = await MongoDatasetCollection.find(
    { teamId, datasetId, parentId: null, inheritPermission: { $ne: false } },
    '_id type tmbId'
  )
    .lean()
    .session(session);
  if (rootChildren.length === 0) return;

  // 只加载受影响协作者的 ACL 行（无 N+1，也不拉全量快照）
  const childIds = rootChildren.map((child) => String(child._id));
  const affectedCollaboratorIds = affectedCollaborators.map(
    ({ permission: _, ...collaborator }) => collaborator
  );
  const allClbs = await resourcePermissionRepo.findByResourceIdsAndCollaborators({
    teamId,
    resourceType: PerResourceTypeEnum.collection,
    resourceIds: childIds,
    collaborators: affectedCollaboratorIds,
    session
  });
  const snapshotMap = new Map<string, CollaboratorItemType[]>();
  for (const clb of allClbs) {
    const rid = String(clb.resourceId);
    const arr = snapshotMap.get(rid) ?? [];
    arr.push(clb);
    snapshotMap.set(rid, arr);
  }

  // 预构造合并计算器（父级只含 affected），同一 dataset 下全部根级 collection 复用，避免循环内重复建 Map
  const calculator = createInheritedResourceCollaboratorCalculator({
    oldParentCollaborators: oldAffectedRootClbs,
    newParentCollaborators: newAffectedRootClbs
  });

  const patches: ResourcePermissionPatch[] = [];
  const folderChildren: Array<{
    childId: string;
    oldSnapshot: CollaboratorItemType[];
    newSnapshot: CollaboratorItemType[];
  }> = [];

  for (const child of rootChildren) {
    const childId = String(child._id);
    const oldSnapshot = snapshotMap.get(childId) ?? [];
    const newSnapshot = calculator(oldSnapshot);
    const childPatches = buildSnapshotPatches({
      resourceId: childId,
      oldCollaborators: oldSnapshot,
      newCollaborators: newSnapshot
    });
    patches.push(...childPatches);

    // folder 自身无变化 ⇒ 其有效 clbs 不变 ⇒ 子树也无需递归
    if (child.type === DatasetCollectionTypeEnum.folder && childPatches.length > 0) {
      folderChildren.push({ childId, oldSnapshot, newSnapshot });
    }
  }

  await resourcePermissionRepo.patchResources({
    teamId,
    resourceType: PerResourceTypeEnum.collection,
    patches,
    session
  });

  // folder 递归：子树复用 syncResourceTreePermissions，其内部对旧快照再做一次 affected 过滤
  for (const { childId, oldSnapshot, newSnapshot } of folderChildren) {
    await syncResourceTreePermissions({
      resource: {
        _id: childId,
        type: DatasetCollectionTypeEnum.folder,
        teamId,
        parentId: null,
        inheritPermission: true
      },
      resourceModel: MongoDatasetCollection,
      resourceType: PerResourceTypeEnum.collection,
      oldParentCollaborators: oldSnapshot,
      newParentCollaborators: newSnapshot,
      session
    });
  }
};

/**
 * dataset 有效 clbs 变更后，将受影响 dataset（含继承态后代）下全部 collection 的快照重新物化。
 * 根级继承态 collection 从 oldEffectiveClbs 物化到 newEffectiveClbs，folder 递归同步子树。
 * 由 dataset 写路径（collaborator/move/resume）在同一事务内调用。幂等（diff 写入）。
 */
export async function syncDatasetToCollections({
  teamId,
  datasetId,
  oldEffectiveClbs,
  newEffectiveClbs,
  session
}: {
  teamId: string;
  datasetId: string;
  /** Dataset 旧有效 clbs（变更前）。 */
  oldEffectiveClbs: CollaboratorItemType[];
  /** Dataset 新有效 clbs（变更后）。 */
  newEffectiveClbs: CollaboratorItemType[];
  session: ClientSession;
}): Promise<void> {
  // 收集 root dataset + 全部后代 dataset（仅继承态后代的有效 clbs 会随父级变化）
  const datasetNodes = new Map<string, { parentId: string | null; inheritPermission?: boolean }>();
  const collectQueue = [datasetId];
  while (collectQueue.length) {
    const currentId = collectQueue.shift()!;
    const children = await MongoDataset.find(
      { teamId, parentId: currentId },
      '_id parentId inheritPermission'
    )
      .lean()
      .session(session);
    for (const child of children) {
      const childId = String(child._id);
      datasetNodes.set(childId, {
        parentId: child.parentId ? String(child.parentId) : null,
        inheritPermission: child.inheritPermission
      });
      collectQueue.push(childId);
    }
  }

  // 批量加载后代 dataset 物化快照（无 N+1）
  const descendantIds = Array.from(datasetNodes.keys());
  const allClbs = await resourcePermissionRepo.findByResourceIds({
    teamId,
    resourceType: PerResourceTypeEnum.dataset,
    resourceIds: descendantIds,
    session
  });
  const ownClbsMap = new Map<string, CollaboratorItemType[]>();
  for (const clb of allClbs) {
    const id = String(clb.resourceId);
    const arr = ownClbsMap.get(id) ?? [];
    arr.push(clb);
    ownClbsMap.set(id, arr);
  }

  // BFS 自顶向下：seed 用 root dataset 的旧/新有效 clbs，逐 dataset 重新物化根级 collection
  const syncQueue: Array<{
    currentId: string;
    oldEffectiveClbs: CollaboratorItemType[];
    newEffectiveClbs: CollaboratorItemType[];
  }> = [{ currentId: datasetId, oldEffectiveClbs, newEffectiveClbs }];
  const visited = new Set<string>();

  while (syncQueue.length) {
    const { currentId, oldEffectiveClbs: oldClbs, newEffectiveClbs: newClbs } = syncQueue.shift()!;
    if (visited.has(currentId)) continue;
    visited.add(currentId);

    await syncRootCollections({
      teamId,
      datasetId: currentId,
      oldRootClbs: oldClbs,
      rootClbs: newClbs,
      session
    });

    for (const childId of descendantIds) {
      const node = datasetNodes.get(childId)!;
      if (node.parentId !== currentId) continue;
      if (node.inheritPermission === false) continue;
      const oldChildClbs = ownClbsMap.get(childId) ?? [];
      const newChildClbs = calculateInheritedResourceCollaborators({
        oldParentCollaborators: oldClbs,
        newParentCollaborators: newClbs,
        childCollaborators: oldChildClbs
      });
      syncQueue.push({
        currentId: childId,
        oldEffectiveClbs: oldChildClbs,
        newEffectiveClbs: newChildClbs
      });
    }
  }
}

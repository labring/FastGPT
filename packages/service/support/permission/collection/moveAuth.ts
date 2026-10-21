import { DatasetErrEnum } from '@fastgpt/global/common/error/code/dataset';
import { TeamErrEnum } from '@fastgpt/global/common/error/code/team';
import { DatasetTypeEnum } from '@fastgpt/global/core/dataset/constants';
import type {
  CollectionWithDatasetType,
  DatasetCollectionSchemaType
} from '@fastgpt/global/core/dataset/type';
import {
  ManagePermissionVal,
  ManageRoleVal,
  OwnerRoleVal,
  PerResourceTypeEnum,
  ReadPermissionVal,
  WritePermissionVal
} from '@fastgpt/global/support/permission/constant';
import { CollectionPermission } from '@fastgpt/global/support/permission/collection/controller';
import type { PermissionValueType } from '@fastgpt/global/support/permission/type';
import { TeamDatasetCreatePermissionVal } from '@fastgpt/global/support/permission/user/constant';
import { sumPer } from '@fastgpt/global/support/permission/utils';
import { MongoDatasetCollection } from '../../../core/dataset/collection/schema';
import { Types } from '../../../common/mongo';
import { MongoDataset } from '../../../core/dataset/schema';
import { getTmbInfoByTmbId } from '../../user/team/controller';
import { parseHeaderCert } from '../auth/common';
import { getTmbPermissionMap } from '../controller';
import { assertDatasetPermission } from '../dataset/utils';
import { getGroupsByTmbId } from '../memberGroup/controllers';
import { getOrgIdSetWithParentByTmbId } from '../org/controllers';
import {
  shouldInheritResourcePermission,
  toInheritedPermissionValue
} from '../resourcePermissionPolicy';
import type { AuthModeType } from '../type';

export type CollectionMoveAuthItem = { collectionId: string; targetParentId: string | null };

/**
 * 批量移动鉴权：从真实源节点推导旧父级，合并源 read、源/目标 manage 和根目录团队权限。
 * 同一请求只解析一次身份，知识库和成员上下文复用；节点和 ACL 按唯一 ID 分批查询。
 * 创建及普通字段写校验可并入同一上下文。newFolderIds 仅接受服务端已授权创建计划中的 ID，
 * 新目录归调用者所有，无需查询尚未落库的目录；不能直接接受 HTTP 提供的豁免列表。
 */
export const authDatasetCollectionMoves = async ({
  datasetId: requestedDatasetId,
  moves: requestedMoves,
  collectionChecks: requestedCollectionChecks = [],
  creationParentIds: requestedCreationParentIds = [],
  newFolderIds: requestedNewFolderIds = new Set<string>(),
  ...auth
}: AuthModeType & {
  datasetId?: string;
  moves: CollectionMoveAuthItem[];
  collectionChecks?: { collectionId: string; per: PermissionValueType }[];
  creationParentIds?: (string | null)[];
  newFolderIds?: Set<string>;
}) => {
  // Mongoose 文档的 _id 运行时可能是 ObjectId；统一 Map、豁免列表和 Mongo 查询的 ID 形式。
  const idOf = (id: string) => new Types.ObjectId(id).toHexString();
  // HTTP 层 SelectCollections 用空串表示根目录，ObjectId 转换前统一收敛为 null。
  const parentIdOf = (id: string | null) => (id ? idOf(id) : null);
  const moves = requestedMoves.map((item) => ({
    collectionId: idOf(item.collectionId),
    targetParentId: parentIdOf(item.targetParentId)
  }));
  const collectionChecks = requestedCollectionChecks.map((item) => ({
    ...item,
    collectionId: idOf(item.collectionId)
  }));
  const creationParentIds = requestedCreationParentIds.map(parentIdOf);
  const newFolderIds = new Set([...requestedNewFolderIds].map(idOf));
  const identity = await parseHeaderCert(auth);
  const { teamId, tmbId, isRoot } = identity;
  const collections = new Map<string, DatasetCollectionSchemaType>();
  /** 只读本轮唯一节点；第二轮补查源父级，绝不信任计划中的 oldParentId。 */
  const loadCollections = async (ids: string[]) => {
    const missing = [...new Set(ids)].filter((id) => !collections.has(id));
    for (let offset = 0; offset < missing.length; offset += 1000) {
      const batch = missing.slice(offset, offset + 1000);
      const rows = await MongoDatasetCollection.find({ _id: { $in: batch } }).lean();
      for (const row of rows) collections.set(String(row._id), row);
      if (batch.some((id) => !collections.has(id))) throw DatasetErrEnum.unExist;
    }
  };
  await loadCollections([
    ...moves.map((item) => item.collectionId),
    ...collectionChecks.map((item) => item.collectionId)
  ]);
  const datasetId = requestedDatasetId ?? collections.values().next().value?.datasetId;
  if (!datasetId) throw DatasetErrEnum.unExist;

  const [dataset, tmbInfo] = await Promise.all([
    MongoDataset.findOne({ _id: datasetId, deleteTime: null }).lean(),
    getTmbInfoByTmbId({ tmbId })
  ]);
  if (!dataset) throw DatasetErrEnum.unExist;
  if (!isRoot && String(tmbInfo.teamId) !== teamId) throw DatasetErrEnum.unAuthDataset;
  const isTeamOwner = String(tmbInfo.teamId) === teamId && tmbInfo.permission.isOwner;

  // 将所有检查归并成资源所需权限；显式移动即使父级相同，也保持普通移动的 manage 契约。
  const requirements = new Map<string, PermissionValueType>();
  const requireCollection = (id: string, per: PermissionValueType) =>
    requirements.set(id, sumPer(requirements.get(id) ?? 0, per) ?? 0);
  for (const check of collectionChecks) requireCollection(check.collectionId, check.per);
  for (const parentId of creationParentIds) {
    if (parentId) requireCollection(parentId, WritePermissionVal);
  }
  let requiresRootMove = false;
  for (const move of moves) {
    const collection = collections.get(move.collectionId)!;
    const oldParentId = collection.parentId ? String(collection.parentId) : null;
    requireCollection(move.collectionId, ReadPermissionVal);
    if (oldParentId) requireCollection(oldParentId, ManagePermissionVal);
    if (move.targetParentId && !newFolderIds.has(move.targetParentId)) {
      requireCollection(move.targetParentId, ManagePermissionVal);
    }
    requiresRootMove ||= oldParentId === null || move.targetParentId === null;
  }
  await loadCollections([...requirements.keys()]);
  for (const collection of collections.values()) {
    if (
      String(collection.datasetId) !== String(dataset._id) ||
      String(collection.teamId) !== String(dataset.teamId)
    ) {
      throw DatasetErrEnum.unAuthDatasetCollection;
    }
  }

  // 个人 ACL 为 0 也必须保留；列表的 readable 查询不能用于变更鉴权。
  const [groupIds, orgIds] =
    isRoot || isTeamOwner
      ? [[], []]
      : await Promise.all([
          getGroupsByTmbId({ teamId, tmbId }).then((groups) =>
            groups.map((group) => String(group._id))
          ),
          getOrgIdSetWithParentByTmbId({ teamId, tmbId }).then((ids) => [...ids])
        ]);
  const context = { teamId: String(dataset.teamId), tmbId, groupIds, orgIds };
  const inheritedDatasetParent =
    shouldInheritResourcePermission(dataset.inheritPermission) &&
    dataset.type !== DatasetTypeEnum.folder &&
    dataset.parentId
      ? String(dataset.parentId)
      : undefined;
  const datasetPermissions =
    isRoot || isTeamOwner
      ? new Map<string, number>()
      : await getTmbPermissionMap({
          ...context,
          resourceType: PerResourceTypeEnum.dataset,
          resourceIds: [
            String(dataset._id),
            ...(inheritedDatasetParent ? [inheritedDatasetParent] : [])
          ]
        });
  const authorizedDataset = assertDatasetPermission({
    dataset,
    teamId,
    tmbId,
    isRoot,
    isTeamOwner,
    // 父级 owner 在子级只能是 manage：不能用父目录的原始 owner role 通过 owner 级校验。
    role:
      sumPer(
        datasetPermissions.get(String(dataset._id)) ?? 0,
        inheritedDatasetParent
          ? toInheritedPermissionValue(datasetPermissions.get(inheritedDatasetParent) ?? 0)
          : 0
      ) ?? 0,
    per: creationParentIds.includes(null) ? WritePermissionVal : ReadPermissionVal
  });
  if (requiresRootMove && !isRoot && !tmbInfo.permission.checkPer(TeamDatasetCreatePermissionVal)) {
    throw TeamErrEnum.unAuthTeam;
  }

  const aclIds = [...requirements.keys()].filter(
    (id) => String(collections.get(id)!.tmbId) !== tmbId
  );
  const roles =
    dataset.collectionPermissionEnabled === true && !isRoot && !isTeamOwner
      ? await getTmbPermissionMap({
          ...context,
          resourceType: PerResourceTypeEnum.collection,
          resourceIds: aclIds
        })
      : new Map<string, number>();
  for (const [id, per] of requirements) {
    const isOwner = isRoot || isTeamOwner || String(collections.get(id)!.tmbId) === tmbId;
    const role =
      dataset.collectionPermissionEnabled === true
        ? (roles.get(id) ?? 0)
        : authorizedDataset.permission.role === OwnerRoleVal
          ? ManageRoleVal
          : authorizedDataset.permission.role;
    if (!new CollectionPermission({ role, isOwner }).checkPer(per)) {
      throw DatasetErrEnum.unAuthDatasetCollection;
    }
  }
  return { ...identity, dataset: authorizedDataset, collections };
};

/** 单节点移动沿用同一批量鉴权实现，返回完整源节点供后续事务及审计使用。 */
export const authDatasetCollectionMove = async ({
  collectionId,
  targetParentId,
  ...auth
}: AuthModeType & CollectionMoveAuthItem) => {
  const result = await authDatasetCollectionMoves({
    ...auth,
    moves: [{ collectionId, targetParentId }]
  });
  const collection: CollectionWithDatasetType = {
    ...result.collections.get(new Types.ObjectId(collectionId).toHexString())!,
    dataset: result.dataset
  };
  return { ...result, collection };
};

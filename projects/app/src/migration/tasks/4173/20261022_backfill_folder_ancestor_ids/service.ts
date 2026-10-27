import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import { DatasetTypeEnum } from '@fastgpt/global/core/dataset/constants';
import { defaultSubtreeMaxDepth } from '@fastgpt/global/common/parentFolder/subtree';
import { Types } from '@fastgpt/service/common/mongo';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { MongoDataset } from '@fastgpt/service/core/dataset/schema';

export type FolderMigrationStage = 'apps' | 'datasets';
type FolderMigrationDoc = {
  _id: Types.ObjectId;
  teamId?: Types.ObjectId | string | null;
  type?: string | null;
  parentId?: Types.ObjectId | string | null;
  ancestorIds?: unknown;
};
type MigrationOperation = {
  updateOne: {
    filter: { _id: Types.ObjectId };
    update: {
      $set?: { ancestorIds?: Types.ObjectId[]; parentId?: null };
      $unset?: { ancestorIds: '' };
    };
  };
};
type MigrationCollection = {
  findOne: (
    filter: Record<string, unknown>,
    options?: Record<string, unknown>
  ) => Promise<FolderMigrationDoc | null>;
  find: (
    filter: Record<string, unknown>,
    options?: Record<string, unknown>
  ) => {
    sort: (sort: Record<string, 1 | -1>) => {
      limit: (limit: number) => { toArray: () => Promise<FolderMigrationDoc[]> };
    };
  };
  countDocuments: (filter: Record<string, unknown>) => Promise<number>;
  bulkWrite: (
    operations: MigrationOperation[],
    options?: { session?: unknown; ordered?: boolean }
  ) => Promise<unknown>;
};

/** 以 parentId 作为权威关系；不同类型的应用文件夹属于互相隔离的目录树。 */
const getCollection = (stage: FolderMigrationStage): MigrationCollection =>
  (stage === 'apps'
    ? MongoApp.collection
    : MongoDataset.collection) as unknown as MigrationCollection;

const getFolderType = (stage: FolderMigrationStage, type: string | null | undefined) => {
  if (stage === 'apps') {
    return type === AppTypeEnum.folder || type === AppTypeEnum.toolFolder ? type : null;
  }
  return type === DatasetTypeEnum.folder ? type : null;
};

/** 获取稳定 `_id` 快照的结束游标和记录总数。 */
export const getFolderMigrationSnapshot = async (stage: FolderMigrationStage) => {
  const collection = getCollection(stage);
  const lastDoc = await collection
    .find({}, { projection: { _id: 1 } })
    .sort({ _id: -1 })
    .limit(1)
    .toArray();
  const endId = lastDoc[0]?._id ?? null;
  const total = endId ? await collection.countDocuments({ _id: { $lte: endId } }) : 0;
  return { endId, total };
};

/** 按 ObjectId 稳定读取批次，并包含已软删除的文档。 */
export const readFolderMigrationBatch = async ({
  stage,
  lastId,
  endId,
  limit
}: {
  stage: FolderMigrationStage;
  lastId: Types.ObjectId | null;
  endId: Types.ObjectId;
  limit: number;
}) =>
  getCollection(stage)
    .find(
      { _id: { ...(lastId ? { $gt: lastId } : {}), $lte: endId } },
      { projection: { _id: 1, teamId: 1, type: 1, parentId: 1, ancestorIds: 1 } }
    )
    .sort({ _id: 1 })
    .limit(limit)
    .toArray();

/** 重试时优先读取失败记录，使已修复的数据能够从错误快照中移除。 */
export const readFolderMigrationDocsByIds = async ({
  stage,
  ids
}: {
  stage: FolderMigrationStage;
  ids: string[];
}) => {
  const objectIds = ids
    .filter((id) => Types.ObjectId.isValid(id))
    .map((id) => new Types.ObjectId(id));
  if (objectIds.length === 0) return [];
  return getCollection(stage)
    .find(
      { _id: { $in: objectIds } },
      { projection: { _id: 1, teamId: 1, type: 1, parentId: 1, ancestorIds: 1 } }
    )
    .sort({ _id: 1 })
    .limit(objectIds.length)
    .toArray();
};

/**
 * 为单条文档规划确定性更新。
 *
 * 跨树引用（父级与自身不属于同一棵目录树）是历史脏数据，而不是可修复的数据错误：普通应用树
 * 与工具树互相隔离，任何一方都不能成为对方的父级。这里只在“跨树边界”断开，不动其它关系：
 * - 直接父级跨树：该记录失去父级，移到团队顶层（parentId、ancestorIds 一起清空）；
 * - 更高层祖先跨树：保留同树部分的 parentId，路径在边界处截断。
 * 不能把所有下游记录一起移到顶层，否则会连带拆散原本同树、正确的父子关系。
 *
 * 其余目录关系错误（父级不存在、跨团队、成环、超出深度）仍只记录失败、不修改该文档；
 * 数据库等运行故障继续抛出，使 Runner 保留最后一次已提交的断点。
 */
const planDocument = async ({
  stage,
  doc,
  verifyOnly
}: {
  stage: FolderMigrationStage;
  doc: FolderMigrationDoc;
  verifyOnly: boolean;
}): Promise<{ operation?: MigrationOperation; reason?: string }> => {
  const collection = getCollection(stage);
  const folderType = getFolderType(stage, doc.type);

  if (!folderType) {
    if (!Object.prototype.hasOwnProperty.call(doc, 'ancestorIds')) return {};
    if (verifyOnly) return { reason: 'non-folder document retains ancestorIds' };
    return {
      operation: {
        updateOne: { filter: { _id: doc._id }, update: { $unset: { ancestorIds: '' } } }
      }
    };
  }

  const ancestorIds: Types.ObjectId[] = [];
  const visited = new Set([String(doc._id)]);
  let parentId = doc.parentId ? String(doc.parentId) : null;
  // 直接父级就跨树时才置位：此时自身失去父级，需连同 parentId 一起改写。
  let detachToRoot = false;

  while (parentId) {
    if (!Types.ObjectId.isValid(parentId)) return { reason: 'parentId is not a valid ObjectId' };
    if (visited.has(parentId)) return { reason: 'folder parent cycle detected' };
    // 迁移保留限制生效前的历史嵌套，仅用遍历上限防止失控扫描。
    // 普通创建和移动受 MAX_FOLDER_DEPTH 约束，不能据此将历史超深父链判为非法。
    if (ancestorIds.length >= defaultSubtreeMaxDepth - 1) {
      return { reason: 'folder hierarchy exceeds the traversal limit' };
    }
    visited.add(parentId);

    const parent = await collection.findOne(
      { _id: new Types.ObjectId(parentId) },
      { projection: { _id: 1, teamId: 1, type: 1, parentId: 1 } }
    );
    if (!parent) return { reason: 'parent document does not exist' };
    if (String(parent.teamId) !== String(doc.teamId))
      return { reason: 'parent belongs to another team' };
    if (parent.type !== folderType) {
      // 上溯到此即跨树。ancestorIds 为空说明断点就在直接父级，否则只是更高层祖先越界。
      detachToRoot = ancestorIds.length === 0;
      break;
    }

    ancestorIds.push(parent._id);
    parentId = parent.parentId ? String(parent.parentId) : null;
  }

  // 直接父级跨树：清空 parentId 与路径，避免下一次校验重复命中同一错误。
  if (detachToRoot) {
    if (verifyOnly) return { reason: 'parent folder type does not match this tree' };
    return {
      operation: {
        updateOne: {
          filter: { _id: doc._id },
          update: { $set: { parentId: null, ancestorIds: [] } }
        }
      }
    };
  }

  ancestorIds.reverse();
  const currentPath = Array.isArray(doc.ancestorIds) ? doc.ancestorIds.map(String) : [];
  const expectedPath = ancestorIds.map(String);
  const matches =
    Array.isArray(doc.ancestorIds) &&
    currentPath.length === expectedPath.length &&
    currentPath.every((id, index) => id === expectedPath[index]);
  if (matches) return {};
  if (verifyOnly) return { reason: 'ancestorIds does not match the parentId tree' };
  return {
    operation: {
      updateOne: {
        filter: { _id: doc._id },
        update: { $set: { ancestorIds } }
      }
    }
  };
};

/** 规划并应用批次更新，仅返回坏数据 ID 和可安全持久化的简短失败原因。 */
export const migrateFolderMigrationBatch = async ({
  stage,
  docs,
  verifyOnly = false
}: {
  stage: FolderMigrationStage;
  docs: FolderMigrationDoc[];
  verifyOnly?: boolean;
}): Promise<{ errors: Array<{ id: string; reason: string }>; changedCount: number }> => {
  const operations: MigrationOperation[] = [];
  const errors: Array<{ id: string; reason: string }> = [];

  for (const doc of docs) {
    const plan = await planDocument({ stage, doc, verifyOnly });
    if (plan.reason) errors.push({ id: String(doc._id), reason: plan.reason });
    if (plan.operation) operations.push(plan.operation);
  }

  if (!verifyOnly && operations.length > 0) {
    await mongoSessionRun(async (session) => {
      await getCollection(stage).bulkWrite(operations, { session, ordered: false });
    });
  }

  return { errors, changedCount: operations.length };
};

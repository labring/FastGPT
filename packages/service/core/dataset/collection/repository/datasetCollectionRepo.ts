import { unwrapMongoSession } from '@fastgpt/dal/db/mongo/base';
import type { DbSession } from '@fastgpt/dal/db/types';
import { DatasetCollectionTypeEnum } from '@fastgpt/global/core/dataset/constants';
import type { ClientSession, Types } from '../../../../common/mongo';
import { MongoDatasetCollection } from '../schema';

const resolveMongoSession = (tx?: DbSession, session?: ClientSession) =>
  session ?? unwrapMongoSession(tx);

export type DatasetCollectionTreeNode = {
  _id: string;
  parentId?: string | null;
  inheritPermission?: boolean;
};

/**
 * dataset_collections 的 Mongo 仓储适配层。
 * 统一收口裸 Model 访问与 `DbSession` 解包，供权限物化与同步范围管理复用。
 */
export const datasetCollectionRepo = {
  /** 将指定集合批量翻为独立权限态（inheritPermission=false）。 */
  markIndependent: async ({
    teamId,
    datasetId,
    collectionIds,
    tx
  }: {
    teamId: string;
    datasetId: string;
    collectionIds: string[];
    tx?: DbSession;
  }) => {
    if (collectionIds.length === 0) return;

    const mongoSession = unwrapMongoSession(tx);
    await MongoDatasetCollection.updateMany(
      { teamId, datasetId, _id: { $in: collectionIds } },
      { $set: { inheritPermission: false } },
      mongoSession ? { session: mongoSession } : undefined
    );
  },

  /** 查询指定集合所属的 datasetId（供权限树传播固定索引前缀）。 */
  findDatasetIdById: async ({
    teamId,
    collectionId,
    tx
  }: {
    teamId: string;
    collectionId: string;
    tx?: DbSession;
  }): Promise<string | undefined> => {
    const row = await MongoDatasetCollection.findOne({ _id: collectionId, teamId }, 'datasetId')
      .lean<{ datasetId?: string | Types.ObjectId } | null>()
      .session(unwrapMongoSession(tx) ?? null);
    return row?.datasetId ? String(row.datasetId) : undefined;
  },

  /** 按层查询指定父集合列表的直接子集合（含继承标志）。 */
  findDirectChildren: async ({
    teamId,
    datasetId,
    parentIds,
    tx
  }: {
    teamId: string;
    datasetId?: string;
    parentIds: string[];
    tx?: DbSession;
  }): Promise<DatasetCollectionTreeNode[]> => {
    if (parentIds.length === 0) return [];

    const rows = await MongoDatasetCollection.find(
      {
        teamId,
        ...(datasetId ? { datasetId } : {}),
        parentId: { $in: parentIds }
      },
      '_id parentId inheritPermission'
    )
      .lean<DatasetCollectionTreeNode[]>()
      .session(unwrapMongoSession(tx) ?? null);

    return rows;
  },

  /** 恢复指定 API 目录集合的自动同步子项开关（syncChildren=true）。 */
  reEnableSyncFolders: async ({
    teamId,
    datasetId,
    folderIds,
    tx,
    session
  }: {
    teamId: string | Types.ObjectId;
    datasetId: string | Types.ObjectId;
    folderIds: string[];
    tx?: DbSession;
    session?: ClientSession;
  }) => {
    if (folderIds.length === 0) return;

    const mongoSession = resolveMongoSession(tx, session);
    await MongoDatasetCollection.updateMany(
      {
        _id: { $in: folderIds },
        teamId,
        datasetId,
        type: DatasetCollectionTypeEnum.folder
      },
      { $set: { syncChildren: true } },
      mongoSession ? { session: mongoSession } : undefined
    );
  },

  /** 恢复指定 API 知识库内全部已暂停（syncChildren=false）的 API 目录集合。 */
  reEnableAllPausedApiFolders: async ({
    teamId,
    datasetId,
    tx,
    session
  }: {
    teamId: string | Types.ObjectId;
    datasetId: string | Types.ObjectId;
    tx?: DbSession;
    session?: ClientSession;
  }) => {
    const mongoSession = resolveMongoSession(tx, session);
    await MongoDatasetCollection.updateMany(
      {
        teamId,
        datasetId,
        type: DatasetCollectionTypeEnum.folder,
        apiFileId: { $exists: true, $ne: null },
        syncChildren: false
      },
      { $set: { syncChildren: true } },
      mongoSession ? { session: mongoSession } : undefined
    );
  }
};

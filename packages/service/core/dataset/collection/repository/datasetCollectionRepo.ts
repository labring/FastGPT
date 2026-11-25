import { unwrapMongoSession } from '@fastgpt/dal/db/mongo/base';
import type {
  DatasetCollectionApiSyncRepository,
  DatasetCollectionLegacySentinelDTO,
  DatasetCollectionTreeNodeDTO
} from '@fastgpt/dal/db/repos/datasetCollection/repo.type';
import { DatasetCollectionTypeEnum } from '@fastgpt/global/core/dataset/constants';
import { Types } from '../../../../common/mongo';
import { MongoDatasetCollection } from '../schema';

/**
 * dataset_collections 的 Mongo 仓储适配层。
 * 实现 `@fastgpt/dal/db/repos/datasetCollection/repo.type` 公开契约，统一收口裸 Model 访问、
 * `ObjectId` 转换与 `DbSession` 解包，出口仅返回归一化窄 DTO。
 */
export const datasetCollectionRepo: DatasetCollectionApiSyncRepository = {
  /** 将指定集合批量翻为独立权限态（inheritPermission=false）。 */
  markIndependent: async ({ teamId, datasetId, collectionIds, tx }) => {
    if (collectionIds.length === 0) return;

    const mongoSession = unwrapMongoSession(tx);
    await MongoDatasetCollection.updateMany(
      { teamId, datasetId, _id: { $in: collectionIds } },
      { $set: { inheritPermission: false } },
      mongoSession ? { session: mongoSession } : undefined
    );
  },

  /** 查询指定集合所属的 datasetId（供权限树传播固定索引前缀）。 */
  findDatasetIdById: async ({ teamId, collectionId, tx }): Promise<string | undefined> => {
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
  }): Promise<DatasetCollectionTreeNodeDTO[]> => {
    if (parentIds.length === 0) return [];

    const rows = await MongoDatasetCollection.find(
      {
        teamId,
        ...(datasetId ? { datasetId } : {}),
        parentId: { $in: parentIds }
      },
      '_id parentId inheritPermission'
    )
      .lean()
      .session(unwrapMongoSession(tx) ?? null);

    return rows.map((row) => ({
      _id: String(row._id),
      parentId: row.parentId ? String(row.parentId) : null,
      inheritPermission: row.inheritPermission
    }));
  },

  /** 恢复指定 API 目录集合的自动同步子项开关（syncChildren=true）。 */
  reEnableSyncFolders: async ({ teamId, datasetId, folderIds, tx }) => {
    if (folderIds.length === 0) return;

    const mongoSession = unwrapMongoSession(tx);
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
  reEnableAllPausedApiFolders: async ({ teamId, datasetId, tx }) => {
    const mongoSession = unwrapMongoSession(tx);
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
  },

  /** 查询知识库下的历史 SYSTEM_ROOT 哨兵集合。 */
  findLegacySystemRootSentinels: async ({
    datasetId,
    apiFileId,
    tx
  }): Promise<DatasetCollectionLegacySentinelDTO[]> => {
    const rows = await MongoDatasetCollection.find(
      {
        datasetId: new Types.ObjectId(datasetId),
        apiFileId
      },
      '_id teamId inheritPermission'
    )
      .lean()
      .session(unwrapMongoSession(tx) ?? null);

    return rows.map((row) => ({
      _id: String(row._id),
      teamId: String(row.teamId),
      inheritPermission: row.inheritPermission
    }));
  },

  /** 将历史哨兵下的直接子节点重挂到知识库根，并按需固化原独立哨兵下的继承态快照。 */
  reparentLegacySystemRootChildren: async ({
    datasetId,
    sentinelIds,
    independentSentinelIds,
    preserveIndependentSnapshot,
    tx
  }): Promise<number> => {
    if (sentinelIds.length === 0) return 0;

    const datasetObjectId = new Types.ObjectId(datasetId);
    const sentinelObjectIds = sentinelIds.map((id) => new Types.ObjectId(id));
    const mongoSession = unwrapMongoSession(tx);
    const writeOpts = mongoSession ? { session: mongoSession } : undefined;
    let reparented = 0;

    if (preserveIndependentSnapshot && independentSentinelIds.length > 0) {
      const independentObjectIds = independentSentinelIds.map((id) => new Types.ObjectId(id));
      const res = await MongoDatasetCollection.updateMany(
        {
          datasetId: datasetObjectId,
          parentId: { $in: independentObjectIds },
          inheritPermission: { $ne: false }
        },
        { $set: { parentId: null, inheritPermission: false } },
        writeOpts
      );
      reparented += res.modifiedCount;
    }

    const restRes = await MongoDatasetCollection.updateMany(
      {
        datasetId: datasetObjectId,
        parentId: { $in: sentinelObjectIds }
      },
      { $set: { parentId: null } },
      writeOpts
    );
    reparented += restRes.modifiedCount;

    return reparented;
  },

  /** 按 ID 批量删除集合记录。 */
  deleteByIds: async ({ collectionIds, tx }) => {
    if (collectionIds.length === 0) return;

    const mongoSession = unwrapMongoSession(tx);
    await MongoDatasetCollection.deleteMany(
      { _id: { $in: collectionIds.map((id) => new Types.ObjectId(id)) } },
      mongoSession ? { session: mongoSession } : undefined
    );
  },

  /** 清除集合上残留的历史 SYSTEM_ROOT apiFileParentId 引用。 */
  unsetLegacySystemRootParentRef: async ({ datasetId, apiFileParentId, tx }) => {
    const mongoSession = unwrapMongoSession(tx);
    await MongoDatasetCollection.updateMany(
      {
        datasetId: new Types.ObjectId(datasetId),
        apiFileParentId
      },
      { $unset: { apiFileParentId: '' } },
      mongoSession ? { session: mongoSession } : undefined
    );
  }
};

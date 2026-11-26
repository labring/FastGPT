import { DatasetCollectionTypeEnum } from '@fastgpt/global/core/dataset/constants';
import z from 'zod';
import { MongoRepositoryBase } from '../../../mongo/base';
import type { DbRuntime } from '../../../runtime';
import type { DbSession } from '../../../types';
import type {
  DatasetCollectionApiSyncRepository,
  DatasetCollectionLegacySentinelDTO,
  DatasetCollectionTreeNodeDTO
} from '../repo.type';
import {
  datasetCollectionApiSyncMongoCollection,
  type DatasetCollectionApiSyncMongoDoc
} from './schema';

const DatasetCollectionPassthroughReadSchema = z.unknown();

/**
 * dataset_collections 的 MongoDB 仓储实现（API 同步范围、权限物化与历史哨兵清理）。
 * 统一收口裸 Model 访问、`ObjectId` 转换与 `DbSession` 解包，出口仅返回归一化窄 DTO。
 */
export class MongoDatasetCollectionApiSyncRepository
  extends MongoRepositoryBase<
    DatasetCollectionApiSyncMongoDoc,
    typeof DatasetCollectionPassthroughReadSchema
  >
  implements DatasetCollectionApiSyncRepository
{
  constructor(runtime?: DbRuntime) {
    super({
      collection: datasetCollectionApiSyncMongoCollection,
      readSchema: DatasetCollectionPassthroughReadSchema,
      runtime
    });
  }

  /** 将指定集合批量翻为独立权限态（inheritPermission=false）。 */
  async markIndependent({
    teamId,
    datasetId,
    collectionIds,
    tx
  }: {
    teamId: string;
    datasetId: string;
    collectionIds: string[];
    tx?: DbSession;
  }): Promise<void> {
    if (collectionIds.length === 0) return;

    await this.model.updateMany(
      { teamId, datasetId, _id: { $in: collectionIds } },
      { $set: { inheritPermission: false } },
      this.txOpts(tx)
    );
  }

  /** 查询指定集合所属的 datasetId（供权限树传播固定索引前缀）。 */
  async findDatasetIdById({
    teamId,
    collectionId,
    tx
  }: {
    teamId: string;
    collectionId: string;
    tx?: DbSession;
  }): Promise<string | undefined> {
    const row = await this.model
      .findOne({ _id: collectionId, teamId }, 'datasetId', this.txOpts(tx))
      .lean<{ datasetId?: unknown } | null>();
    return row?.datasetId ? String(row.datasetId) : undefined;
  }

  /** 按层查询指定父集合列表的直接子集合（含继承标志）。 */
  async findDirectChildren({
    teamId,
    datasetId,
    parentIds,
    tx
  }: {
    teamId: string;
    datasetId?: string;
    parentIds: string[];
    tx?: DbSession;
  }): Promise<DatasetCollectionTreeNodeDTO[]> {
    if (parentIds.length === 0) return [];

    const rows = await this.model
      .find(
        {
          teamId,
          ...(datasetId ? { datasetId } : {}),
          parentId: { $in: parentIds }
        },
        '_id parentId inheritPermission',
        this.txOpts(tx)
      )
      .lean();

    return rows.map((row) => ({
      _id: String(row._id),
      parentId: row.parentId ? String(row.parentId) : null,
      inheritPermission: row.inheritPermission
    }));
  }

  /** 恢复指定 API 目录集合的自动同步子项开关（syncChildren=true）。 */
  async reEnableSyncFolders({
    teamId,
    datasetId,
    folderIds,
    tx
  }: {
    teamId: string;
    datasetId: string;
    folderIds: string[];
    tx?: DbSession;
  }): Promise<void> {
    if (folderIds.length === 0) return;

    await this.model.updateMany(
      {
        _id: { $in: folderIds },
        teamId,
        datasetId,
        type: DatasetCollectionTypeEnum.folder
      },
      { $set: { syncChildren: true } },
      this.txOpts(tx)
    );
  }

  /** 恢复指定 API 知识库内全部已暂停（syncChildren=false）的 API 目录集合。 */
  async reEnableAllPausedApiFolders({
    teamId,
    datasetId,
    tx
  }: {
    teamId: string;
    datasetId: string;
    tx?: DbSession;
  }): Promise<void> {
    await this.model.updateMany(
      {
        teamId,
        datasetId,
        type: DatasetCollectionTypeEnum.folder,
        apiFileId: { $exists: true, $ne: null },
        syncChildren: false
      },
      { $set: { syncChildren: true } },
      this.txOpts(tx)
    );
  }

  /** 查询知识库下的历史 SYSTEM_ROOT 哨兵集合。 */
  async findLegacySystemRootSentinels({
    datasetId,
    apiFileId,
    tx
  }: {
    datasetId: string;
    apiFileId: string;
    tx?: DbSession;
  }): Promise<DatasetCollectionLegacySentinelDTO[]> {
    const rows = await this.model
      .find(
        {
          datasetId: this.oid(datasetId),
          apiFileId
        },
        '_id teamId inheritPermission',
        this.txOpts(tx)
      )
      .lean();

    return rows.map((row) => ({
      _id: String(row._id),
      teamId: String(row.teamId),
      inheritPermission: row.inheritPermission
    }));
  }

  /** 将历史哨兵下的直接子节点重挂到知识库根，并按需固化原独立哨兵下的继承态快照。 */
  async reparentLegacySystemRootChildren({
    datasetId,
    sentinelIds,
    independentSentinelIds,
    preserveIndependentSnapshot,
    tx
  }: {
    datasetId: string;
    sentinelIds: string[];
    independentSentinelIds: string[];
    preserveIndependentSnapshot: boolean;
    tx?: DbSession;
  }): Promise<number> {
    if (sentinelIds.length === 0) return 0;

    const datasetObjectId = this.oid(datasetId);
    const sentinelObjectIds = this.oids(sentinelIds);
    const writeOpts = this.txOpts(tx);
    let reparented = 0;

    if (preserveIndependentSnapshot && independentSentinelIds.length > 0) {
      const independentObjectIds = this.oids(independentSentinelIds);
      const res = await this.model.updateMany(
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

    const restRes = await this.model.updateMany(
      {
        datasetId: datasetObjectId,
        parentId: { $in: sentinelObjectIds }
      },
      { $set: { parentId: null } },
      writeOpts
    );
    reparented += restRes.modifiedCount;

    return reparented;
  }

  /** 按 ID 批量删除集合记录。 */
  async deleteByIds({
    collectionIds,
    tx
  }: {
    collectionIds: string[];
    tx?: DbSession;
  }): Promise<void> {
    if (collectionIds.length === 0) return;

    await this.model.deleteMany({ _id: { $in: this.oids(collectionIds) } }, this.txOpts(tx));
  }

  /** 清除集合上残留的历史 SYSTEM_ROOT apiFileParentId 引用。 */
  async unsetLegacySystemRootParentRef({
    datasetId,
    apiFileParentId,
    tx
  }: {
    datasetId: string;
    apiFileParentId: string;
    tx?: DbSession;
  }): Promise<void> {
    await this.model.updateMany(
      {
        datasetId: this.oid(datasetId),
        apiFileParentId
      },
      { $unset: { apiFileParentId: '' } },
      this.txOpts(tx)
    );
  }
}

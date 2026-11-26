import z from 'zod';
import { MongoRepositoryBase } from '../../../mongo/base';
import type { DbRuntime } from '../../../runtime';
import type { DbSession } from '../../../types';
import type {
  DatasetApiSyncRepository,
  DatasetLegacySystemRootMetaDTO,
  DatasetPermissionLockDTO
} from '../repo.type';
import { datasetApiSyncMongoCollection, type DatasetApiSyncMongoDoc } from './schema';

const DatasetPassthroughReadSchema = z.unknown();

/**
 * datasets 的 MongoDB 仓储实现（API 知识库同步范围与权限托管）。
 * 统一收口裸 Model 访问、`ObjectId` 转换与 `DbSession` 解包，出口仅返回窄 DTO。
 */
export class MongoDatasetApiSyncRepository
  extends MongoRepositoryBase<DatasetApiSyncMongoDoc, typeof DatasetPassthroughReadSchema>
  implements DatasetApiSyncRepository
{
  constructor(runtime?: DbRuntime) {
    super({
      collection: datasetApiSyncMongoCollection,
      readSchema: DatasetPassthroughReadSchema,
      runtime
    });
  }

  /**
   * 锁住知识库文档并递增 collectionPermissionVersion，返回最新的 apiDatasetServer 快照。
   * 写权限事务通过版本自增与并发启停托管产生写冲突，重试时重读最新配置决定是否丢弃旧轮次。
   */
  async bumpCollectionPermissionVersion({
    datasetId,
    teamId,
    tx
  }: {
    datasetId: string;
    teamId: string;
    tx?: DbSession;
  }): Promise<DatasetPermissionLockDTO | null> {
    const doc = await this.model
      .findOneAndUpdate(
        { _id: datasetId, teamId },
        { $inc: { collectionPermissionVersion: 1 } },
        { ...this.txOpts(tx), new: true }
      )
      .select('apiDatasetServer')
      .lean();
    if (!doc) return null;
    return {
      apiDatasetServer: doc.apiDatasetServer
    };
  }

  /**
   * 递增 API 知识库的同步范围版本，并按需同步更新 `syncAll`。
   * 用于在同一 Dataset 文档上将范围变更与 Pro 自动建档串行化（写冲突由事务层重试）。
   */
  async updateSyncScope({
    teamId,
    datasetId,
    syncAll,
    tx
  }: {
    teamId: string;
    datasetId: string;
    syncAll?: boolean;
    tx?: DbSession;
  }): Promise<void> {
    await this.model.updateOne(
      { _id: datasetId, teamId },
      {
        ...(syncAll !== undefined ? { $set: { syncAll } } : {}),
        $inc: { syncScopeVersion: 1 }
      },
      this.txOpts(tx)
    );
  }

  /** 读取清理历史 SYSTEM_ROOT 哨兵所需的知识库元信息。 */
  async findLegacySystemRootMetaById({
    datasetId,
    tx
  }: {
    datasetId: string;
    tx?: DbSession;
  }): Promise<DatasetLegacySystemRootMetaDTO | null> {
    const doc = await this.model
      .findById(this.oid(datasetId), '_id teamId collectionPermissionEnabled', this.txOpts(tx))
      .lean();
    if (!doc) return null;
    return {
      _id: String(doc._id),
      teamId: String(doc.teamId),
      collectionPermissionEnabled: doc.collectionPermissionEnabled
    };
  }

  /** 回填历史知识库的 `syncAll = true`。 */
  async markSyncAllEnabled({
    datasetId,
    tx
  }: {
    datasetId: string;
    tx?: DbSession;
  }): Promise<void> {
    await this.model.updateOne(
      { _id: this.oid(datasetId) },
      { $set: { syncAll: true } },
      this.txOpts(tx)
    );
  }
}

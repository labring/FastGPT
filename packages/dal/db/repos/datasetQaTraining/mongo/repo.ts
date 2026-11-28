import { createEntityId, isValidEntityId } from '@fastgpt/global/common/string/entityId';
import type { Types } from 'mongoose';
import { MongoRepositoryBase } from '../../../mongo/base';
import type { DbRuntime } from '../../../runtime';
import type { DbSession } from '../../../types';
import {
  CreateDatasetQaTrainingWriteSchema,
  DatasetQaTrainingDomainReadSchema,
  type CreateDatasetQaTrainingWriteInput,
  type DatasetQaTrainingCounts,
  type DatasetQaTrainingDeleteScope,
  type DatasetQaTrainingDomainDTO,
  type DatasetQaTrainingRepository,
  type DatasetQaTrainingScope,
  type DatasetQaTrainingStatus
} from '../repo.type';
import { datasetQaTrainingMongoCollection, type DatasetQaTrainingMongoDoc } from './schema';

/** DatasetQaTraining 仓储的 MongoDB 策略实现（Phase 1A Mongo-first）。 */
export class MongoDatasetQaTrainingRepository
  extends MongoRepositoryBase<DatasetQaTrainingMongoDoc, typeof DatasetQaTrainingDomainReadSchema>
  implements DatasetQaTrainingRepository
{
  constructor(runtime?: DbRuntime) {
    super({
      collection: datasetQaTrainingMongoCollection,
      readSchema: DatasetQaTrainingDomainReadSchema,
      runtime
    });
  }

  private buildFilter(params: {
    id?: string;
    teamId?: string;
    datasetId?: string;
    datasetIds?: readonly string[];
    collectionId?: string;
    collectionIds?: readonly string[];
    status?: DatasetQaTrainingStatus;
  }): Record<string, unknown> | null {
    const filter: Record<string, unknown> = {};

    if (params.id !== undefined) {
      if (!isValidEntityId(params.id)) return null;
      filter._id = this.oid(params.id);
    }
    if (params.teamId !== undefined) {
      if (!isValidEntityId(params.teamId)) return null;
      filter.teamId = this.oid(params.teamId);
    }
    if (params.datasetId !== undefined) {
      if (!isValidEntityId(params.datasetId)) return null;
      filter.datasetId = this.oid(params.datasetId);
    } else if (params.datasetIds !== undefined) {
      const validIds = params.datasetIds.filter(isValidEntityId);
      if (validIds.length === 0) return null;
      filter.datasetId = { $in: this.oids(validIds) };
    }
    if (params.collectionId !== undefined) {
      if (!isValidEntityId(params.collectionId)) return null;
      filter.collectionId = this.oid(params.collectionId);
    } else if (params.collectionIds !== undefined) {
      const validIds = params.collectionIds.filter(isValidEntityId);
      if (validIds.length === 0) return null;
      filter.collectionId = { $in: this.oids(validIds) };
    }
    if (params.status !== undefined) {
      filter.status = params.status;
    }

    return filter;
  }

  async findById({
    id,
    scope,
    tx
  }: {
    id: string;
    scope?: Partial<DatasetQaTrainingScope>;
    tx?: DbSession;
  }): Promise<DatasetQaTrainingDomainDTO | null> {
    const filter = this.buildFilter({
      id,
      teamId: scope?.teamId,
      datasetId: scope?.datasetId,
      collectionId: scope?.collectionId
    });
    if (!filter) return null;

    const doc = await this.model.findOne(filter, undefined, this.txOpts(tx)).lean();
    return this.parseNullable(doc);
  }

  async findOneEditable({
    teamId,
    datasetId,
    collectionId,
    taskId,
    includeActive = false,
    tx
  }: {
    teamId: string;
    datasetId: string;
    collectionId: string;
    taskId: string;
    includeActive?: boolean;
    tx?: DbSession;
  }): Promise<DatasetQaTrainingDomainDTO | null> {
    const filter = this.buildFilter({
      id: taskId,
      teamId,
      datasetId,
      collectionId,
      ...(includeActive ? {} : { status: 'error' })
    });
    if (!filter) return null;

    const doc = await this.model.findOne(filter, undefined, this.txOpts(tx)).lean();
    return this.parseNullable(doc);
  }

  async list({
    teamId,
    datasetId,
    collectionId,
    status,
    sort = 'chunkOrder',
    limit,
    tx
  }: {
    teamId?: string;
    datasetId?: string;
    collectionId?: string;
    status?: DatasetQaTrainingStatus;
    sort?: 'chunkOrder' | 'idAsc';
    limit?: number;
    tx?: DbSession;
  }): Promise<DatasetQaTrainingDomainDTO[]> {
    const filter = this.buildFilter({ teamId, datasetId, collectionId, status });
    if (!filter) return [];

    const session = this.txOpts(tx).session;
    const query = this.model
      .find(filter)
      .sort(sort === 'idAsc' ? { _id: 1 } : { chunkIndex: 1, _id: 1 });
    if (limit !== undefined) {
      query.limit(limit);
    }
    if (session !== undefined) {
      query.session(session);
    } else {
      query.read('primary');
    }

    const docs = await query.lean();
    return this.parseList(docs);
  }

  async exists({
    id,
    teamId,
    datasetId,
    collectionId,
    collectionIds,
    status,
    tx
  }: {
    id?: string;
    teamId?: string;
    datasetId?: string;
    collectionId?: string;
    collectionIds?: readonly string[];
    status?: DatasetQaTrainingStatus;
    tx?: DbSession;
  }): Promise<boolean> {
    const filter = this.buildFilter({
      id,
      teamId,
      datasetId,
      collectionId,
      collectionIds,
      status
    });
    if (!filter) return false;

    const session = this.txOpts(tx).session;
    const query = this.model.exists(filter);
    if (session !== undefined) {
      query.session(session);
    } else {
      query.read('primary');
    }

    return Boolean(await query);
  }

  async count({
    teamId,
    datasetId,
    collectionId,
    status,
    tx
  }: {
    teamId?: string;
    datasetId?: string;
    collectionId?: string;
    status?: DatasetQaTrainingStatus;
    tx?: DbSession;
  }): Promise<number> {
    const filter = this.buildFilter({ teamId, datasetId, collectionId, status });
    if (!filter) return 0;

    const session = this.txOpts(tx).session;
    const query = this.model.countDocuments(filter);
    if (session !== undefined) {
      query.session(session);
    }
    return query;
  }

  async countByCollections({
    teamId,
    datasetId,
    collectionIds,
    useReadReplica = false,
    tx
  }: {
    teamId: string;
    datasetId: string;
    collectionIds: readonly string[];
    useReadReplica?: boolean;
    tx?: DbSession;
  }): Promise<DatasetQaTrainingCounts[]> {
    if (!isValidEntityId(teamId) || !isValidEntityId(datasetId)) {
      return [];
    }
    const validCollectionIds = collectionIds.filter(isValidEntityId);
    if (validCollectionIds.length === 0) {
      return [];
    }

    const rows = await this.model.aggregate<{
      _id: Types.ObjectId;
      activeCount: number;
      finalErrorCount: number;
    }>(
      [
        {
          $match: {
            teamId: this.oid(teamId),
            datasetId: this.oid(datasetId),
            collectionId: { $in: this.oids(validCollectionIds) }
          }
        },
        {
          $group: {
            _id: '$collectionId',
            activeCount: { $sum: { $cond: [{ $eq: ['$status', 'active'] }, 1, 0] } },
            finalErrorCount: { $sum: { $cond: [{ $eq: ['$status', 'error'] }, 1, 0] } }
          }
        }
      ],
      this.readOpts({ tx, useReadReplica })
    );

    return rows.map((row) => ({
      _id: String(row._id),
      activeCount: row.activeCount,
      finalErrorCount: row.finalErrorCount
    }));
  }

  async createMany({
    items,
    tx
  }: {
    items: readonly CreateDatasetQaTrainingWriteInput[];
    tx?: DbSession;
  }): Promise<DatasetQaTrainingDomainDTO[]> {
    if (items.length === 0) return [];

    const docsToInsert = items.map((item) => {
      const parsed = CreateDatasetQaTrainingWriteSchema.parse(item);
      return {
        _id: this.oid(parsed._id ?? createEntityId()),
        teamId: this.oid(parsed.teamId),
        tmbId: this.oid(parsed.tmbId),
        datasetId: this.oid(parsed.datasetId),
        collectionId: this.oid(parsed.collectionId),
        q: parsed.q ?? '',
        chunkIndex: parsed.chunkIndex ?? 0,
        ...(parsed.dataMetadata !== undefined && { dataMetadata: parsed.dataMetadata }),
        status: parsed.status ?? 'active',
        ...(parsed.errorMsg !== undefined && { errorMsg: parsed.errorMsg })
      };
    });

    const inserted = await this.model.insertMany(docsToInsert, {
      ...this.txOpts(tx),
      ordered: true
    });

    return this.parseList(inserted.map((doc) => doc.toObject()));
  }

  async markFailed({
    teamId,
    datasetId,
    collectionId,
    id,
    errorMsg,
    tx
  }: {
    teamId: string;
    datasetId: string;
    collectionId: string;
    id: string;
    errorMsg: string;
    tx?: DbSession;
  }): Promise<boolean> {
    const filter = this.buildFilter({
      id,
      teamId,
      datasetId,
      collectionId,
      status: 'active'
    });
    if (!filter) return false;

    const { matchedCount } = await this.model.updateOne(
      filter,
      { $set: { status: 'error', errorMsg } },
      this.txOpts(tx)
    );
    return matchedCount > 0;
  }

  async retryMany({
    teamId,
    datasetId,
    collectionId,
    taskId,
    includeActive = false,
    edit,
    tx
  }: {
    teamId: string;
    datasetId: string;
    collectionId: string;
    taskId?: string;
    includeActive?: boolean;
    edit?: { q?: string; chunkIndex?: number };
    tx?: DbSession;
  }): Promise<number> {
    const filter = this.buildFilter({
      id: taskId,
      teamId,
      datasetId,
      collectionId,
      ...(includeActive ? {} : { status: 'error' })
    });
    if (!filter) return 0;

    const res = await this.model.updateMany(
      filter,
      {
        $set: {
          status: 'active',
          ...(edit?.q !== undefined && { q: edit.q }),
          ...(edit?.chunkIndex !== undefined && { chunkIndex: edit.chunkIndex })
        },
        $unset: { errorMsg: '' }
      },
      this.txOpts(tx)
    );
    return res.matchedCount ?? 0;
  }

  async deleteOne({
    id,
    teamId,
    datasetId,
    collectionId,
    status,
    tx
  }: {
    id: string;
    teamId?: string;
    datasetId?: string;
    collectionId?: string;
    status?: DatasetQaTrainingStatus;
    tx?: DbSession;
  }): Promise<number> {
    const filter = this.buildFilter({ id, teamId, datasetId, collectionId, status });
    if (!filter) return 0;

    const res = await this.model.deleteOne(filter, this.txOpts(tx));
    return res.deletedCount ?? 0;
  }

  async deleteMany({
    teamId,
    datasetId,
    datasetIds,
    collectionId,
    collectionIds,
    tx
  }: DatasetQaTrainingDeleteScope & { tx?: DbSession }): Promise<number> {
    const filter = this.buildFilter({
      teamId,
      datasetId,
      datasetIds,
      collectionId,
      collectionIds
    });
    if (!filter || Object.keys(filter).length === 0) return 0;

    const res = await this.model.deleteMany(filter, this.txOpts(tx));
    return res.deletedCount ?? 0;
  }
}

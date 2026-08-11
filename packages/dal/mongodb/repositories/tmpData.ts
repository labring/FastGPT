import mongoose, { type Model, type Mongoose, type Query } from 'mongoose';
import type { DatabaseErrorAdapter } from '../../db';
import type { ActiveTmpDataFilter, TmpDataMaterial } from '../../domain/tmpData';
import type { TmpDataRepository } from '../../ports/tmpData.repository';
import type { TransactionContext } from '../../transaction';
import { MongoErrorAdapter } from '../errors';
import {
  getTmpDataModel,
  type TmpDataDocument,
  type TmpDataMongooseSchemaType
} from '../models/tmpData';
import { getMongoSession } from '../transaction';

/** 将材料匹配字段映射为 `data.<field>` 查询条件，语义与旧 verification 模块一致。 */
const getDataMatch = (match?: Record<string, unknown>) =>
  Object.fromEntries(Object.entries(match ?? {}).map(([field, value]) => [`data.${field}`, value]));

const getActiveFilter = (filter: ActiveTmpDataFilter) => ({
  dataId: filter.dataId,
  expireAt: { $gt: new Date() },
  ...getDataMatch(filter.match)
});

export class MongoTmpDataRepository implements TmpDataRepository {
  constructor(
    private readonly model: Model<TmpDataMongooseSchemaType> = getTmpDataModel(mongoose),
    private readonly errorAdapter: DatabaseErrorAdapter = new MongoErrorAdapter()
  ) {}

  private execute<T>(handler: () => Promise<T>) {
    return this.errorAdapter.execute(handler);
  }

  private withSession<T>(query: Query<T, TmpDataMongooseSchemaType>, context?: TransactionContext) {
    const session = getMongoSession(context);
    return session ? query.session(session) : query;
  }

  async findActiveMaterial(
    filter: ActiveTmpDataFilter,
    context?: TransactionContext
  ): Promise<TmpDataMaterial | null> {
    return this.execute(async () => {
      const document = await this.withSession(
        this.model.findOne(getActiveFilter(filter)),
        context
      ).lean<TmpDataDocument>();
      return document
        ? {
            dataId: document.dataId,
            data: document.data,
            expireAt: document.expireAt
          }
        : null;
    });
  }

  async deleteActiveMaterial(
    filter: ActiveTmpDataFilter,
    context?: TransactionContext
  ): Promise<boolean> {
    return this.execute(async () => {
      const query = this.model.deleteOne(getActiveFilter(filter));
      const result = await this.withSession(query, context);
      return result.deletedCount === 1;
    });
  }
}

export const createMongoTmpDataRepository = (
  client: Mongoose,
  errorAdapter: DatabaseErrorAdapter = new MongoErrorAdapter()
) => new MongoTmpDataRepository(getTmpDataModel(client), errorAdapter);

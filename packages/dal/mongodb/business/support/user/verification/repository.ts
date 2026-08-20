import mongoose, { type Model, type Mongoose, type Query } from 'mongoose';
import type { DatabaseErrorAdapter } from '../../../../../db';
import type { ActiveTmpDataFilter } from '../../../../../business/support/user/verification/dto';
import type {
  TmpDataMaterial,
  TmpDataWrite
} from '../../../../../business/support/user/verification/entity';
import type { TmpDataRepository } from '../../../../../business/support/user/verification/repository';
import type { TransactionContext } from '../../../../../db/transaction';
import { MongoErrorAdapter } from '../../../../errors';
import { getTmpDataModel, type TmpDataDocument, type TmpDataMongooseSchemaType } from './schema';
import { getMongoSession } from '../../../../transaction';
import { toTmpDataMaterial } from './entity';

/** 将材料匹配字段映射为 `data.<field>` 查询条件，语义与旧 verification 模块一致。 */
const getDataMatch = (match?: Record<string, unknown>) =>
  Object.fromEntries(Object.entries(match ?? {}).map(([field, value]) => [`data.${field}`, value]));

const getActiveFilter = (filter: ActiveTmpDataFilter) => ({
  dataId: filter.dataId,
  expireAt: { $gt: new Date() },
  ...getDataMatch(filter.match)
});

const isDuplicateKeyError = (error: unknown) =>
  !!error && typeof error === 'object' && 'code' in error && error.code === 11000;

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

  async findByDataId(
    dataId: string,
    context?: TransactionContext
  ): Promise<TmpDataMaterial | null> {
    return this.execute(async () => {
      const document = await this.withSession(
        this.model.findOne({ dataId }),
        context
      ).lean<TmpDataDocument>();
      return document ? toTmpDataMaterial(document) : null;
    });
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
      return document ? toTmpDataMaterial(document) : null;
    });
  }

  async createIfInactive(input: TmpDataWrite, context?: TransactionContext): Promise<boolean> {
    return this.execute(async () => {
      const session = getMongoSession(context);
      const options = session ? { session } : undefined;
      await this.model.deleteOne({ dataId: input.dataId, expireAt: { $lte: new Date() } }, options);

      try {
        await this.model.create([input], options);
        return true;
      } catch (error) {
        if (isDuplicateKeyError(error)) return false;
        throw error;
      }
    });
  }

  async upsert(input: TmpDataWrite, context?: TransactionContext): Promise<void> {
    await this.execute(async () => {
      const query = this.model.updateOne(
        { dataId: input.dataId },
        { $set: { data: input.data, expireAt: input.expireAt } },
        { upsert: true }
      );
      await this.withSession(query, context);
    });
  }

  async updateIfActive(input: TmpDataWrite, context?: TransactionContext): Promise<boolean> {
    return this.execute(async () => {
      const query = this.model.updateOne(
        { dataId: input.dataId, expireAt: { $gt: new Date() } },
        { $set: { data: input.data, expireAt: input.expireAt } }
      );
      const result = await this.withSession(query, context);
      return result.modifiedCount === 1;
    });
  }

  async findActiveDataIds(
    dataIds: readonly string[],
    context?: TransactionContext
  ): Promise<string[]> {
    if (dataIds.length === 0) return [];
    return this.execute(async () => {
      const documents = await this.withSession(
        this.model
          .find({ dataId: { $in: [...new Set(dataIds)] }, expireAt: { $gt: new Date() } })
          .select({ dataId: 1 })
          .limit(2),
        context
      ).lean<Array<{ dataId: string }>>();
      return documents.map((document) => document.dataId);
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
) => {
  const model = getTmpDataModel(client);
  return new MongoTmpDataRepository(model, errorAdapter);
};

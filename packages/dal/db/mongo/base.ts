import { Types, type ClientSession, type Model } from 'mongoose';
import type z from 'zod';
import { DbConfigurationError } from '../errors';
import { parseRepoRow, parseRepoRows } from '../parse';
import { getDbRuntime, type DbRuntime } from '../runtime';
import { unwrapNativeDbSession } from '../transaction';
import type { DbDatasource, DbSession, DbTransactionRunner } from '../types';
import type { MongoCollectionDefinition } from './collection';

export type MongoSessionStarter = {
  startSession: () => Promise<ClientSession>;
};

/** 解包绑定在 `DbSession` 上的原生 Mongoose `ClientSession`（仅限 Mongo 仓储内部调用）。 */
export const unwrapMongoSession = (
  tx?: DbSession,
  datasource?: DbDatasource
): ClientSession | undefined =>
  unwrapNativeDbSession<ClientSession>(tx, {
    dialect: 'mongo',
    ...(datasource !== undefined ? { datasource } : {})
  });

/**
 * 构建基于 Mongoose 连接的 `DbTransactionRunner`，供应用启动入口注入 `configureDbRuntime`。
 */
export const createMongoTransactionRunner = ({
  getMainClient,
  getLogClient
}: {
  getMainClient: () => MongoSessionStarter;
  getLogClient?: () => MongoSessionStarter | undefined;
}): DbTransactionRunner => {
  return async ({ datasource, timeoutMs, execute }) => {
    const client = datasource === 'main' ? getMainClient() : getLogClient?.();
    if (client === undefined) {
      throw new DbConfigurationError('Separate log Mongo client is not configured');
    }

    const session = await client.startSession();
    try {
      let txResult!: Awaited<ReturnType<typeof execute>>;
      await session.withTransaction(
        async () => {
          txResult = await execute(session);
        },
        { maxCommitTimeMS: timeoutMs }
      );
      return txResult;
    } finally {
      await session.endSession();
    }
  };
};

/**
 * MongoDB 领域仓储模板方法抽象基类。
 *
 * 在 `constructor` 内绑定当前 `DbRuntime` 并幂等构出 `readonly model`，统一封装 `ObjectId` 转换、
 * 事务会话解包、只读副本路由选项（`readOpts`）与出口 Zod 归一化解析。
 */
export abstract class MongoRepositoryBase<
  TDoc = Record<string, unknown>,
  TReadSchema extends z.ZodTypeAny = z.ZodTypeAny
> {
  protected readonly runtime: DbRuntime;
  protected readonly model: Model<TDoc>;
  protected readonly tableName: string;
  protected readonly readSchema: TReadSchema;
  protected readonly datasource: DbDatasource;

  constructor({
    collection,
    readSchema,
    runtime
  }: {
    collection: MongoCollectionDefinition<TDoc>;
    readSchema: TReadSchema;
    runtime?: DbRuntime;
  }) {
    const activeRuntime = runtime ?? getDbRuntime();
    this.runtime = activeRuntime;
    this.tableName = collection.name;
    this.readSchema = readSchema;
    this.datasource = collection.datasource;
    this.model = activeRuntime.bindMongoModel<TDoc, Model<TDoc>>(collection);
  }

  protected oid(id: string): Types.ObjectId {
    return new Types.ObjectId(id);
  }

  protected oids(ids: readonly string[]): Types.ObjectId[] {
    return ids.map((id) => new Types.ObjectId(id));
  }

  protected txOpts(tx?: DbSession): { session?: ClientSession } {
    const session = unwrapMongoSession(tx, this.datasource);
    return session !== undefined ? { session } : {};
  }

  /**
   * 构造只读查询选项：
   * - 活跃事务内强制透传 `session` 且忽略 `useReadReplica`，保证读己之写；
   * - 非事务且开启 `useReadReplica` 时附带 `readPreference: 'secondaryPreferred'`。
   */
  protected readOpts({
    tx,
    useReadReplica = false
  }: {
    tx?: DbSession;
    useReadReplica?: boolean;
  } = {}): { session?: ClientSession; readPreference?: 'secondaryPreferred' } {
    const session = unwrapMongoSession(tx, this.datasource);
    if (session !== undefined) {
      return { session };
    }
    return useReadReplica ? { readPreference: 'secondaryPreferred' } : {};
  }

  protected parseRow<TSchema extends z.ZodTypeAny = TReadSchema>(
    doc: unknown,
    customSchema?: TSchema
  ): z.output<TSchema> {
    return parseRepoRow({
      table: this.tableName,
      schema: (customSchema ?? this.readSchema) as TSchema,
      row: doc,
      logger: this.runtime.getLogger()
    });
  }

  protected parseNullable<TSchema extends z.ZodTypeAny = TReadSchema>(
    doc: unknown,
    customSchema?: TSchema
  ): z.output<TSchema> | null {
    if (doc === null || doc === undefined) {
      return null;
    }
    return this.parseRow(doc, customSchema);
  }

  protected parseList<TSchema extends z.ZodTypeAny = TReadSchema>(
    rows: readonly unknown[],
    customSchema?: TSchema
  ): z.output<TSchema>[] {
    return parseRepoRows({
      table: this.tableName,
      schema: (customSchema ?? this.readSchema) as TSchema,
      rows,
      logger: this.runtime.getLogger()
    });
  }
}

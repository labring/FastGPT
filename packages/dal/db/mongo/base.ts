import { Types, type ClientSession } from 'mongoose';
import type z from 'zod';
import { DbLogDatasourceNotConfiguredError } from '../errors';
import { parseRepoRow, parseRepoRows } from '../parse';
import { getDbLogger } from '../runtime';
import { unwrapNativeDbSession } from '../transaction';
import type { DbSession, DbTransactionRunner } from '../types';

export type MongoSessionStarter = {
  startSession: () => Promise<ClientSession>;
};

/** 解包绑定在 `DbSession` 上的原生 Mongoose `ClientSession`（仅限 Mongo 仓储内部调用）。 */
export const unwrapMongoSession = (tx?: DbSession): ClientSession | undefined =>
  unwrapNativeDbSession<ClientSession>(tx, { family: 'mongo', dialect: 'mongo' });

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
      throw new DbLogDatasourceNotConfiguredError();
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
 * 统一封装 `ObjectId` 转换、事务会话解包与出口 Zod 归一化解析（单行 Fail-Fast、列表 Warn & Skip），
 * 子类只需聚焦集合查询与更新语义。
 */
export abstract class MongoRepositoryBase<TReadSchema extends z.ZodTypeAny> {
  protected abstract readonly tableName: string;
  protected abstract readonly readSchema: TReadSchema;

  protected oid(id: string): Types.ObjectId {
    return new Types.ObjectId(id);
  }

  protected oids(ids: readonly string[]): Types.ObjectId[] {
    return ids.map((id) => new Types.ObjectId(id));
  }

  protected txOpts(tx?: DbSession): { session?: ClientSession } {
    const session = unwrapMongoSession(tx);
    return session !== undefined ? { session } : {};
  }

  protected parseRow(doc: unknown): z.output<TReadSchema> {
    return parseRepoRow({
      table: this.tableName,
      schema: this.readSchema,
      row: doc
    });
  }

  protected parseNullable(doc: unknown): z.output<TReadSchema> | null {
    if (doc === null || doc === undefined) {
      return null;
    }
    return this.parseRow(doc);
  }

  protected parseList<TSchema extends z.ZodTypeAny = TReadSchema>(
    rows: readonly unknown[],
    customSchema?: TSchema
  ): z.output<TSchema>[] {
    return parseRepoRows({
      table: this.tableName,
      schema: (customSchema ?? this.readSchema) as TSchema,
      rows,
      logger: getDbLogger()
    });
  }
}

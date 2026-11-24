import type { Kysely } from 'kysely';
import type z from 'zod';
import { normalizeEntityId } from '@fastgpt/global/common/string/entityId';
import { parseRepoRow, parseRepoRows } from '../parse';
import { getDbRuntime, type DbRuntime } from '../runtime';
import { unwrapNativeDbSession } from '../transaction';
import type { DbDatasource, DbSession } from '../types';

/** 解析当前上下文对应的 OceanBase Kysely 执行器（携带 `tx` 时优先走事务连接）。 */
export const getOceanBaseExecutor = <TDatabase = Record<string, any>>({
  datasource = 'main',
  tx,
  runtime: explicitRuntime
}: {
  datasource?: DbDatasource;
  tx?: DbSession;
  runtime?: DbRuntime;
} = {}): Kysely<TDatabase> => {
  const runtime = explicitRuntime ?? getDbRuntime();
  const nativeTx = unwrapNativeDbSession(tx, { dialect: 'oceanbase', datasource });
  const effectiveDatasource = runtime.resolveEffectiveDatasource(datasource);
  const resolver = runtime.getOceanBaseExecutorResolver();
  return resolver({
    datasource: effectiveDatasource,
    nativeTx
  }) as Kysely<TDatabase>;
};

/**
 * OceanBase（4.3+ / SeekDB，MySQL 兼容模式）领域仓储抽象基类。
 * 与 `MongoRepositoryBase` 对称：在 `constructor` 中绑定 `DbRuntime`，统一封装执行器路由、
 * ID 规范化与出口 Zod 校验（单行 Fail-Fast、列表 Warn & Skip）。
 */
export abstract class OceanBaseRepositoryBase<
  TDatabase extends Record<string, any>,
  TTableName extends keyof TDatabase & string,
  TReadSchema extends z.ZodTypeAny
> {
  protected readonly runtime: DbRuntime;
  protected readonly tableName: TTableName;
  protected readonly readSchema: TReadSchema;
  protected readonly datasource: DbDatasource;

  constructor({
    tableName,
    readSchema,
    datasource = 'main',
    runtime
  }: {
    tableName: TTableName;
    readSchema: TReadSchema;
    datasource?: DbDatasource;
    runtime?: DbRuntime;
  }) {
    this.runtime = runtime ?? getDbRuntime();
    this.tableName = tableName;
    this.readSchema = readSchema;
    this.datasource = datasource;
  }

  protected db(tx?: DbSession): Kysely<TDatabase> {
    return getOceanBaseExecutor<TDatabase>({
      datasource: this.datasource,
      tx,
      runtime: this.runtime
    });
  }

  protected parseRow(row: unknown): z.output<TReadSchema> {
    return parseRepoRow({
      table: this.tableName,
      schema: this.readSchema,
      row,
      logger: this.runtime.getLogger()
    });
  }

  protected parseNullable(row: unknown): z.output<TReadSchema> | null {
    if (row === null || row === undefined) {
      return null;
    }
    return this.parseRow(row);
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

  protected normalizeId(id: string): string {
    return normalizeEntityId(id);
  }

  protected normalizeIds(ids: readonly string[]): string[] {
    return ids.map((id) => normalizeEntityId(id));
  }
}

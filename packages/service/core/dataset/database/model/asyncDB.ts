import { DatabaseTypeEnum } from '@fastgpt/global/core/dataset/constants';
import { DatabaseErrEnum } from '@fastgpt/global/common/error/code/database';
import { addLog } from '../../../../common/system/log';
import type {
  DatabaseConfig,
  TableSchemaType,
  ColumnSchemaType,
  ForeignKeySchemaType
} from '@fastgpt/global/core/dataset/type';
import { truncateText, isStringType, convertValueToString } from './utils';
import type { TableColumn as ORMColumn, ColumnType, DataSourceOptions, Driver } from 'typeorm';
import { DataSource } from 'typeorm';
import pg from 'pg';
delete (pg as any).native;

export abstract class AsyncDB {
  protected db: DataSource;
  protected config: DatabaseConfig;
  protected sample_value_num: number;
  protected sql_result_limit: number;
  protected max_string_length: number;
  protected db_server_info: string;
  protected table_names: Array<string>;

  constructor(
    db: DataSource,
    config: DatabaseConfig,
    sample_value_num: number = 3,
    sql_result_limit: number = 100,
    max_string_length: number = 1024
  ) {
    this.db = db;
    this.config = config;
    this.sample_value_num = sample_value_num;
    this.sql_result_limit = sql_result_limit;
    this.max_string_length = max_string_length;
    this.db_server_info = '';
    this.table_names = new Array<string>();
  }

  static fromConfig(config: DatabaseConfig): AsyncDB {
    throw new Error(DatabaseErrEnum.notImplemented);
  }

  static from_uri(config: DatabaseConfig): DataSource {
    const options: DataSourceOptions = {
      type: config.clientType as any,
      host: config.host,
      port: config.port,
      username: config.user,
      password: config.password,
      database: config.database,
      synchronize: false,
      logging: false,
      poolSize: config.poolSize || 20,
      // PostgreSQL specific: disable native driver to use pure JS implementation
      ...(config.clientType === DatabaseTypeEnum.postgresql && {
        driver: require('pg'),
        nativeDriver: null,
        extra: { native: false },
        ...(config.schema && { schema: config.schema })
      }),
      ...(config.clientType === DatabaseTypeEnum.mssql && {
        pool: {
          max: config.poolSize || 20,
          min: 0,
          idleTimeoutMillis: 30000
        },
        ...(config.schema && { schema: config.schema }),
        options: {
          encrypt: config.encrypt || false,
          trustServerCertificate: config.trustServerCertificate || false
        }
      }),
      // Oracle specific - 使用 database 字段作为 serviceName
      ...(config.clientType === DatabaseTypeEnum.oracle && {
        serviceName: config.database,
        schema: config.schema || (config.user ? config.user.toUpperCase() : ''),
        extra: {
          poolMax: config.poolSize || 20,
          poolMin: 0,
          poolIncrement: 1
        }
      })
    };
    addLog.debug(`[AsyncDB.from_uri]:${JSON.stringify(options, null, 2)}`);
    return new DataSource(options);
  }

  async checkConnection(): Promise<boolean> {
    try {
      if (!this.db.isInitialized) {
        await this.db.initialize();
      }
      await this.db.query('SELECT 1');
      return Promise.resolve(true);
    } catch (err: any) {
      return Promise.reject(err);
    }
  }

  async destroy(): Promise<void> {
    try {
      if (this.db.isInitialized) {
        await this.db.destroy();
      }
      // @ts-ignore
      this.db = null;
    } catch (err: any) {
      return Promise.reject(DatabaseErrEnum.clientDestroyError);
    }
  }

  async dialect(): Promise<string> {
    return new Promise((resolve, reject) => {
      if (!this.db.isInitialized) {
        reject(DatabaseErrEnum.clientNotFound);
        return;
      }
      resolve(this.db.options.type);
    });
  }

  public driver(): Promise<Driver> {
    return new Promise((resolve, reject) => {
      if (!this.db.isInitialized) {
        reject(DatabaseErrEnum.clientNotFound);
        return;
      }
      resolve(this.db.driver);
    });
  }

  async get_db_server_info(): Promise<string> {
    if (!this.db.isInitialized) {
      await this.db.initialize();
    }

    const dbDriver = await this.driver();
    return `${dbDriver.options.type}-${dbDriver.version || 'unknown'}`;
  }

  /*-----------------------Dynamic Introspection Methods-----------------------*/
  abstract get_all_table_names(): Promise<Array<string>>;

  async init_db_schema(): Promise<void> {
    this.db_server_info = await this.get_db_server_info();
    this.table_names = await this.get_all_table_names();
  }

  async get_table_columns(table_name: string): Promise<Array<ColumnSchemaType>> {
    const queryRunner = this.db.createQueryRunner();
    try {
      const table = await queryRunner.getTable(table_name);
      if (!table) return Promise.reject(DatabaseErrEnum.fetchInfoError);

      return table.columns.map((col: ORMColumn) => ({
        columnName: col.name,
        columnType: String(col.type),
        description: col.comment ?? '',
        examples: [],
        forbid: true,
        valueIndex: true,
        isNullable: col.isNullable,
        defaultValue: col.default ?? null,
        isAutoIncrement: col.isGenerated,
        isPrimaryKey: col.isPrimary
      }));
    } finally {
      await queryRunner.release();
    }
  }
  // get protected name for sql query
  protected getProtectedIdentifier(identifier: string): string {
    switch (this.config.clientType) {
      case DatabaseTypeEnum.mysql:
      case DatabaseTypeEnum.sqlite:
        return `\`${identifier}\``;
      case DatabaseTypeEnum.postgresql:
        return `"${identifier}"`;
      case DatabaseTypeEnum.mssql:
        return `[${identifier}]`;
      case DatabaseTypeEnum.oracle:
        return `"${identifier}"`;
      default:
        return identifier;
    }
  }

  /**
   * 构建采样查询 SQL，不同数据库有不同的限制行数语法
   * 子类可以覆写此方法以使用特定数据库的语法
   */
  protected buildSampleQuery(tableName: string, columnName: string, limit: number): string {
    // 默认使用 MySQL/PostgreSQL 的 LIMIT 语法
    return `
      SELECT DISTINCT ${this.getProtectedIdentifier(columnName)}
      FROM ${this.getProtectedIdentifier(tableName)}
      WHERE ${this.getProtectedIdentifier(columnName)} IS NOT NULL
      LIMIT ${limit}
    `;
  }

  async get_table_info(tableName: string, getExamples: boolean = false): Promise<TableSchemaType> {
    if (!this.db.isInitialized) {
      await this.db.initialize();
    }

    const queryRunner = this.db.createQueryRunner();
    // try-finally to ensure the queryRunner is released
    try {
      const table = await queryRunner.getTable(tableName);
      if (!table) return Promise.reject(DatabaseErrEnum.fetchInfoError);

      const tableComment = table.comment ?? '';

      const columns: Record<string, ColumnSchemaType> = {};

      for (const col of table.columns) {
        let examples: string[] = [];
        let valueIndex = false;

        if (getExamples) {
          const sql = this.buildSampleQuery(tableName, col.name, this.sample_value_num);

          try {
            const result = await queryRunner.query(sql);

            for (const row of result) {
              const value = row[col.name];
              if (value !== null && value !== undefined) {
                const strValue = truncateText(convertValueToString(value), this.max_string_length);
                examples.push(strValue);
              }
            }

            if (isStringType(col.type as ColumnType) && examples.length > 0) valueIndex = true;
          } catch (error) {
            addLog.warn(`Failed to get sample data for column ${col.name}:`, { error });
            examples = [];
          }
        }

        columns[col.name] = {
          columnName: col.name,
          columnType: String(col.type),
          description: col.comment || '',
          forbid: false,
          valueIndex,
          examples,
          isNullable: col.isNullable,
          defaultValue: col.default ?? null,
          isAutoIncrement: col.isGenerated,
          isPrimaryKey: col.isPrimary,
          isForeignKey: table.foreignKeys.some((fk) => fk.columnNames.includes(col.name)),
          relatedColumns: table.foreignKeys
            ?.filter((fk) => fk.columnNames.includes(col.name))
            .map((fk) => fk.referencedColumnNames)
            .flat()
        };
      }

      const primaryKeys = table.primaryColumns.map((col) => col.name);
      const foreignKeys: ForeignKeySchemaType[] = table.foreignKeys.flatMap((fk) => {
        return fk.columnNames
          .map((col, idx) => {
            if (fk.referencedColumnNames[idx] && fk.referencedTableName)
              return {
                name: fk.name || '',
                column: col,
                referredSchema:
                  fk.referencedSchema || fk.referencedDatabase || this.config.database,
                referredTable: fk.referencedTableName,
                referredColumns: fk.referencedColumnNames[idx]
              };
          })
          .filter(Boolean) as ForeignKeySchemaType[];
      });

      return {
        tableName,
        description: tableComment,
        columns,
        foreignKeys,
        primaryKeys,
        constraints: [],
        exist: true,
        lastUpdated: new Date()
      };
    } finally {
      await queryRunner.release();
    }
  }
}

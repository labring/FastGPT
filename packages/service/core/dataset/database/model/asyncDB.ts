import { DatabaseTypeEnum } from '@fastgpt/global/core/dataset/constants';
import { DatabaseErrEnum } from '@fastgpt/global/common/error/code/database';
import type { DatabaseConfig } from '@fastgpt/global/core/dataset/type';
import { DBTable, TableColumn, TableForeignKey } from './dataModel';
import { truncateText, isStringType, convertValueToString } from './utils';
import type { TableColumn as ORMColumn, ColumnType, DataSourceOptions, Driver } from 'typeorm';
import { DataSource } from 'typeorm';

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
      logging: false
    };
    console.debug(`[AsyncDB.from_uri]:${Object.values(options)}`);
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

  async get_table_columns(table_name: string): Promise<Array<TableColumn>> {
    const queryRunner = this.db.createQueryRunner();
    try {
      const table = await queryRunner.getTable(table_name);
      if (!table) return Promise.reject(DatabaseErrEnum.fetchInfoError);

      return table.columns.map((col: ORMColumn) => {
        return new TableColumn(col.name, col.type as ColumnType, col.comment ?? '');
      });
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
      default:
        return identifier;
    }
  }

  async get_table_info(tableName: string, getExamples: boolean = false): Promise<DBTable> {
    if (!this.db.isInitialized) {
      await this.db.initialize();
    }

    const queryRunner = this.db.createQueryRunner();
    // try-finally to ensure the queryRunner is released
    try {
      const table = await queryRunner.getTable(tableName);
      if (!table) return Promise.reject(DatabaseErrEnum.fetchInfoError);

      const tableComment = table.comment ?? '';

      const columns = new Map<string, TableColumn>();

      for (const col of table.columns) {
        let examples: string[] = [];
        let valueIndex = false;

        if (getExamples) {
          const sql = `
                    SELECT DISTINCT ${this.getProtectedIdentifier(col.name)}
                    FROM ${this.getProtectedIdentifier(tableName)}
                    WHERE ${this.getProtectedIdentifier(col.name)} IS NOT NULL
                        LIMIT ${this.sample_value_num}
                `;

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
            console.warn(`获取列 ${col.name} 的示例数据失败:`, error);
            examples = [];
          }
        }

        const tableColumn = new TableColumn(
          col.name,
          col.type as ColumnType,
          col.comment || '',
          false,
          valueIndex,
          examples,
          col.isNullable,
          col.default ?? null,
          col.isGenerated,
          col.isPrimary,
          table.foreignKeys.some((fk) => fk.columnNames.includes(col.name)), // isForeignKey
          table.foreignKeys
            ?.filter((fk) => fk.columnNames.includes(col.name))
            .map((fk) => fk.referencedColumnNames)
            .flat() // relatedColumns
        );
        columns.set(col.name, tableColumn);
      }

      const primaryKeys = table.primaryColumns.map((col) => col.name);
      const foreignKeys: TableForeignKey[] = table.foreignKeys.flatMap((fk) => {
        return fk.columnNames.map(
          (col, idx) =>
            new TableForeignKey(
              fk.name || '',
              col,
              fk.referencedSchema || fk.referencedDatabase || this.config.database,
              fk.referencedTableName,
              fk.referencedColumnNames[idx]
            )
        );
      });

      return new DBTable(tableName, tableComment, false, columns, foreignKeys, primaryKeys);
    } finally {
      await queryRunner.release();
    }
  }
}

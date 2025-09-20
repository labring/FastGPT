import {DatabaseType} from '@fastgpt/global/core/dataset/constants';
import { DatabaseErrEnum } from '@fastgpt/global/common/error/code/database';
import type {DatabaseConfig} from '@fastgpt/global/core/dataset/type';
import {DBTable, TableColumn, TableKeyInfo, TableForeignKey, TableIndex, TableConstraint} from './dataModel'
import {truncateText, isStringType, convertValueToString} from "./utils";;
import type {TableColumn as ORMColumn, ColumnType, DataSourceOptions, Driver} from "typeorm";
import {DataSource, Entity} from "typeorm";

export abstract class AsyncDB {
  protected db: DataSource;
  protected config: DatabaseConfig;
  protected sample_value_num: number;
  protected sql_result_limit: number;
  protected max_string_length: number;
  protected db_server_info: string;
  protected table_names: Array<string>

  constructor(
      db: DataSource,
      config: DatabaseConfig,
      sample_value_num: number = 3,
      sql_result_limit: number = 100,
      max_string_length: number = 300
  ) {
      this.db = db;
      this.config = config;
      this.sample_value_num = sample_value_num;
      this.sql_result_limit = sql_result_limit;
      this.max_string_length = max_string_length;
      this.db_server_info = '';
      this.table_names = new Array<string>()
  }

  static fromConfig(config: DatabaseConfig): AsyncDB {
    throw new Error(DatabaseErrEnum.notImplemented)
  }

  static from_uri(config: DatabaseConfig): DataSource {
      const options: DataSourceOptions = {
          type: config.client as any, // 'mysql' | 'postgres' | 'sqlite'
          host: config.host,
          port: config.port,
          username: config.user,
          password: config.password,
          database: config.database,
          synchronize: false,
          logging: false
      };
      console.debug(`[AsyncDB.from_uri]:${Object.values(options)}`)
      return new DataSource(options);
  }

  async checkConnection(): Promise<boolean> {
      try {
          if (!this.db.isInitialized) {
              await this.db.initialize();
          }
          await this.db.query("SELECT 1");
          return Promise.resolve(true);
      } catch (err: any) {
          return Promise.reject(err)
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
          return Promise.reject(DatabaseErrEnum.clientDestroyError)
      }
  }

  async dialect(): Promise<string> {
      return new Promise((resolve, reject) => {
          if (!this.db.isInitialized) {
              reject('client does not Initialized');
              return;
          }
          resolve(this.db.options.type);
      });
  }

  public driver(): Promise<Driver> {
      return new Promise((resolve, reject) => {
          if (!this.db.isInitialized) {
              reject('client does not Initialized');
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
  async introspect_database(): Promise<Map<string, DBTable>> {
      if (!this.db.isInitialized) {
          await this.db.initialize();
      }

      const queryRunner = this.db.createQueryRunner();
      const tables = new Map<string, DBTable>();

      try {
          const tableMetadatas = await queryRunner.getTables(await this.get_all_table_names());
          for (const tableMetadata of tableMetadatas) {
              const tableName = tableMetadata.name;

            
              const columns = new Map<string, TableColumn>();

              for (const column of tableMetadata.columns) {
                  
                  const tableColumn = new TableColumn(
                      column.name,
                      column.type as ColumnType, 
                      column.comment || '',
                      true,
                      true,
                      [] 
                  );

                  // 添加列的详细属性
                  // tableColumn.forbid = !column.isGenerated;

                  columns.set(column.name, tableColumn);
              }

              // 获取主键
              const primaryKeys = tableMetadata.primaryColumns.map(col => col.name);

              // 获取外键
              const foreignKeys: TableForeignKey[] = tableMetadata.foreignKeys.map(fk => {
                  const referencedSchema = fk.referencedTableName.includes('.')
                      ? fk.referencedTableName.split('.')[0]
                      : null;
                  const referencedTable = fk.referencedTableName.includes('.')
                      ? fk.referencedTableName.split('.')[1]
                      : fk.referencedTableName;

                  return new TableForeignKey(
                      fk.columnNames,
                      referencedSchema,
                      referencedTable,
                      fk.referencedColumnNames
                  );
              });

              // 获取索引信息
              const indexes: TableIndex[] = tableMetadata.indices.map(index => {
                  return new TableIndex(
                      index.name || `idx_${tableName}_${index.columnNames.join('_')}`,
                      index.columnNames,
                      index.isUnique,
                      false, // 主键索引单独处理
                      'btree' // 默认类型
                  );
              });

              // 添加主键索引
              if (primaryKeys.length > 0) {
                  indexes.push(new TableIndex(
                      `pk_${tableName}`,
                      primaryKeys,
                      true,
                      true,
                      'btree'
                  ));
              }

              // 获取约束信息
              const constraints: TableConstraint[] = [];

              // 添加主键约束
              if (primaryKeys.length > 0) {
                  constraints.push(new TableConstraint(
                      `pk_${tableName}`,
                      'primary_key',
                      primaryKeys
                  ));
              }

              // 添加外键约束
              foreignKeys.forEach(fk => {
                  constraints.push(new TableConstraint(
                      `fk_${tableName}_${fk.constrained_columns.join('_')}`,
                      'foreign_key',
                      fk.constrained_columns
                  ));
              });

              // 添加唯一约束
              tableMetadata.uniques.forEach(unique => {
                  constraints.push(new TableConstraint(
                      unique.name || `uk_${tableName}_${unique.columnNames.join('_')}`,
                      'unique',
                      unique.columnNames
                  ));
              });

              // 创建表对象
              const dbTable = new DBTable(
                  tableName,
                  tableMetadata.comment || '',
                  false,
                  columns,
                  foreignKeys,
                  primaryKeys,
                  indexes,
                  constraints
              );

              tables.set(tableName, dbTable);
          }

          return tables;

      } finally {
          await queryRunner.release();
      }
  }

  async get_database_statistics(): Promise<any> {
      if (!this.db.isInitialized) {
          await this.db.initialize();
      }

      const queryRunner = this.db.createQueryRunner();

      try {
          const stats: any = {
              tableCount: 0,
              totalColumns: 0,
              foreignKeyCount: 0,
              indexCount: 0,
              tableStats: []
          };

          const tables = await this.introspect_database();
          stats.tableCount = tables.size;

          for (const tableName of tables.keys()) {
              const table = tables.get(tableName)!;
              stats.totalColumns += table.columns.size;
              stats.foreignKeyCount += table.foreign_keys.length;

              try {
                  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(tableName)) {
                      await Promise.reject(DatabaseErrEnum.invalidTableName);
                  }
                  const countResult = await queryRunner.query(
                      `SELECT COUNT(*) as count
                       FROM ${this.getProtectedTableName(tableName)}`
                  );
                  const rowCount = countResult[0]?.count || 0;

                  stats.tableStats.push({
                      tableName,
                      columnCount: table.columns.size,
                      rowCount: parseInt(rowCount),
                      foreignKeyCount: table.foreign_keys.length,
                      primaryKeyCount: table.primary_keys.length
                  });
              } catch (error) {
                  console.warn(`无法获取表 ${tableName} 的行数:`, error);
              }
          }

          return stats;

      } finally {
          await queryRunner.release();
      }
  }


  async get_all_table_names(): Promise<Array<string>> {
    if (!this.db.isInitialized) {
        console.log('Initializing database connection...');
        await this.db.initialize();
        console.log('Database connection initialized');
    }
    const queryRunner = this.db.createQueryRunner();
    try {
        // 获取当前数据库名
        const dbName = this.db.options.database;

        // 查询所有表名
        const tables: { TABLE_NAME: string }[] = await queryRunner.query(
            `SELECT TABLE_NAME
             FROM information_schema.tables
             WHERE table_schema = ?
               AND TABLE_TYPE = 'BASE TABLE'`,
            [dbName]
        );

        return tables.map(t => t.TABLE_NAME);
    } finally {
        await queryRunner.release();
    }
}

  async init_db_schema(): Promise<void> {
      this.db_server_info = await this.get_db_server_info()
      this.table_names = await this.get_all_table_names()
  }

  async get_table_columns(table_name: string): Promise<Array<TableColumn>> {
      const queryRunner = this.db.createQueryRunner();
      try {
          const table = await queryRunner.getTable(table_name);
          if (!table) throw new Error(`Table ${table_name} not found`);

          return table.columns.map((col: ORMColumn) => {
              return new TableColumn(
                  col.name,
                  col.type as ColumnType, // 直接使用TypeORM的原生类型
                  col.comment ?? ""
              );
          });
      } finally {
          await queryRunner.release();
      }
  }


  protected getProtectedTableName(tableName: string): string {
      switch (this.config.client) {
          case DatabaseType.mysql:
          case DatabaseType.sqlite:
              return `\`${tableName}\``;
          case DatabaseType.postgresql:
              return `"${tableName}"`;
          default:
              return tableName;
      }
  }


  protected getProtectedColName(columnName: string): string {
      switch (this.config.client) {
          case DatabaseType.mysql:
          case DatabaseType.sqlite:
              return `\`${columnName}\``;
          case DatabaseType.postgresql:
              return `"${columnName}"`;
          default:
              return columnName;
      }
  }


  async get_table_info(tableName: string, getExamples: boolean = false): Promise<DBTable> {
      if (!this.db.isInitialized) {
          await this.db.initialize();
      }

      const queryRunner = this.db.createQueryRunner();

      try {
          const table = await queryRunner.getTable(tableName);
          if (!table) return Promise.reject(DatabaseErrEnum.fetchInfoError);

          const tableComment = table.comment ?? "";

          const columns = new Map<string, TableColumn>();

          for (const col of table.columns) {
              let examples: string[] = [];
              let valueIndex = false;

              if (getExamples) {
                  const sql = `
                      SELECT DISTINCT ${this.getProtectedColName(col.name)}
                      FROM ${this.getProtectedTableName(tableName)}
                      WHERE ${this.getProtectedColName(col.name)} IS NOT NULL
                          LIMIT ${this.sample_value_num + 1}
                  `;

                  try {
                      const result = await queryRunner.query(sql);

                      const rawExamples: any[] = [];

                      for (const row of result) {
                          const value = row[col.name];
                          if (value !== null && value !== undefined) {
                              const strValue = truncateText(
                                  convertValueToString(value),
                                  this.max_string_length
                              );
                              rawExamples.push(strValue);
                          }
                      }

                      if (isStringType(col.type as ColumnType) && rawExamples.length > 0) valueIndex = true;
                      examples = rawExamples.slice(0, this.sample_value_num);

                  } catch (error) {
                      console.warn(`获取列 ${col.name} 的示例数据失败:`, error);
                      examples = [];
                  }
              }

              const tableColumn = new TableColumn(
                  col.name,
                  col.type as ColumnType,
                  col.comment || "",
                  false,
                  valueIndex,
                  examples
              );

              columns.set(col.name, tableColumn);
          }

          const primaryKeys = table.primaryColumns.map(col => col.name);

          const foreignKeys: TableForeignKey[] = table.foreignKeys.map(fk => {
              return new TableForeignKey(
                  fk.columnNames,
                  fk.referencedTableName.includes(".") ? fk.referencedTableName.split(".")[0] : null,
                  fk.referencedTableName.includes(".") ? fk.referencedTableName.split(".")[1] : fk.referencedTableName,
                  fk.referencedColumnNames
              );
          });

          return new DBTable(
              tableName,
              tableComment,
              false,
              columns,
              foreignKeys,
              primaryKeys,
              [], // indexes
              []  // constraints
          );

      } finally {
          await queryRunner.release();
      }
  }

  async aget_table_info(tableName: string, getExamples: boolean = false): Promise<DBTable> {
      return this.get_table_info(tableName, getExamples);
  }


}

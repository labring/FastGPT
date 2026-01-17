import type {
  DatabaseConfig,
  TableSchemaType,
  ColumnSchemaType,
  ForeignKeySchemaType
} from '@fastgpt/global/core/dataset/type';
import { AsyncDB } from './asyncDB';
import { DatabaseErrEnum } from '@fastgpt/global/common/error/code/database';
import { addLog } from '../../../../common/system/log';
import { truncateText, convertValueToString } from './utils';

export class MssqlClient extends AsyncDB {
  /**
   * MSSQL 使用 TOP 语法而非 LIMIT
   */
  protected override buildSampleQuery(
    tableName: string,
    columnName: string,
    limit: number
  ): string {
    return `
      SELECT DISTINCT TOP ${limit} ${this.getProtectedIdentifier(columnName)}
      FROM ${this.getProtectedIdentifier(tableName)}
      WHERE ${this.getProtectedIdentifier(columnName)} IS NOT NULL
    `;
  }

  override async get_all_table_names(): Promise<Array<string>> {
    if (!this.db.isInitialized) {
      await this.db.initialize();
    }

    const queryRunner = this.db.createQueryRunner();

    try {
      const dbName = this.db.options.database;
      const schema = this.config.schema || 'dbo';

      const tables: { TABLE_NAME: string }[] = await queryRunner.query(
        `SELECT TABLE_NAME
         FROM INFORMATION_SCHEMA.TABLES
         WHERE TABLE_CATALOG = @0
           AND TABLE_SCHEMA = @1
           AND TABLE_TYPE = 'BASE TABLE'
         ORDER BY TABLE_NAME`,
        [dbName, schema]
      );

      return tables.map((t) => t.TABLE_NAME);
    } finally {
      await queryRunner.release();
    }
  }

  /**
   * 获取表详细信息，包括列和描述
   * MSSQL 使用 sys.extended_properties 获取表和列的描述信息
   */
  override async get_table_info(
    tableName: string,
    getExamples: boolean = false
  ): Promise<TableSchemaType> {
    if (!this.db.isInitialized) {
      await this.db.initialize();
    }

    const queryRunner = this.db.createQueryRunner();
    const schema = this.config.schema || 'dbo';

    try {
      // 1. 合并查询：表描述、列信息、列描述和主键信息（优化为单次查询）
      const columnsResult: {
        table_description: string | null;
        column_name: string;
        data_type: string;
        is_nullable: boolean;
        column_default: string | null;
        is_identity: boolean;
        column_description: string | null;
        is_primary_key: boolean;
      }[] = await queryRunner.query(
        `SELECT
           CAST(tep.value AS NVARCHAR(MAX)) AS table_description,
           c.name AS column_name,
           TYPE_NAME(c.user_type_id) AS data_type,
           c.is_nullable,
           dc.definition AS column_default,
           c.is_identity,
           CAST(cep.value AS NVARCHAR(MAX)) AS column_description,
           CASE WHEN pk.column_id IS NOT NULL THEN 1 ELSE 0 END AS is_primary_key
         FROM sys.tables t
         INNER JOIN sys.columns c ON c.object_id = t.object_id
         LEFT JOIN sys.default_constraints dc ON c.default_object_id = dc.object_id
         LEFT JOIN sys.extended_properties tep
           ON tep.major_id = t.object_id
           AND tep.minor_id = 0
           AND tep.name = 'MS_Description'
         LEFT JOIN sys.extended_properties cep
           ON cep.major_id = c.object_id
           AND cep.minor_id = c.column_id
           AND cep.name = 'MS_Description'
         LEFT JOIN (
           SELECT ic.object_id, ic.column_id
           FROM sys.indexes i
           INNER JOIN sys.index_columns ic ON i.object_id = ic.object_id AND i.index_id = ic.index_id
           WHERE i.is_primary_key = 1
         ) pk ON pk.object_id = c.object_id AND pk.column_id = c.column_id
         WHERE t.schema_id = SCHEMA_ID(@0)
           AND t.name = @1
         ORDER BY c.column_id`,
        [schema, tableName]
      );

      // 检查表是否存在
      if (columnsResult.length === 0) {
        addLog.error('[MSSQL] Table does not exist:', { schema, tableName });
        return Promise.reject(DatabaseErrEnum.fetchInfoError);
      }

      const tableComment = columnsResult[0]?.table_description || '';
      const primaryKeys = columnsResult
        .filter((col) => col.is_primary_key)
        .map((col) => col.column_name);

      // 2. 获取外键信息（优化：直接 JOIN 获取列名，避免函数调用）
      const foreignKeysResult: {
        constraint_name: string;
        column_name: string;
        referenced_schema: string;
        referenced_table: string;
        referenced_column: string;
      }[] = await queryRunner.query(
        `SELECT
           fk.name AS constraint_name,
           pc.name AS column_name,
           SCHEMA_NAME(rt.schema_id) AS referenced_schema,
           rt.name AS referenced_table,
           rc.name AS referenced_column
         FROM sys.foreign_keys fk
         INNER JOIN sys.foreign_key_columns fkc ON fk.object_id = fkc.constraint_object_id
         INNER JOIN sys.tables t ON fk.parent_object_id = t.object_id
         INNER JOIN sys.tables rt ON fk.referenced_object_id = rt.object_id
         INNER JOIN sys.columns pc ON fkc.parent_object_id = pc.object_id AND fkc.parent_column_id = pc.column_id
         INNER JOIN sys.columns rc ON fkc.referenced_object_id = rc.object_id AND fkc.referenced_column_id = rc.column_id
         WHERE t.schema_id = SCHEMA_ID(@0)
           AND t.name = @1
         ORDER BY fk.name, fkc.constraint_column_id`,
        [schema, tableName]
      );

      const foreignKeyColumns = new Set(foreignKeysResult.map((fk) => fk.column_name));

      // 3. 构建列信息
      const columns: Record<string, ColumnSchemaType> = {};

      for (const col of columnsResult) {
        let examples: string[] = [];
        let valueIndex = false;

        if (getExamples) {
          try {
            const sql = this.buildSampleQuery(tableName, col.column_name, this.sample_value_num);
            const result = await queryRunner.query(sql);

            for (const row of result) {
              const value = row[col.column_name];
              if (value !== null && value !== undefined) {
                const strValue = truncateText(convertValueToString(value), this.max_string_length);
                examples.push(strValue);
              }
            }

            // MSSQL 字符串类型检查
            const stringTypes = ['varchar', 'nvarchar', 'char', 'nchar', 'text', 'ntext'];
            if (stringTypes.includes(col.data_type.toLowerCase()) && examples.length > 0) {
              valueIndex = true;
            }
          } catch (error) {
            addLog.warn(`[MSSQL] Failed to get sample data for column ${col.column_name}:`, {
              error
            });
            examples = [];
          }
        }

        const fkInfo = foreignKeysResult.filter((fk) => fk.column_name === col.column_name);

        columns[col.column_name] = {
          columnName: col.column_name,
          columnType: col.data_type,
          description: col.column_description || '',
          forbid: false,
          valueIndex,
          examples,
          isNullable: col.is_nullable,
          defaultValue: col.column_default,
          isAutoIncrement: col.is_identity,
          isPrimaryKey: primaryKeys.includes(col.column_name),
          isForeignKey: foreignKeyColumns.has(col.column_name),
          relatedColumns: fkInfo.map((fk) => fk.referenced_column)
        };
      }

      // 4. 构建外键列表
      const foreignKeys: ForeignKeySchemaType[] = foreignKeysResult.map((fk) => ({
        name: fk.constraint_name,
        column: fk.column_name,
        referredSchema: fk.referenced_schema,
        referredTable: fk.referenced_table,
        referredColumns: fk.referenced_column
      }));

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
    } catch (error) {
      addLog.error('[MSSQL] Failed to get table info:', { tableName, error });
      return Promise.reject(DatabaseErrEnum.fetchInfoError);
    } finally {
      await queryRunner.release();
    }
  }

  static fromConfig(config: DatabaseConfig): MssqlClient {
    const db = AsyncDB.from_uri(config);
    return new MssqlClient(db, config);
  }

  override async checkConnection(): Promise<boolean> {
    try {
      await super.checkConnection();
      return true;
    } catch (err: any) {
      const code = err?.code;
      const originalError = err?.originalError;
      const errorCode = code || originalError?.code;

      // Log diagnostic information
      addLog.warn('[MSSQL checkConnection]:', {
        code,
        originalErrorCode: originalError?.code,
        message: err?.message,
        originalErrorMessage: originalError?.message
      });

      switch (errorCode) {
        // Tedious driver errors
        case 'ELOGIN':
          // Login failed - authentication error
          return Promise.reject(DatabaseErrEnum.authError);
        case 'EINSTLOOKUP':
          // Instance lookup failed - named instance not found
          return Promise.reject(DatabaseErrEnum.hostError);
        case 'ESOCKET':
          // Socket/network error
          return Promise.reject(DatabaseErrEnum.connectionFailed);

        // Standard Node.js errors
        case 'ECONNREFUSED':
          // Connection refused - SQL Server not running
          return Promise.reject(DatabaseErrEnum.econnRefused);
        case 'ETIMEDOUT':
        case 'ETIMEOUT':
          // Connection timeout
          return Promise.reject(DatabaseErrEnum.connectionTimeout);
        case 'ENOTFOUND':
          // Host not found - DNS resolution failure
          return Promise.reject(DatabaseErrEnum.connectionFailed);
        case 'EHOSTUNREACH':
          // Host unreachable - network routing issue
          return Promise.reject(DatabaseErrEnum.hostError);
        case 'ERR_SOCKET_BAD_PORT':
          // Invalid port number
          return Promise.reject(DatabaseErrEnum.databasePortError);

        // Catch-all for unknown errors
        default:
          addLog.error('[MSSQL checkConnection] Unknown error:', {
            code,
            message: err?.message,
            number: err?.number,
            stack: err?.stack
          });
          return Promise.reject(DatabaseErrEnum.checkError);
      }
    }
  }
}

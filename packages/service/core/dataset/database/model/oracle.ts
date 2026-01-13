import type {
  DatabaseConfig,
  TableSchemaType,
  ColumnSchemaType,
  ForeignKeySchemaType
} from '@fastgpt/global/core/dataset/type';
import { AsyncDB } from './asyncDB';
import { DatabaseErrEnum } from '@fastgpt/global/common/error/code/database';
import { addLog } from '../../../../common/system/log';
import { truncateText, isStringType, convertValueToString } from './utils';

export class OracleClient extends AsyncDB {
  /**
   * 获取所有表名
   * Oracle 使用 ALL_TABLES 视图查询指定 owner 下的表
   */
  override async get_all_table_names(): Promise<Array<string>> {
    if (!this.db.isInitialized) {
      await this.db.initialize();
    }

    const queryRunner = this.db.createQueryRunner();

    try {
      // 使用 schema 或默认使用用户名作为 owner
      const owner = (this.config.schema || this.config.user).toUpperCase();

      const tables: { TABLE_NAME: string }[] = await queryRunner.query(
        `SELECT TABLE_NAME
         FROM ALL_TABLES
         WHERE OWNER = :1
         ORDER BY TABLE_NAME`,
        [owner]
      );

      return tables.map((t) => t.TABLE_NAME);
    } finally {
      await queryRunner.release();
    }
  }

  /**
   * Oracle 使用 FETCH FIRST n ROWS ONLY (12c+) 语法
   */
  protected override buildSampleQuery(tableName: string, columnName: string, limit: number): string {
    return `
      SELECT DISTINCT ${this.getProtectedIdentifier(columnName)}
      FROM ${this.getProtectedIdentifier(tableName)}
      WHERE ${this.getProtectedIdentifier(columnName)} IS NOT NULL
      FETCH FIRST ${limit} ROWS ONLY
    `;
  }

  /**
   * 获取表详细信息，包括列和描述
   * Oracle 需要使用特定的系统视图获取注释信息
   */
  override async get_table_info(tableName: string, getExamples: boolean = false): Promise<TableSchemaType> {
    if (!this.db.isInitialized) {
      await this.db.initialize();
    }

    const queryRunner = this.db.createQueryRunner();
    const owner = (this.config.schema || this.config.user).toUpperCase();

    try {
      // 1. 获取表注释
      const tableCommentResult: { COMMENTS: string | null }[] = await queryRunner.query(
        `SELECT COMMENTS FROM ALL_TAB_COMMENTS WHERE OWNER = :1 AND TABLE_NAME = :2`,
        [owner, tableName.toUpperCase()]
      );
      const tableComment = tableCommentResult[0]?.COMMENTS || '';

      // 2. 获取列信息和列注释
      const columnsResult: {
        COLUMN_NAME: string;
        DATA_TYPE: string;
        NULLABLE: string;
        DATA_DEFAULT: string | null;
        COMMENTS: string | null;
      }[] = await queryRunner.query(
        `SELECT
           c.COLUMN_NAME,
           c.DATA_TYPE,
           c.NULLABLE,
           c.DATA_DEFAULT,
           cc.COMMENTS
         FROM ALL_TAB_COLUMNS c
         LEFT JOIN ALL_COL_COMMENTS cc
           ON c.OWNER = cc.OWNER
           AND c.TABLE_NAME = cc.TABLE_NAME
           AND c.COLUMN_NAME = cc.COLUMN_NAME
         WHERE c.OWNER = :1 AND c.TABLE_NAME = :2
         ORDER BY c.COLUMN_ID`,
        [owner, tableName.toUpperCase()]
      );

      // 3. 获取主键信息
      const primaryKeysResult: { COLUMN_NAME: string }[] = await queryRunner.query(
        `SELECT cc.COLUMN_NAME
         FROM ALL_CONSTRAINTS c
         JOIN ALL_CONS_COLUMNS cc ON c.OWNER = cc.OWNER
           AND c.CONSTRAINT_NAME = cc.CONSTRAINT_NAME
         WHERE c.OWNER = :1
           AND c.TABLE_NAME = :2
           AND c.CONSTRAINT_TYPE = 'P'
         ORDER BY cc.POSITION`,
        [owner, tableName.toUpperCase()]
      );
      const primaryKeys = primaryKeysResult.map((pk) => pk.COLUMN_NAME);

      // 4. 获取外键信息
      const foreignKeysResult: {
        CONSTRAINT_NAME: string;
        COLUMN_NAME: string;
        R_OWNER: string;
        R_TABLE_NAME: string;
        R_COLUMN_NAME: string;
      }[] = await queryRunner.query(
        `SELECT
           c.CONSTRAINT_NAME,
           cc.COLUMN_NAME,
           c.R_OWNER,
           rc.TABLE_NAME AS R_TABLE_NAME,
           rcc.COLUMN_NAME AS R_COLUMN_NAME
         FROM ALL_CONSTRAINTS c
         JOIN ALL_CONS_COLUMNS cc ON c.OWNER = cc.OWNER
           AND c.CONSTRAINT_NAME = cc.CONSTRAINT_NAME
         JOIN ALL_CONSTRAINTS rc ON c.R_OWNER = rc.OWNER
           AND c.R_CONSTRAINT_NAME = rc.CONSTRAINT_NAME
         JOIN ALL_CONS_COLUMNS rcc ON rc.OWNER = rcc.OWNER
           AND rc.CONSTRAINT_NAME = rcc.CONSTRAINT_NAME
           AND cc.POSITION = rcc.POSITION
         WHERE c.OWNER = :1
           AND c.TABLE_NAME = :2
           AND c.CONSTRAINT_TYPE = 'R'`,
        [owner, tableName.toUpperCase()]
      );

      const foreignKeyColumns = new Set(foreignKeysResult.map((fk) => fk.COLUMN_NAME));

      // 5. 构建列信息
      const columns: Record<string, ColumnSchemaType> = {};

      for (const col of columnsResult) {
        let examples: string[] = [];
        let valueIndex = false;

        if (getExamples) {
          try {
            const sql = this.buildSampleQuery(tableName, col.COLUMN_NAME, this.sample_value_num);
            const result = await queryRunner.query(sql);

            for (const row of result) {
              const value = row[col.COLUMN_NAME];
              if (value !== null && value !== undefined) {
                const strValue = truncateText(convertValueToString(value), this.max_string_length);
                examples.push(strValue);
              }
            }

            // Oracle 字符串类型检查
            const stringTypes = ['VARCHAR2', 'NVARCHAR2', 'CHAR', 'NCHAR', 'CLOB', 'NCLOB', 'LONG'];
            if (stringTypes.includes(col.DATA_TYPE.toUpperCase()) && examples.length > 0) {
              valueIndex = true;
            }
          } catch (error) {
            addLog.warn(`[Oracle] Failed to get sample data for column ${col.COLUMN_NAME}:`, { error });
            examples = [];
          }
        }

        const fkInfo = foreignKeysResult.filter((fk) => fk.COLUMN_NAME === col.COLUMN_NAME);

        columns[col.COLUMN_NAME] = {
          columnName: col.COLUMN_NAME,
          columnType: col.DATA_TYPE,
          description: col.COMMENTS || '',
          forbid: false,
          valueIndex,
          examples,
          isNullable: col.NULLABLE === 'Y',
          defaultValue: col.DATA_DEFAULT,
          isAutoIncrement: false, // Oracle 使用 SEQUENCE，不是自增列
          isPrimaryKey: primaryKeys.includes(col.COLUMN_NAME),
          isForeignKey: foreignKeyColumns.has(col.COLUMN_NAME),
          relatedColumns: fkInfo.map((fk) => fk.R_COLUMN_NAME)
        };
      }

      // 6. 构建外键列表
      const foreignKeys: ForeignKeySchemaType[] = foreignKeysResult.map((fk) => ({
        name: fk.CONSTRAINT_NAME,
        column: fk.COLUMN_NAME,
        referredSchema: fk.R_OWNER,
        referredTable: fk.R_TABLE_NAME,
        referredColumns: fk.R_COLUMN_NAME
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
      addLog.error('[Oracle] Failed to get table info:', { tableName, error });
      return Promise.reject(DatabaseErrEnum.fetchInfoError);
    } finally {
      await queryRunner.release();
    }
  }

  /**
   * 从配置创建客户端实例
   */
  static fromConfig(config: DatabaseConfig): OracleClient {
    const db = AsyncDB.from_uri(config);
    return new OracleClient(db, config);
  }

  /**
   * 连接检查，处理 Oracle 特有错误码
   * Oracle 需要使用 SELECT 1 FROM DUAL 而非 SELECT 1
   */
  override async checkConnection(): Promise<boolean> {
    try {
      if (!this.db.isInitialized) {
        await this.db.initialize();
      }
      // Oracle 使用 DUAL 虚拟表进行连接测试
      await this.db.query('SELECT 1 FROM DUAL');
      return true;
    } catch (err: any) {
      const code = err?.code;
      const errorNum = err?.errorNum; // Oracle 特有的错误编号

      addLog.warn('[Oracle checkConnection]:', {
        code,
        errorNum,
        message: err?.message
      });

      // Oracle 特有错误码处理
      switch (errorNum) {
        case 1017: // ORA-01017: invalid username/password
          return Promise.reject(DatabaseErrEnum.authError);
        case 12154: // ORA-12154: TNS:could not resolve the connect identifier
        case 12541: // ORA-12541: TNS:no listener
          return Promise.reject(DatabaseErrEnum.hostError);
        case 12170: // ORA-12170: TNS:Connect timeout
          return Promise.reject(DatabaseErrEnum.connectionTimeout);
        case 12514: // ORA-12514: TNS:listener does not know of service
          return Promise.reject(DatabaseErrEnum.connectionFailed);
        case 1033: // ORA-01033: ORACLE initialization or shutdown in progress
          return Promise.reject(DatabaseErrEnum.econnRefused);
      }

      // 标准 Node.js 错误
      switch (code) {
        case 'ECONNREFUSED':
          return Promise.reject(DatabaseErrEnum.econnRefused);
        case 'ETIMEDOUT':
        case 'ETIMEOUT':
          return Promise.reject(DatabaseErrEnum.connectionTimeout);
        case 'ENOTFOUND':
          return Promise.reject(DatabaseErrEnum.connectionFailed);
        case 'ERR_SOCKET_BAD_PORT':
          return Promise.reject(DatabaseErrEnum.databasePortError);
        default:
          addLog.error('[Oracle checkConnection] Unknown error:', {
            code,
            errorNum,
            message: err?.message,
            stack: err?.stack
          });
          return Promise.reject(DatabaseErrEnum.checkError);
      }
    }
  }
}


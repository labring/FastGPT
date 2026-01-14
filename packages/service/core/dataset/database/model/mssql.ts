import type { DatabaseConfig } from '@fastgpt/global/core/dataset/type';
import { AsyncDB } from './asyncDB';
import { DatabaseErrEnum } from '@fastgpt/global/common/error/code/database';
import { addLog } from '../../../../common/system/log';

export class MssqlClient extends AsyncDB {
  /**
   * MSSQL 使用 TOP 语法而非 LIMIT
   */
  protected override buildSampleQuery(tableName: string, columnName: string, limit: number): string {
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


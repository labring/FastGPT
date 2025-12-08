import type { DatabaseConfig } from '@fastgpt/global/core/dataset/type';
import { AsyncDB } from './asyncDB';
import { DatabaseErrEnum } from '@fastgpt/global/common/error/code/database';
import { addLog } from '../../../../common/system/log';

export class MysqlClient extends AsyncDB {
  override async get_all_table_names(): Promise<Array<string>> {
    if (!this.db.isInitialized) {
      await this.db.initialize();
    }
    const queryRunner = this.db.createQueryRunner();
    // try-finally to ensure the queryRunner is released
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

      return tables.map((t) => t.TABLE_NAME);
    } finally {
      await queryRunner.release();
    }
  }
  static fromConfig(config: DatabaseConfig): MysqlClient {
    const db = AsyncDB.from_uri(config);
    return new MysqlClient(db, config);
  }

  override async checkConnection(): Promise<boolean> {
    try {
      await super.checkConnection();
      return true;
    } catch (err: any) {
      addLog.warn('[checkConnection]:', err);

      const code = err?.code;

      switch (code) {
        case 'ER_ACCESS_DENIED_ERROR': // username or password error
          return Promise.reject(DatabaseErrEnum.authError);

        case 'ER_BAD_DB_ERROR': // database not found
          return Promise.reject(DatabaseErrEnum.databaseNameError);

        case 'PROTOCOL_CONNECTION_LOST': // connection lost
          return Promise.reject(DatabaseErrEnum.connectionLost);

        case 'ECONNREFUSED': // Error: Connection Refused
          return Promise.reject(DatabaseErrEnum.econnRefused);

        case 'ETIMEDOUT': // timeout error
          return Promise.reject(DatabaseErrEnum.connectionTimeout);

        case 'ENOTFOUND': // url error
          return Promise.reject(DatabaseErrEnum.connectionFailed);

        case 'EHOSTUNREACH': // address error
          return Promise.reject(DatabaseErrEnum.hostError);

        case 'ERR_SOCKET_BAD_PORT': // port error
          return Promise.reject(DatabaseErrEnum.databasePortError);

        default: // other
          return Promise.reject(DatabaseErrEnum.checkError);
      }
    }
  }
}

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
      if (err?.code === 'ER_ACCESS_DENIED_ERROR') {
        // username or password error
        return Promise.reject(DatabaseErrEnum.authError);
      } else if (err?.code === 'ER_BAD_DB_ERROR') {
        // database not found
        return Promise.reject(DatabaseErrEnum.databaseNameError);
      } else if (err?.code === 'PROTOCOL_CONNECTION_LOST') {
        // connection lost
        return Promise.reject(DatabaseErrEnum.connectionLost);
      } else if (err?.code === 'ECONNREFUSED') {
        // Error: Connection Refused
        return Promise.reject(DatabaseErrEnum.econnRefused);
      } else if (err?.code === 'ETIMEDOUT') {
        // timeout error
        return Promise.reject(DatabaseErrEnum.connectionTimeout);
      } else if (err?.code === 'ENOTFOUND') {
        // url error
        return Promise.reject(DatabaseErrEnum.connectionFailed);
      } else if (err?.code === 'EHOSTUNREACH') {
        // address error
        return Promise.reject(DatabaseErrEnum.hostError);
      } else if (err?.code === 'ERR_SOCKET_BAD_PORT') {
        // port error
        return Promise.reject(DatabaseErrEnum.databasePortError);
      } else {
        // other
        return Promise.reject(DatabaseErrEnum.checkError);
      }
    }
  }
}

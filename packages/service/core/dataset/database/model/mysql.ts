import type {DatabaseConfig} from '@fastgpt/global/core/dataset/type'
import { AsyncDB } from './AsyncDB'
import { DatabaseErrEnum } from '@fastgpt/global/common/error/code/database';

export class MysqlClient extends AsyncDB {

  static fromConfig(config: DatabaseConfig): MysqlClient {
      const db = AsyncDB.from_uri(config);
      return new MysqlClient(db, config);
  }

  override async checkConnection(): Promise<boolean> {
      try {
          await super.checkConnection();
          return true;
      } catch (err: any) {
          if (err?.code === "ER_ACCESS_DENIED_ERROR") {
              // username or password error
              return Promise.reject(DatabaseErrEnum.authError);
          } else if (err?.code === "ER_BAD_DB_ERROR") {
              // database not found
              return Promise.reject(DatabaseErrEnum.clientNotFound);
          } else if (err?.code === "PROTOCOL_CONNECTION_LOST" || err?.code === "ENOTFOUND" || err?.code === "ETIMEDOUT") {
              // url error
              return Promise.reject(DatabaseErrEnum.connectionFailed);
          } else {
              // other
              return Promise.reject(DatabaseErrEnum.checkError);
          }
      }
  }

}

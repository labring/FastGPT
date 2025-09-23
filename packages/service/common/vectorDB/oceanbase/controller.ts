import mysql, {
  type Pool,
  type QueryResult,
  type RowDataPacket,
  type ResultSetHeader
} from 'mysql2/promise';
import { addLog } from '../../system/log';
import { OCEANBASE_ADDRESS } from '../constants';
import { delay } from '@fastgpt/global/common/system/utils';

export const getClient = async (): Promise<Pool> => {
  if (!OCEANBASE_ADDRESS) {
    return Promise.reject('OCEANBASE_ADDRESS is not set');
  }

  if (global.obClient) {
    return global.obClient;
  }

  global.obClient = mysql.createPool({
    uri: OCEANBASE_ADDRESS,
    waitForConnections: true,
    connectionLimit: Number(process.env.DB_MAX_LINK || 20),
    connectTimeout: 20000,
    idleTimeout: 60000,
    queueLimit: 0,
    enableKeepAlive: true,
    keepAliveInitialDelay: 0
  });

  try {
    // Test the connection with a simple query instead of calling connect()
    await global.obClient.query('SELECT 1');
    addLog.info(`oceanbase connected`);
    return global.obClient;
  } catch (error) {
    addLog.error(`oceanbase connect error`, error);

    global.obClient?.end();
    global.obClient = null;

    await delay(1000);
    addLog.info(`Retry connect oceanbase`);

    return getClient();
  }
};

type WhereProps = (string | [string, string | number])[];
type GetProps = {
  fields?: string[];
  where?: WhereProps;
  order?: { field: string; mode: 'DESC' | 'ASC' | string }[];
  limit?: number;
  offset?: number;
};

type DeleteProps = {
  where: WhereProps;
};

type ValuesProps = { key: string; value?: string | number }[];
type UpdateProps = {
  values: ValuesProps;
  where: WhereProps;
};
type InsertProps = {
  values: ValuesProps[];
};

class ObClass {
  private getWhereStr(where?: WhereProps) {
    return where
      ? `WHERE ${where
          .map((item) => {
            if (typeof item === 'string') {
              return item;
            }
            const val = typeof item[1] === 'number' ? item[1] : `'${String(item[1])}'`;
            return `${item[0]}=${val}`;
          })
          .join(' ')}`
      : '';
  }
  private getUpdateValStr(values: ValuesProps) {
    return values
      .map((item) => {
        const val =
          typeof item.value === 'number'
            ? item.value
            : `'${String(item.value).replace(/\'/g, '"')}'`;

        return `${item.key}=${val}`;
      })
      .join(',');
  }
  private getInsertValStr(values: ValuesProps[]) {
    return values
      .map(
        (items) =>
          `(${items
            .map((item) =>
              typeof item.value === 'number'
                ? item.value
                : `'${String(item.value).replace(/\'/g, '"')}'`
            )
            .join(',')})`
      )
      .join(',');
  }
  async select<T extends QueryResult = any>(table: string, props: GetProps) {
    const sql = `SELECT ${
      !props.fields || props.fields?.length === 0 ? '*' : props.fields?.join(',')
    }
      FROM ${table}
      ${this.getWhereStr(props.where)}
      ${
        props.order
          ? `ORDER BY ${props.order.map((item) => `${item.field} ${item.mode}`).join(',')}`
          : ''
      }
      LIMIT ${props.limit || 10} OFFSET ${props.offset || 0}
    `;

    const client = await getClient();
    return client.query<T>(sql);
  }
  async count(table: string, props: GetProps) {
    const sql = `SELECT COUNT(${props?.fields?.[0] || '*'})
      FROM ${table}
      ${this.getWhereStr(props.where)}
    `;

    const client = await getClient();
    return client.query<({ count: number } & RowDataPacket)[]>(sql).then(([res]) => {
      return res[0]?.['COUNT(*)'] || 0;
    });
  }
  async delete(table: string, props: DeleteProps) {
    const sql = `DELETE FROM ${table} ${this.getWhereStr(props.where)}`;
    const client = await getClient();
    return client.query(sql);
  }
  async update(table: string, props: UpdateProps) {
    if (props.values.length === 0) {
      return {
        rowCount: 0
      };
    }

    const sql = `UPDATE ${table} SET ${this.getUpdateValStr(props.values)} ${this.getWhereStr(
      props.where
    )}`;
    const client = await getClient();
    return client.query(sql);
  }
  /**
   * 批量插入数据并获取自增 ID
   * 在 OceanBase 多副本环境下使用 LAST_INSERT_ID() 获取准确的自增 ID
   *
   * 原理说明：
   * 1. OceanBase 的 LAST_INSERT_ID() 返回当前会话最后一次插入操作的第一个自增 ID
   * 2. 批量插入时，ID 是连续的：first_id, first_id+1, first_id+2, ...
   * 3. 这种方法在多副本环境下是可靠的，因为每个连接会话是独立的
   */
  async insert(table: string, props: InsertProps) {
    if (props.values.length === 0) {
      return {
        rowCount: 0,
        insertIds: []
      };
    }

    const fields = props.values[0].map((item) => item.key).join(',');
    const sql = `INSERT INTO ${table} (${fields}) VALUES ${this.getInsertValStr(props.values)}`;

    // 获取专用连接而不是从连接池获取
    const connection = await (await getClient()).getConnection();

    try {
      const result = await connection.query<ResultSetHeader>(sql);

      if (result[0].affectedRows > 0) {
        // 在同一个连接上获取LAST_INSERT_ID，确保会话一致性
        const [lastIdResult] = await connection.query<RowDataPacket[]>(
          'SELECT LAST_INSERT_ID() as firstId'
        );
        const firstId = lastIdResult[0]?.firstId;

        if (firstId && typeof firstId === 'number') {
          const count = result[0].affectedRows;
          // Generate consecutive IDs: firstId, firstId+1, firstId+2, ...
          const ids = Array.from({ length: count }, (_, i) => String(firstId + i));

          return {
            rowCount: result[0].affectedRows,
            insertIds: ids
          };
        }

        // Fallback: try to use insertId from ResultSetHeader if LAST_INSERT_ID() fails
        if (result[0].insertId) {
          const startId = result[0].insertId;
          const count = result[0].affectedRows;
          const ids = Array.from({ length: count }, (_, i) => String(startId + i));

          return {
            rowCount: result[0].affectedRows,
            insertIds: ids
          };
        }
      }

      return {
        rowCount: result[0].affectedRows || 0,
        insertIds: []
      };
    } catch (error) {
      addLog.error(`OceanBase batch insert error: ${error}`);
      throw error;
    } finally {
      connection.release(); // 释放连接回连接池
    }
  }
  async query<T extends QueryResult = any>(sql: string) {
    const client = await getClient();
    const start = Date.now();
    return client.query<T>(sql).then((res) => {
      const time = Date.now() - start;

      if (time > 300) {
        addLog.warn(`oceanbase query time: ${time}ms, sql: ${sql}`);
      }

      return res;
    });
  }
}

export const ObClient = new ObClass();
export const Oceanbase = global.obClient;

import { delay } from '@fastgpt/global/common/system/utils';
import { addLog } from '../../system/log';
import { Pool } from 'pg';
import type { QueryResultRow } from 'pg';
import { PG_ADDRESS } from '../constants';

export const connectPg = async (): Promise<Pool> => {
  if (global.pgClient) {
    return global.pgClient;
  }

  const pool = new Pool({
    connectionString: PG_ADDRESS,
    // 连接池配置
    max: Number(process.env.DB_MAX_LINK || 30), // 增加到 30，支持更高并发
    min: 15, // 调整为 max 的 50%
    keepAlive: true,

    // 超时配置
    idleTimeoutMillis: 1800000, // 30分钟，减少频繁重连
    connectionTimeoutMillis: 30000, // 30秒，给予充足的连接获取时间
    query_timeout: 60000, // 60秒，向量检索可能需要更长时间
    statement_timeout: 90000, // 90秒，比 query_timeout 长
    idle_in_transaction_session_timeout: 60000, // 保持 60秒

    // 额外推荐配置
    allowExitOnIdle: false, // 防止连接池过早关闭
    application_name: 'fastgpt-vector-db' // 便于数据库监控识别
  });
  global.pgClient = pool;

  global.pgClient.on('error', async (err) => {
    addLog.error(`[PG] error`, err);
  });
  global.pgClient.on('connect', async () => {
    addLog.info(`[PG] connect`);
  });
  global.pgClient.on('remove', async (client) => {
    addLog.warn('[PG] Connection removed from pool');
  });

  try {
    await global.pgClient.connect();
    return global.pgClient;
  } catch (error) {
    addLog.error(`[PG] connect error`, error);
    global.pgClient?.removeAllListeners();
    global.pgClient?.end();
    global.pgClient = null;

    await delay(1000);
    addLog.warn(`[PG] retry connect`);

    return connectPg();
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

class PgClass {
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

  async query<T extends QueryResultRow = any>(sql: string) {
    const pg = await connectPg();
    const start = Date.now();
    return pg.query<T>(sql).then((res) => {
      const time = Date.now() - start;

      if (time > 1000) {
        const safeSql = sql.replace(/'\[[^\]]*?\]'/g, "'[x]'");
        addLog.warn(`[PG slow 2] time: ${time}ms, sql: ${safeSql}`);
      } else if (time > 300) {
        const safeSql = sql.replace(/'\[[^\]]*?\]'/g, "'[x]'");
        addLog.warn(`[PG slow 1] time: ${time}ms, sql: ${safeSql}`);
      }

      return res;
    });
  }

  async select<T extends QueryResultRow = any>(table: string, props: GetProps) {
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

    return this.query<T>(sql);
  }
  async count(table: string, props: GetProps) {
    const sql = `SELECT COUNT(${props?.fields?.[0] || '*'})
      FROM ${table}
      ${this.getWhereStr(props.where)}
    `;

    return this.query(sql).then((res) => Number(res.rows[0]?.count || 0));
  }
  async delete(table: string, props: DeleteProps) {
    const sql = `DELETE FROM ${table} ${this.getWhereStr(props.where)}`;
    return this.query(sql);
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
    return this.query(sql);
  }
  async insert(table: string, props: InsertProps) {
    if (props.values.length === 0) {
      return {
        rowCount: 0,
        rows: []
      };
    }

    const fields = props.values[0].map((item) => item.key).join(',');
    const sql = `INSERT INTO ${table} (${fields}) VALUES ${this.getInsertValStr(
      props.values
    )} RETURNING id`;

    return this.query<{ id: string }>(sql);
  }
}

export const PgClient = new PgClass();
export const Pg = global.pgClient;

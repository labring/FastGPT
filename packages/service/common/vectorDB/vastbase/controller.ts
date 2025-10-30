import { delay } from '@fastgpt/global/common/system/utils';
import { addLog } from '../../system/log';
import { Pool } from 'pg';
import type { QueryResultRow } from 'pg';
import { VASTBASE_ADDRESS } from '../constants';

/**
 * 连接 Vastbase 数据库
 * Vastbase 兼容 PostgreSQL 协议，因此可以使用 pg 驱动
 */
export const connectVastbase = async (): Promise<Pool> => {
  if (global.vastbaseClient) {
    return global.vastbaseClient;
  }

  global.vastbaseClient = new Pool({
    connectionString: VASTBASE_ADDRESS,
    max: Number(process.env.DB_MAX_LINK || 20),
    min: 10,
    keepAlive: true,
    idleTimeoutMillis: 600000,
    connectionTimeoutMillis: 20000,
    query_timeout: 30000,
    statement_timeout: 40000,
    idle_in_transaction_session_timeout: 60000
  });

  global.vastbaseClient.on('error', async (err) => {
    addLog.error(`Vastbase error`, err);
    global.vastbaseClient?.end();
    global.vastbaseClient = null;

    await delay(1000);
    addLog.info(`Retry connect Vastbase`);
    connectVastbase();
  });

  try {
    await global.vastbaseClient.connect();
    console.log('Vastbase connected');
    return global.vastbaseClient;
  } catch (error) {
    addLog.error(`Vastbase connect error`, error);
    global.vastbaseClient?.end();
    global.vastbaseClient = null;

    await delay(1000);
    addLog.info(`Retry connect Vastbase`);

    return connectVastbase();
  }
};

// 数据库操作相关类型定义
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

/**
 * Vastbase 数据库操作类
 * 提供与 PostgreSQL 兼容的数据库操作接口
 */
class VastbaseClass {
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

  /**
   * 查询数据
   */
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

    const vastbase = await connectVastbase();
    return vastbase.query<T>(sql);
  }

  /**
   * 统计数据数量
   */
  async count(table: string, props: GetProps) {
    const sql = `SELECT COUNT(${props?.fields?.[0] || '*'})
      FROM ${table}
      ${this.getWhereStr(props.where)}
    `;

    const vastbase = await connectVastbase();
    return vastbase.query(sql).then((res) => Number(res.rows[0]?.count || 0));
  }

  /**
   * 删除数据
   */
  async delete(table: string, props: DeleteProps) {
    const sql = `DELETE FROM ${table} ${this.getWhereStr(props.where)}`;
    const vastbase = await connectVastbase();
    return vastbase.query(sql);
  }

  /**
   * 更新数据
   */
  async update(table: string, props: UpdateProps) {
    if (props.values.length === 0) {
      return {
        rowCount: 0
      };
    }

    const sql = `UPDATE ${table} SET ${this.getUpdateValStr(props.values)} ${this.getWhereStr(
      props.where
    )}`;
    const vastbase = await connectVastbase();
    return vastbase.query(sql);
  }

  /**
   * 插入数据
   */
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

    const vastbase = await connectVastbase();
    return vastbase.query<{ id: string }>(sql);
  }

  /**
   * 执行原生 SQL 查询
   */
  async query<T extends QueryResultRow = any>(sql: string) {
    const vastbase = await connectVastbase();
    const start = Date.now();
    return vastbase.query<T>(sql).then((res) => {
      const time = Date.now() - start;

      if (time > 300) {
        addLog.warn(`Vastbase query time: ${time}ms, sql: ${sql}`);
      }

      return res;
    });
  }
}

export const VastbaseClient = new VastbaseClass();
export const Vastbase = global.vastbaseClient;

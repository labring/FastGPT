import { delay } from '@fastgpt/global/common/system/utils';
import { addLog } from '../../system/log';
import { Pool } from 'pg';
import type { QueryResultRow } from 'pg';
import { PG_ADDRESS } from '../constants';

export const connectPg = async (): Promise<Pool> => {
  if (global.pgClient) {
    return global.pgClient;
  }

  global.pgClient = new Pool({
    connectionString: PG_ADDRESS,
    max: Number(process.env.DB_MAX_LINK || 20),
    min: 10,
    keepAlive: true,
    idleTimeoutMillis: 600000,
    connectionTimeoutMillis: 20000,
    query_timeout: 30000,
    statement_timeout: 40000,
    idle_in_transaction_session_timeout: 60000
  });

  global.pgClient.on('error', async (err) => {
    addLog.error(`pg error`, err);
    global.pgClient?.end();
    global.pgClient = null;

    await delay(1000);
    addLog.info(`Retry connect pg`);
    connectPg();
  });

  try {
    await global.pgClient.connect();
    console.log('pg connected');
    return global.pgClient;
  } catch (error) {
    addLog.error(`pg connect error`, error);
    global.pgClient?.end();
    global.pgClient = null;

    await delay(1000);
    addLog.info(`Retry connect pg`);

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

    const pg = await connectPg();
    return pg.query<T>(sql);
  }
  async count(table: string, props: GetProps) {
    const sql = `SELECT COUNT(${props?.fields?.[0] || '*'})
      FROM ${table}
      ${this.getWhereStr(props.where)}
    `;

    const pg = await connectPg();
    return pg.query(sql).then((res) => Number(res.rows[0]?.count || 0));
  }
  async delete(table: string, props: DeleteProps) {
    const sql = `DELETE FROM ${table} ${this.getWhereStr(props.where)}`;
    const pg = await connectPg();
    return pg.query(sql);
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
    const pg = await connectPg();
    return pg.query(sql);
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

    const pg = await connectPg();
    return pg.query<{ id: string }>(sql);
  }
  async query<T extends QueryResultRow = any>(sql: string) {
    const pg = await connectPg();
    const start = Date.now();
    return pg.query<T>(sql).then((res) => {
      const time = Date.now() - start;

      if (time > 300) {
        addLog.warn(`pg query time: ${time}ms, sql: ${sql}`);
      }

      return res;
    });
  }
}

export const PgClient = new PgClass();
export const Pg = global.pgClient;

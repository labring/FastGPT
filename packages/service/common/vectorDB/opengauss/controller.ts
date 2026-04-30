import { delay } from '@fastgpt/global/common/system/utils';
import { getLogger, LogCategories } from '../../logger';
import { Pool } from 'pg';
import type { QueryResultRow } from 'pg';
import { OPENGAUSS_ADDRESS } from '../constants';

const logger = getLogger(LogCategories.INFRA.VECTOR);

export const connectOg = async (): Promise<Pool> => {
  if (global.pgClient) {
    return global.pgClient;
  }

  const pool = new Pool({
    connectionString: OPENGAUSS_ADDRESS,
    max: Number(process.env.DB_MAX_LINK || 30),
    min: 15,
    keepAlive: true,
    idleTimeoutMillis: 1800000,
    connectionTimeoutMillis: 30000,
    query_timeout: 60000,
    statement_timeout: 90000,
    idle_in_transaction_session_timeout: 60000,
    allowExitOnIdle: false,
    application_name: 'fastgpt-vector-db'
  });
  global.pgClient = pool;

  global.pgClient.on('error', async (err) => {
    logger.error('openGauss pool error', { error: err });
  });
  global.pgClient.on('connect', async () => {
    logger.info('openGauss pool connected');
  });
  global.pgClient.on('remove', async () => {
    logger.warn('openGauss connection removed from pool');
  });

  try {
    await global.pgClient.connect();
    return global.pgClient;
  } catch (error) {
    logger.error('openGauss connection failed', { error });
    global.pgClient?.removeAllListeners();
    global.pgClient?.end();
    global.pgClient = null;

    await delay(1000);
    logger.warn('openGauss reconnecting after failure');

    return connectOg();
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

class OgClass {
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
    const og = await connectOg();
    const start = Date.now();
    return og.query<T>(sql).then((res) => {
      const time = Date.now() - start;

      if (time > 1000) {
        const safeSql = sql.replace(/'\[[^\]]*?\]'/g, "'[x]'");
        logger.warn('openGauss slow query detected', {
          level: 'slow-2',
          durationMs: time,
          sql: safeSql
        });
      } else if (time > 300) {
        const safeSql = sql.replace(/'\[[^\]]*?\]'/g, "'[x]'");
        logger.warn('openGauss slow query detected', {
          level: 'slow-1',
          durationMs: time,
          sql: safeSql
        });
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

export const OgClient = new OgClass();

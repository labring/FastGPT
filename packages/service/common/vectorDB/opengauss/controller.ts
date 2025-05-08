import { delay } from '@fastgpt/global/common/system/utils';
import { addLog } from '../../system/log';
import { Pool } from 'pg';
import type { QueryResultRow } from 'pg';
import { OPENGAUSS_ADDRESS } from '../constants';

export const connectGs = async (): Promise<Pool> => {
    if (global.gsClient) {
      return global.gsClient;
    }

    global.gsClient = new Pool({
        connectionString: OPENGAUSS_ADDRESS,
        max: Number(process.env.DB_MAX_LINK || 20),
        min: 10,
        keepAlive: true,
        idleTimeoutMillis: 600000,
        connectionTimeoutMillis: 20000,
        query_timeout: 30000,
        statement_timeout: 40000,
        idle_in_transaction_session_timeout: 60000
    });

    global.gsClient.on('error', async (err) => {
        addLog.error(`openGauss error`, err);
        global.gsClient?.end();
        global.gsClient = null;
    
        await delay(1000);
        addLog.info(`Retry connect openGauss`);
        connectGs();
      });

    try {
    await global.gsClient.connect();
    console.log('openGauss connected');
    return global.gsClient;
    } catch (error) {
    addLog.error(`openGauss connect error`, error);
    global.gsClient?.end();
    global.gsClient = null;

    await delay(1000);
    addLog.info(`Retry connect openGauss`);

    return connectGs();
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

class GsClass {
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

    const gs = await connectGs();
    return gs.query<T>(sql);
  }
  async count(table: string, props: GetProps) {
    const sql = `SELECT COUNT(${props?.fields?.[0] || '*'})
      FROM ${table}
      ${this.getWhereStr(props.where)}
    `;

    const gs = await connectGs();
    return gs.query(sql).then((res) => Number(res.rows[0]?.count || 0));
  }
  async delete(table: string, props: DeleteProps) {
    const sql = `DELETE FROM ${table} ${this.getWhereStr(props.where)}`;
    const gs = await connectGs();
    return gs.query(sql);
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
    const gs = await connectGs();
    return gs.query(sql);
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

    const gs = await connectGs();
    return gs.query<{ id: string }>(sql);
  }
  async query<T extends QueryResultRow = any>(sql: string) {
    const gs = await connectGs();
    const start = Date.now();
    return gs.query<T>(sql).then((res) => {
      const time = Date.now() - start;

      if (time > 300) {
        addLog.warn(`gs query time: ${time}ms, sql: ${sql}`);
      }

      return res;
    });
  }
}

export const GsClient = new GsClass();
export const Gs = global.gsClient;

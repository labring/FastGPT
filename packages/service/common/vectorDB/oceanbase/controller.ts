import mysql, { Pool, QueryResult, RowDataPacket, ResultSetHeader } from 'mysql2/promise';
import { addLog } from '../../system/log';
import { OCEANBASE_ADDRESS } from '../constants';

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

  addLog.info(`oceanbase connected`);

  return global.obClient;
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
    return client
      .query<({ count: number } & RowDataPacket)[]>(sql)
      .then(([rows]) => Number(rows[0]?.count || 0));
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
  async insert(table: string, props: InsertProps) {
    if (props.values.length === 0) {
      return {
        rowCount: 0,
        rows: []
      };
    }

    const fields = props.values[0].map((item) => item.key).join(',');
    const sql = `INSERT INTO ${table} (${fields}) VALUES ${this.getInsertValStr(props.values)}`;

    const client = await getClient();
    return client.query<ResultSetHeader>(sql).then(([result]) => {
      return {
        rowCount: result.affectedRows,
        rows: [{ id: String(result.insertId) }]
      };
    });
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

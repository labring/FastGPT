import { Pool } from 'pg';
import type { QueryResultRow } from 'pg';

export const connectPg = async () => {
  if (global.pgClient) {
    return global.pgClient;
  }

  global.pgClient = new Pool({
    host: process.env.PG_HOST,
    port: process.env.PG_PORT ? +process.env.PG_PORT : 5432,
    user: process.env.PG_USER,
    password: process.env.PG_PASSWORD,
    database: process.env.PG_DB_NAME,
    max: Number(process.env.DB_MAX_LINK || 10),
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000
  });

  global.pgClient.on('error', (err) => {
    console.log(err);
    global.pgClient = null;
  });

  try {
    await global.pgClient.connect();
    console.log('pg connected');
    return global.pgClient;
  } catch (error) {
    global.pgClient = null;
    return Promise.reject(error);
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

type ValuesProps = { key: string; value: string | number }[];
type UpdateProps = {
  values: ValuesProps;
  where: WhereProps;
};
type InsertProps = {
  values: ValuesProps[];
};

class Pg {
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
        rowCount: 0
      };
    }

    const fields = props.values[0].map((item) => item.key).join(',');
    const sql = `INSERT INTO ${table} (${fields}) VALUES ${this.getInsertValStr(props.values)} `;
    const pg = await connectPg();
    return pg.query(sql);
  }
  async query<T extends QueryResultRow = any>(sql: string) {
    const pg = await connectPg();
    return pg.query<T>(sql);
  }
}

export const PgClient = new Pg();

/**
 * data insert kb
 */
export const insertKbItem = ({
  userId,
  kbId,
  data
}: {
  userId: string;
  kbId: string;
  data: {
    vector: number[];
    q: string;
    a: string;
    source?: string;
  }[];
}) => {
  return PgClient.insert('modelData', {
    values: data.map((item) => [
      { key: 'user_id', value: userId },
      { key: 'kb_id', value: kbId },
      { key: 'source', value: item.source?.slice(0, 30)?.trim() || '' },
      { key: 'q', value: item.q.replace(/'/g, '"') },
      { key: 'a', value: item.a.replace(/'/g, '"') },
      { key: 'vector', value: `[${item.vector}]` }
    ])
  });
};

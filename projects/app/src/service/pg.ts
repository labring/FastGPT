import { Pool } from 'pg';
import type { QueryResultRow } from 'pg';
import { PgDatasetTableName } from '@/constants/plugin';
import { addLog } from './utils/tools';
import type { DatasetDataItemType } from '@/types/core/dataset/data';

export const connectPg = async (): Promise<Pool> => {
  if (global.pgClient) {
    return global.pgClient;
  }

  global.pgClient = new Pool({
    connectionString: process.env.PG_URL,
    max: Number(process.env.DB_MAX_LINK || 5),
    keepAlive: true,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000
  });

  global.pgClient.on('error', (err) => {
    console.log(err);
    global.pgClient?.end();
    global.pgClient = null;
    connectPg();
  });

  try {
    await global.pgClient.connect();
    console.log('pg connected');
    return global.pgClient;
  } catch (error) {
    global.pgClient = null;
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
    const sql = `INSERT INTO ${table} (${fields}) VALUES ${this.getInsertValStr(
      props.values
    )} RETURNING id`;
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
 * data insert dataset
 */
export const insertData2Dataset = ({
  userId,
  kbId,
  data
}: {
  userId: string;
  kbId: string;
  data: (DatasetDataItemType & {
    vector: number[];
  })[];
}) => {
  return PgClient.insert(PgDatasetTableName, {
    values: data.map((item) => [
      { key: 'user_id', value: userId },
      { key: 'kb_id', value: kbId },
      { key: 'source', value: item.source?.slice(0, 60)?.trim() || '' },
      { key: 'file_id', value: item.file_id || '' },
      { key: 'q', value: item.q.replace(/'/g, '"') },
      { key: 'a', value: item.a.replace(/'/g, '"') },
      { key: 'vector', value: `[${item.vector}]` }
    ])
  });
};

export async function initPg() {
  try {
    await connectPg();
    await PgClient.query(`
      CREATE EXTENSION IF NOT EXISTS vector;
      CREATE TABLE IF NOT EXISTS ${PgDatasetTableName} (
          id BIGSERIAL PRIMARY KEY,
          vector VECTOR(1536) NOT NULL,
          user_id VARCHAR(50) NOT NULL,
          kb_id VARCHAR(50),
          source VARCHAR(100),
          file_id VARCHAR(100),
          q TEXT NOT NULL,
          a TEXT
      );
      CREATE INDEX IF NOT EXISTS modelData_userId_index ON ${PgDatasetTableName} USING HASH (user_id);
      CREATE INDEX IF NOT EXISTS modelData_kbId_index ON ${PgDatasetTableName} USING HASH (kb_id);
      CREATE INDEX IF NOT EXISTS idx_model_data_md5_q_a_user_id_kb_id ON ${PgDatasetTableName} (md5(q), md5(a), user_id, kb_id);
    `);
    console.log('init pg successful');
  } catch (error) {
    addLog.error('init pg error', error);
  }
}

import { Client as PgClient } from 'pg'; // PostgreSQL 客户端
import mysql from 'mysql2/promise'; // MySQL 客户端

type Props = {
  databaseType: string;
  host: string;
  port: string;
  databaseName: string;
  user: string;
  password: string;
  sql: string;
};

type Response = Promise<{
  result: any; // 根据你的 SQL 查询结果类型调整
}>;

const main = async ({
  databaseType,
  host,
  port,
  databaseName,
  user,
  password,
  sql
}: Props): Response => {
  let result;

  try {
    if (databaseType === 'PostgreSQL') {
      const client = new PgClient({
        host,
        port: parseInt(port, 10),
        database: databaseName,
        user,
        password
      });

      await client.connect();
      const res = await client.query(sql);
      result = res.rows;
      await client.end();
    } else if (databaseType === 'MySQL') {
      const connection = await mysql.createConnection({
        host,
        port: parseInt(port, 10),
        database: databaseName,
        user,
        password
      });

      const [rows] = await connection.execute(sql);
      result = rows;
      await connection.end();
    }
    return {
      result
    };
  } catch (error: unknown) {
    // 使用类型断言来处理错误
    if (error instanceof Error) {
      console.error('Database query error:', error.message);
      return Promise.reject(error.message);
    }
    console.error('Database query error:', error);
    return Promise.reject('An unknown error occurred');
  }
};

export default main;

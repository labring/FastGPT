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
  executionResult: any;
  executionSQL: string;
}>;

const handleError = (
  error: unknown,
  sql: string
): { executionResult: string; executionSQL: string } => {
  if (error instanceof Error) {
    return {
      executionResult: `错误信息: ${error.message}`,
      executionSQL: sql
    };
  } else {
    return {
      executionResult: '未知错误，请查看fastgpt日志',
      executionSQL: sql
    };
  }
};

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
      executionResult: result,
      executionSQL: sql
    };
  } catch (error: unknown) {
    return handleError(error, sql);
  }
};

export default main;

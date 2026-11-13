import mysql, { type RowDataPacket } from 'mysql2/promise';

/**
 * MySQL 协议测试设施放在持有 mysql2 依赖的 service workspace。
 * 仅创建调用方生成的独立测试库；关闭时只回收该库，不接触连接串中原有数据库。
 */
export const createMysqlFullTextTestTarget = async (address: string, database: string) => {
  const url = new URL(address);
  url.pathname = '/';
  const admin = await mysql.createConnection(url.toString());
  try {
    await admin.query(`CREATE DATABASE ${database} CHARACTER SET utf8mb4`);
  } catch (error) {
    await admin.end();
    throw error;
  }
  url.pathname = `/${database}`;
  const pool = mysql.createPool({ uri: url.toString(), connectionLimit: 4, charset: 'utf8mb4' });
  return {
    pool,
    query: async (sql: string, values?: unknown[]) => {
      const [rows] = await pool.query<RowDataPacket[]>(sql, values);
      return rows;
    },
    close: async () => {
      await pool.end();
      try {
        await admin.query(`DROP DATABASE ${database}`);
      } finally {
        await admin.end();
      }
    }
  };
};

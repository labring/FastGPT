import { Sequelize, Dialect } from 'sequelize';
import { parseConnectionString } from '@/service/utils/tools';

export function sqlz_connect(connectionString: string): Sequelize {
  const db_config = parseConnectionString(connectionString);

  return new Sequelize(
    db_config.database as string,
    db_config.username as string,
    db_config.password,
    {
      host: db_config.host,
      dialect: db_config.prefix as Dialect | undefined,
      dialectOptions: {
        encrypt: false,
        enableArithAbort: true
      },
      pool: {
        max: 5,
        min: 0,
        idle: 10000
      },
      timezone: '+08:00'
    }
  );
}
export function rows_to_markdown(_rows: object[]): string {
  const _header = Object.keys(_rows[0] as object); // 提取第一行的键作为表头
  return [
    `| ${_header.join(' | ')} |`,
    `| ${_header.map(() => '---').join(' | ')} |`,
    ..._rows.map((_row) => `| ${Object.values(_row as object).join(' | ')} |`)
  ].join('\n'); // 将结果转换为带有表头的 Markdown 表格形式的字符串
}

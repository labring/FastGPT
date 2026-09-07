import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

/**
 * 一次性清理废弃的团队成员角色。默认只统计；只删除非 owner 的 role 字段。
 * 不删除成员、不修改权限，不触发 Mongoose hooks 或索引同步；重复执行安全。
 */
export async function cleanupTeamMemberRole(db, { apply = false } = {}) {
  const members = db.collection('team_members');
  const filter = { role: { $exists: true, $ne: 'owner' } };
  const before = await members.countDocuments(filter);
  if (!apply) return { dryRun: true, before, modified: 0, remaining: before };

  const result = await members.updateMany(filter, { $unset: { role: '' } });
  const remaining = await members.countDocuments(filter);
  return { dryRun: false, before, modified: result.modifiedCount, remaining };
}

/** CLI 显式选择数据库并二次确认名称，避免误用 URI 的默认数据库；不打印连接凭据。 */
async function main() {
  const { values } = parseArgs({
    options: {
      db: { type: 'string' },
      apply: { type: 'boolean', default: false },
      'confirm-db': { type: 'string' }
    }
  });
  if (!process.env.MONGODB_URI || !values.db) {
    throw new Error('Required: MONGODB_URI environment variable and --db <database>');
  }
  if (['admin', 'local', 'config'].includes(values.db)) {
    throw new Error('System databases are not allowed');
  }
  if (values.apply && values['confirm-db'] !== values.db) {
    throw new Error('--apply requires --confirm-db matching --db');
  }
  const require = createRequire(new URL('../packages/service/package.json', import.meta.url));
  const mongoose = require('mongoose');
  const connection = mongoose.createConnection(process.env.MONGODB_URI, {
    dbName: values.db,
    autoIndex: false,
    autoCreate: false,
    serverSelectionTimeoutMS: 10000
  });
  try {
    await connection.asPromise();
    const result = await cleanupTeamMemberRole(connection.db, { apply: values.apply });
    console.log(JSON.stringify({ database: values.db, collection: 'team_members', ...result }));
    if (values.apply && result.remaining !== 0) process.exitCode = 1;
  } finally {
    await connection.close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(() => {
    // 驱动异常可能包含连接信息，不输出原始错误及 URI。
    console.error(
      'Cleanup failed. Check arguments, database confirmation, connection and permissions.'
    );
    process.exitCode = 1;
  });
}

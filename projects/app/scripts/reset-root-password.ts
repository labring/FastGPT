#!/usr/bin/env node
import { createRootPasswordUpdate, resolveRootPasswordArgument } from './reset-root-password-utils';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

export { createRootPasswordUpdate, resolveRootPasswordArgument } from './reset-root-password-utils';

/** 重置 root 密码；不再自动将状态置为 inactive，不影响已激活账号。 */
export const resetRootPassword = async (password: string) => {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('缺少 MONGODB_URI 环境变量');
  if (!password) throw new Error('root 密码不能为空');

  // mongodb 是 service workspace 的传递依赖；类型检查在 app workspace 中无法解析，但 esbuild 会内联该动态导入。
  // @ts-expect-error The app workspace consumes mongodb through @fastgpt/service.
  const { MongoClient } = await import('mongodb');
  const client = new MongoClient(uri);
  try {
    await client.connect();
    const result = await client.db().collection('users').updateOne(
      { username: 'root' },
      createRootPasswordUpdate(password)
    );
    if (result.matchedCount !== 1) throw new Error('root 用户不存在');
  } finally {
    await client.close();
  }
};

/** 必须接受一个密码参数；不再支持省略或默认密码。 */
const main = async () => {
  if (process.env.RESET_ROOT_PASSWORD_SELFTEST === '1') {
    process.stdout.write('reset-root-password ready\n');
    return;
  }

  const password = resolveRootPasswordArgument(process.argv.slice(2));
  await resetRootPassword(password);
  process.stdout.write('root 密码已重置\n');
};

const isEntryPoint =
  typeof __filename === 'string'
    ? __filename === process.argv[1]
    : Boolean(process.argv[1]) && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isEntryPoint) {
  main().catch((error) => {
    process.stderr.write(`重置 root 密码失败：${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}

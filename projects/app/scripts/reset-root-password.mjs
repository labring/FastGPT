#!/usr/bin/env node
/**
 * 在容器内重置指定用户的密码，无需重启服务、无需改动环境变量。
 *
 * 本文件是源码，镜像里跑的是 scripts/build-cli-scripts.ts 用 esbuild 打出来的自包含产物
 * （`scripts/dist/reset-root-password.cjs`），改动本文件后需要重新构建产物。
 *
 * - 只写 password / passwordUpdateTime / mustChangePassword 三个字段；
 * - 目标账号不存在时报错退出，不静默创建。
 *
 * 用法（容器内）：
 *   docker exec -e ROOT_PSW='Xxx@12345' fastgpt node /app/scripts/reset-root-password.cjs
 *   docker exec -i fastgpt node /app/scripts/reset-root-password.cjs --stdin < ./new-psw.txt
 *   docker exec -e ROOT_PSW='...' fastgpt node /app/scripts/reset-root-password.cjs --dry-run
 */
import { createHash } from 'node:crypto';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

const loadMongoClient = async () => (await import('mongodb')).MongoClient;

/** 与 packages/service/support/user/schema.ts 的 hashStr 保持一致。 */
const hashStr = (value) => createHash('sha256').update(value).digest('hex');

/** 算出 users.password 字段应存的摘要。 */
export const computeStoredPasswordHash = (plaintext) => hashStr(hashStr(plaintext));

/** 与 @fastgpt/global/common/string/password 的 checkPasswordRule 保持一致（单测锁定）。 */
export const checkPasswordRule = (password) => {
  const patterns = [
    /\d/, // 数字
    /[a-z]/, // 小写字母
    /[A-Z]/, // 大写字母
    /[!@#$%^&*()_+=.,:;?\/\\|`~"'<>{}\[\]-]/ // 特殊字符
  ];
  const validChars = /^[\dA-Za-z!@#$%^&*()_+=.,:;?\/\\|`~"'<>{}\[\]-]{8,100}$/;
  if (!validChars.test(password)) return false;
  return patterns.filter((pattern) => pattern.test(password)).length >= 2;
};

const HELP = `重置用户密码（容器内执行）

用法：
  node reset-root-password.cjs [选项]                        镜像内的打包产物
  node projects/app/scripts/reset-root-password.mjs [选项]   源码（本地开发）

密码来源（二选一，优先 stdin）：
  --stdin            从标准输入读取密码
  ROOT_PSW=<密码>    从环境变量读取

选项：
  --user <name>      目标用户名，默认 root
  --dry-run          只打印将要执行的变更，不写库
  --force            跳过密码强度校验
  --help, -h         显示本帮助

示例：
  docker exec -e ROOT_PSW='Xxx@12345' <容器> node /app/scripts/reset-root-password.cjs
  docker exec -i <容器> node /app/scripts/reset-root-password.cjs --stdin < ./new-psw.txt
`;

export const parseArgs = (argv) => {
  const options = { user: 'root', stdin: false, dryRun: false, force: false, help: false };
  const args = argv[0] === '--' ? argv.slice(1) : argv;

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--stdin') options.stdin = true;
    else if (arg === '--dry-run') options.dryRun = true;
    else if (arg === '--force') options.force = true;
    else if (arg === '--user') {
      options.user = args[i + 1];
      if (!options.user) throw new Error('--user 需要一个用户名');
      i += 1;
    } else if (arg === '--help' || arg === '-h') options.help = true;
    else throw new Error(`未知参数：${arg}`);
  }

  return options;
};

const readStdin = async () => {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8').trim();
};

const resolvePassword = async ({ stdin }) => {
  const password = stdin ? await readStdin() : (process.env.ROOT_PSW ?? '').trim();
  if (!password) {
    throw new Error('未提供密码：请使用 --stdin 或设置 ROOT_PSW 环境变量');
  }
  return password;
};

/**
 * 对给定的 users 集合执行一次密码重置，返回结构化结果。
 *
 * 抽成独立函数（而不是塞进 main）是为了让单测用假集合覆盖
 * 「--dry-run 不写库」和「目标账号不存在时报错」两条边界，无需真实 Mongo。
 *
 * @param users 目标集合，仅使用 findOne / updateOne 两个方法。
 * @returns 写入结果；dryRun 时返回 { dryRun: true } 且不产生任何写操作。
 */
export const resetUserPassword = async ({ users, username, password, dryRun = false }) => {
  const storedHash = computeStoredPasswordHash(password);
  // 脚本不产生「必须改密」状态：强度由入口校验（弱口令须显式 --force），重置即运维确认口令的终态。
  // 仍显式写 false（而非省略字段），用于清掉历史遗留的标记。
  const mustChangePassword = false;

  const target = await users.findOne({ username }, { projection: { _id: 1 } });
  if (!target) {
    // 刻意不创建：异常环境里凭空造出超级管理员比失败更危险。
    throw new Error(`用户不存在：${username}`);
  }

  if (dryRun) return { dryRun: true, username, mustChangePassword };

  const result = await users.updateOne(
    { _id: target._id },
    {
      $set: {
        password: storedHash,
        passwordUpdateTime: new Date(),
        mustChangePassword
      }
    }
  );
  if (result.matchedCount !== 1) throw new Error('密码写入失败：未匹配到目标用户');

  return { dryRun: false, username, mustChangePassword };
};

const main = async () => {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(HELP);
    return;
  }

  const password = await resolvePassword(options);
  if (!checkPasswordRule(password) && !options.force) {
    throw new Error(
      '密码不满足强度要求（8-100 位，且至少包含数字/小写/大写/特殊字符中的两类）。' +
        '如确认要使用弱口令，请追加 --force'
    );
  }

  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('缺少 MONGODB_URI 环境变量');

  const MongoClient = await loadMongoClient();
  const client = new MongoClient(uri);

  try {
    await client.connect();
    const result = await resetUserPassword({
      users: client.db().collection('users'),
      username: options.user,
      password,
      dryRun: options.dryRun
    });

    if (result.dryRun) {
      process.stdout.write(
        `[dry-run] 将重置用户 ${result.username} 的密码，并将 mustChangePassword 置为 ${result.mustChangePassword}\n`
      );
      return;
    }

    process.stdout.write(
      JSON.stringify({
        event: 'reset-password',
        user: result.username,
        mustChangePassword: result.mustChangePassword,
        appliedAt: new Date().toISOString(),
        note: 'existing sessions are intentionally kept valid'
      }) + '\n'
    );
  } finally {
    await client.close();
  }
};

// 仅在被当作入口执行时跑 main：被单测 import、或产物被 require 时都不应产生副作用（如连 Mongo）。
//
// ESM（源码直跑 / vitest import）看 import.meta.url，但 esbuild 打包成 CJS 后该对象被置空
// （url 为 undefined），只比对它会让镜像里的产物静默地什么都不做，因此 CJS 下改用 __filename。
// 打包期由 scripts/build-cli-scripts.ts 跑一次 --help 兜底，避免这个分支将来又失效。
const isEntryPoint =
  typeof __filename === 'string'
    ? __filename === process.argv[1]
    : Boolean(process.argv[1]) && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isEntryPoint) {
  main().catch((error) => {
    process.stderr.write(
      `重置密码失败：${error instanceof Error ? error.message : String(error)}\n`
    );
    process.exitCode = 1;
  });
}

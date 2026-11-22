/**
 * Stage F2-2：为 Playwright 浏览器 E2E 生成登录态 storageState。
 *
 * 复用 F1 的登录态预热方式：
 *   1) 在测试库确认 root 用户处于 active，并读取 userId/teamId/tmbId
 *   2) 生成随机 sid，向 Redis 写入 `fastgpt:session:<userId>:<sid>`（7 天）
 *   3) 生成 Playwright storageState JSON（cookie `fastgpt_token`，domain 取 FASTGPT 基址主机）
 *
 * 安全：
 *   - 不打印、不落盘任何明文会话值；只输出 cookie 的 sha256 前 16 位指纹。
 *   - storageState 文件权限 0600，位于仓库外的 plans/e2e-ui/，不会被提交。
 *   - 随机 sid 每次运行重新生成，测试环境使用本地随机密钥（env.fastgpt 由平台注入）。
 *
 * 用法：
 *   node test/e2e/mcpOAuth/prepareUiAuth.mjs
 * 环境变量：
 *   UI_FASTGPT_BASE_URL   默认 https://203.0.113.10:3005（必须与 FE_DOMAIN 同源）
 *   UI_PLANS_DIR          默认 <task>/plans/e2e-ui
 *   UI_STORAGE_STATE      默认 <UI_PLANS_DIR>/storage-state.json
 *   UI_MONGO_CONTAINER    默认 fastgpt-mongo
 *   UI_REDIS_CONTAINER    默认 fastgpt-redis
 *   UI_MONGO_DB           默认从 MONGODB_URI 读取，否则 fastgpt_e2e_oauth
 *   UI_ENV_FILE           默认 <task>/plans/e2e-real/env.fastgpt（只读取非敏感项用于推导库名）
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const ROOT = path.resolve(import.meta.dirname, '../../..');
const PLANS_DIR = process.env.UI_PLANS_DIR || path.resolve(ROOT, '../../plans/e2e-real-v24');
const BASE_URL = (process.env.UI_FASTGPT_BASE_URL || 'https://203.0.113.10:3005').replace(/\/+$/, '');
const STORAGE_STATE =
  process.env.UI_STORAGE_STATE || path.join(PLANS_DIR, 'storage-state.json');
const ENV_FILE = process.env.UI_ENV_FILE || path.resolve(ROOT, '../../plans/e2e-real-v24/env.fastgpt');
const MONGO_CONTAINER = process.env.UI_MONGO_CONTAINER || 'fastgpt-mongo';
const REDIS_CONTAINER = process.env.UI_REDIS_CONTAINER || 'fastgpt-redis';

const sha256_16 = (value) =>
  crypto.createHash('sha256').update(String(value)).digest('hex').slice(0, 16);

const readEnvFile = () => {
  try {
    const text = fs.readFileSync(ENV_FILE, 'utf8');
    const result = {};
    for (const line of text.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const index = trimmed.indexOf('=');
      if (index <= 0) continue;
      const key = trimmed.slice(0, index).trim();
      let value = trimmed.slice(index + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      result[key] = value;
    }
    return result;
  } catch {
    return {};
  }
};

const envFile = readEnvFile();
const mongoUri = envFile.MONGODB_URI || process.env.MONGODB_URI || '';
let mongoDb = process.env.UI_MONGO_DB || '';
if (!mongoDb && mongoUri) {
  try {
    const pathname = new URL(mongoUri).pathname.replace(/^\//, '');
    if (pathname) mongoDb = pathname.split('?')[0];
  } catch {
    /* 交给默认值 */
  }
}
mongoDb = mongoDb || 'fastgpt_e2e_oauth';

const docker = (args) =>
  execFileSync('sudo', ['-n', 'docker', ...args], {
    encoding: 'utf8',
    timeout: 30000
  }).trim();

const seedSession = () => {
  const evalScript = `
    const u = db.users.findOne({ username: 'root' });
    if (!u) throw new Error('root user missing (先运行 F1: runRealStack.sh + oauthRealE2E.mjs)');
    db.users.updateOne({ _id: u._id }, { $set: { status: 'active' } });
    const t = db.teams.findOne({});
    const m = db.team_members.findOne({ userId: u._id });
    if (!t || !m) throw new Error('team/team_member missing');
    print(JSON.stringify({
      userId: String(u._id),
      teamId: String(t._id),
      tmbId: String(m._id)
    }));
  `;
  const out = docker([
    'exec',
    MONGO_CONTAINER,
    'mongosh',
    `mongodb://127.0.0.1:27017/${mongoDb}?replicaSet=rs0`,
    '--quiet',
    '--eval',
    evalScript
  ]);
  const parsed = JSON.parse(
    out
      .trim()
      .split('\n')
      .filter((line) => line.startsWith('{'))
      .pop()
  );

  const sid = crypto.randomBytes(16).toString('hex');
  const sessionKey = `${parsed.userId}:${sid}`;
  const redisKey = `fastgpt:session:${sessionKey}`;
  docker([
    'exec',
    REDIS_CONTAINER,
    'redis-cli',
    'HSET',
    redisKey,
    'userId',
    parsed.userId,
    'teamId',
    parsed.teamId,
    'tmbId',
    parsed.tmbId,
    'isRoot',
    '1',
    'createdAt',
    String(Date.now()),
    'ip',
    '127.0.0.1'
  ]);
  docker(['exec', REDIS_CONTAINER, 'redis-cli', 'EXPIRE', redisKey, '604800']);

  return {
    ...parsed,
    sessionKeyLength: sessionKey.length,
    sessionFingerprint: sha256_16(sessionKey),
    cookieValue: sessionKey
  };
};

const main = () => {
  const host = new URL(BASE_URL).hostname;
  const seeded = seedSession();

  const storageState = {
    cookies: [
      {
        name: 'fastgpt_token',
        value: seeded.cookieValue,
        domain: host,
        path: '/',
        expires: -1,
        httpOnly: true,
        secure: false,
        sameSite: 'Lax'
      }
    ],
    origins: []
  };

  fs.mkdirSync(path.dirname(STORAGE_STATE), { recursive: true, mode: 0o700 });
  fs.writeFileSync(STORAGE_STATE, JSON.stringify(storageState, null, 2), { mode: 0o600 });
  fs.chmodSync(STORAGE_STATE, 0o600);

  console.log(
    JSON.stringify(
      {
        ok: true,
        baseUrl: BASE_URL,
        cookieDomain: host,
        userId: seeded.userId,
        teamId: seeded.teamId,
        tmbId: seeded.tmbId,
        session: {
          length: seeded.sessionKeyLength,
          fingerprint: seeded.sessionFingerprint
        },
        storageState: STORAGE_STATE
      },
      null,
      2
    )
  );
};

main();

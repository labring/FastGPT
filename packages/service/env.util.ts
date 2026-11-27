import type { StorageVendor } from '@fastgpt/global/common/system/config/schemas/storage';

const TEST_INVOKE_TOKEN_SECRET = 'fastgpt_test_invoke_token_secret_32';
const TEST_PRO_TOKEN = 'fastgpt_test_pro_token_32_chars_min';
/**
 * 测试套件会在多个 workspace（包含 pro/admin 子模块）里直接导入 serviceEnv。
 * INVOKE_TOKEN_SECRET 生产启动要求显式配置；PRO_TOKEN 仅在启用 Pro 内部调用时配置。
 * 仅 Vitest/测试环境允许注入稳定测试密钥，避免每个测试项目都重复维护同一组运行时密钥。
 */
export const getRuntimeEnv = (): NodeJS.ProcessEnv => ({
  ...process.env,
  // 与 Git 展示使用相同的版本边界：只按 PRO_URL 判断，不读取 License；开源版忽略原值。
  SHOW_OUTLINK_BRAND: process.env.PRO_URL ? process.env.SHOW_OUTLINK_BRAND : 'true',
  INVOKE_TOKEN_SECRET:
    process.env.INVOKE_TOKEN_SECRET ??
    (process.env.VITEST === 'true' || process.env.NODE_ENV === 'test'
      ? TEST_INVOKE_TOKEN_SECRET
      : undefined),
  PRO_TOKEN:
    process.env.PRO_TOKEN ??
    (process.env.VITEST === 'true' || process.env.NODE_ENV === 'test' ? TEST_PRO_TOKEN : undefined)
});

/* ===== S3 ===== */
/** 只校验对象存储基础设施 ENV；下载模式、external endpoint、CDN 的约束由实例配置校验负责。 */
export const validateS3Env = (env: {
  STORAGE_VENDOR: StorageVendor;
  STORAGE_R2_PUBLIC_ENDPOINT?: string;
}): void => {
  if (env.STORAGE_VENDOR === 'r2' && !env.STORAGE_R2_PUBLIC_ENDPOINT) {
    throw new Error(
      'Invalid S3 environment variables: STORAGE_R2_PUBLIC_ENDPOINT is required when STORAGE_VENDOR is r2.'
    );
  }
};

/**
 * 校验 Agent 用户初始化环境变量。
 * 当配置了 AGENT_USERS 时，必须提供初始密码 DEFAULT_AGENT_PSW。
 */
export const validateAgentUsersEnv = (env: {
  AGENT_USERS?: string;
  DEFAULT_AGENT_PSW?: string;
}): void => {
  const agentUsernames = env.AGENT_USERS?.split(',')
    .map((username) => username.trim())
    .filter(Boolean);

  if (agentUsernames?.length && !env.DEFAULT_AGENT_PSW) {
    throw new Error(
      'Invalid environment configuration: DEFAULT_AGENT_PSW is required when AGENT_USERS is configured.'
    );
  }
};

const assertValidMysqlUri = ({ name, value }: { name: string; value: string }): void => {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(
      `Invalid database environment variables: ${name} must be a valid mysql:// URL.`
    );
  }

  if (parsed.protocol !== 'mysql:' || parsed.hostname.length === 0) {
    throw new Error(
      `Invalid database environment variables: ${name} must be a valid mysql:// URL.`
    );
  }
};

/**
 * 校验主业务数据库方言及 OceanBase 业务连接串。
 * OceanBase 业务库与向量库（`OCEANBASE_URL` / `SEEKDB_URL`）严格物理隔离，严禁回退复用向量库连接串；
 * 报错信息仅输出环境变量名，严禁泄露包含凭据的原始连接串。
 */
export const validateDbEnv = (env: {
  DB_DIALECT: 'mongo' | 'oceanbase';
  OCEANBASE_DB_URI?: string;
  OCEANBASE_LOG_DB_URI?: string;
  OCEANBASE_DB_READ_URI?: string;
}): void => {
  if (env.DB_DIALECT === 'oceanbase' && !env.OCEANBASE_DB_URI) {
    throw new Error(
      'Invalid database environment variables: OCEANBASE_DB_URI is required when DB_DIALECT is oceanbase (vector DB OCEANBASE_URL / SEEKDB_URL cannot be used as fallback).'
    );
  }

  for (const [name, value] of [
    ['OCEANBASE_DB_URI', env.OCEANBASE_DB_URI],
    ['OCEANBASE_LOG_DB_URI', env.OCEANBASE_LOG_DB_URI],
    ['OCEANBASE_DB_READ_URI', env.OCEANBASE_DB_READ_URI]
  ] as const) {
    if (value !== undefined) {
      assertValidMysqlUri({ name, value });
    }
  }
};

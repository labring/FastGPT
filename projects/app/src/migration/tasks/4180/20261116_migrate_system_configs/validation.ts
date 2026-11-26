import { getLogger, LogCategories } from '@fastgpt/service/common/logger';
import { z } from 'zod';
import { BoolSchema } from '@fastgpt/global/common/zod';
import {
  resolveDomainEffectiveConfig,
  type SystemInstanceConfigDomainKey
} from '@fastgpt/global/common/system/config/schema';
import { AgentSandboxProxyConfigSchema } from '@fastgpt/global/common/system/config/schemas/subservice';

const logger = getLogger(LogCategories.SYSTEM.UPGRADE);

export const agentSandboxProxyEnvKeys = {
  wsUrl: 'AGENT_SANDBOX_PROXY_URL',
  previewUrl: 'AGENT_SANDBOX_PREVIEW_PROXY_URL',
  secret: 'AGENT_SANDBOX_PROXY_SECRET'
} as const;

/** 从环境变量或只读 Getter 解析并校验完整的 Agent Sandbox Proxy 配置；缺失或不合法时返回 `undefined`。 */
export const resolveAgentSandboxProxyFromEnv = (
  source: Record<string, unknown> | ((key: string) => unknown) = process.env
): z.output<typeof AgentSandboxProxyConfigSchema> | undefined => {
  const read = (key: string) => (typeof source === 'function' ? source(key) : source[key]);
  const rawWsUrl = read(agentSandboxProxyEnvKeys.wsUrl);
  const rawPreviewUrl = read(agentSandboxProxyEnvKeys.previewUrl);
  const rawSecret = read(agentSandboxProxyEnvKeys.secret);
  const wsUrl = typeof rawWsUrl === 'string' ? rawWsUrl.trim() : '';
  const previewUrl = typeof rawPreviewUrl === 'string' ? rawPreviewUrl.trim() : '';
  const secret = typeof rawSecret === 'string' ? rawSecret : '';
  if (!wsUrl || !previewUrl || secret.length < 32) return undefined;
  const parsed = AgentSandboxProxyConfigSchema.safeParse({ wsUrl, previewUrl, secret });
  return parsed.success ? parsed.data : undefined;
};

const legacyBooleanValues = new Set([
  'true',
  '1',
  'yes',
  'y',
  'on',
  'false',
  '0',
  'no',
  'n',
  'off'
]);

/** 只转换有明确历史语义的布尔值，未知字符串交给迁移保留原值。 */
export const LegacyBooleanSchema = z
  .union([
    z.boolean(),
    z.literal([0, 1]),
    z.string().refine((value) => legacyBooleanValues.has(value.trim().toLowerCase()))
  ])
  .transform((value) => BoolSchema.parse(value));

/** 损坏的安全域不能按空域回填，否则会改写原值并使缺省策略放宽。 */
export const hasDamagedSecurityOverrides = (overrides: unknown): boolean =>
  overrides !== undefined &&
  (overrides === null ||
    typeof overrides !== 'object' ||
    Object.getPrototypeOf(overrides) !== Object.prototype);

/** 迁移保留不符合新保存规则的历史配置，只记录位置；转换与数据库写入错误仍正常失败。 */
export const readMigrationDomainConfig = <T extends SystemInstanceConfigDomainKey>({
  domain,
  overrides
}: {
  domain: T;
  overrides?: unknown;
}) => resolveDomainEffectiveConfig({ domain, overrides, options: { strict: false } });

/** 历史源可按原格式迁入；校验失败只告警，不丢字段、不打印凭据或原始 issue。 */
export const readMigrationConfigValue = <T extends z.ZodType>({
  name,
  schema,
  value
}: {
  name: string;
  schema: T;
  value: unknown;
}): z.output<T> => {
  const result = schema.safeParse(value);
  if (result.success) return result.data;
  logger.warn('Invalid migrated configuration retained for administrator repair', {
    scope: name,
    issues: result.error.issues.map(({ path, code }) => ({ path: path.join('.'), code }))
  });
  return value as z.output<T>;
};

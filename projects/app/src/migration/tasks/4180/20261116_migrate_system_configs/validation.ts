import { getLogger, LogCategories } from '@fastgpt/service/common/logger';
import { z } from 'zod';
import { BoolSchema } from '@fastgpt/global/common/zod';
import {
  resolveDomainEffectiveConfig,
  type SystemInstanceConfigDomainKey
} from '@fastgpt/global/common/system/config/schema';

const logger = getLogger(LogCategories.SYSTEM.UPGRADE);

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

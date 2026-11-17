import type { z } from 'zod';
import {
  resolveDomainEffectiveConfig,
  type SystemInstanceConfigDomainKey
} from '@fastgpt/global/common/system/config/schema';

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
  console.warn('Invalid migrated configuration retained for administrator repair', {
    scope: name,
    issues: result.error.issues.map(({ path, code }) => ({ path: path.join('.'), code }))
  });
  return value as z.output<T>;
};

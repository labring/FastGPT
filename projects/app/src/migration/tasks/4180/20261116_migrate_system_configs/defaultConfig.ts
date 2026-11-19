import { readMigrationDomainConfig, readMigrationConfigValue } from './validation';
import fs from 'node:fs/promises';
import path from 'node:path';
import z from 'zod';
import {
  SYSTEM_INSTANCE_CONFIG_DOMAINS,
  SYSTEM_INSTANCE_CONFIG_SCHEMA_VERSION,
  systemInstanceConfigDomainOverrideSchemaMap,
  type SystemInstanceConfigDomainKey
} from '@fastgpt/global/common/system/config/schema';
import { MongoSystemInstanceConfig } from '@fastgpt/service/common/system/systemInstanceConfig/schema';
import { encryptDomainSecrets } from '@fastgpt/service/common/system/systemInstanceConfig/secrets';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';

type DefaultConfigOverrides = Partial<
  Record<SystemInstanceConfigDomainKey, Record<string, unknown>>
>;

export type DefaultConfigInitialization = {
  overrides: DefaultConfigOverrides;
  explicitDefaultPaths?: Partial<Record<SystemInstanceConfigDomainKey, string[]>>;
};

/**
 * 读取 App 工作目录下可选的首次初始化增量；文件缺失等价于没有自定义默认值。
 * 使用当前实例配置域格式；配置约束失败保留原值并告警，文件读取及 JSON 语法错误仍失败。
 * 调用方必须先确认业务域为空；Pro ENV 不属于文件可配置范围，也不影响首次导入。
 */
export const readDefaultInstanceConfig = async (
  filePath = path.join(process.cwd(), 'defaultConfig.json')
): Promise<DefaultConfigOverrides> => {
  let content: string;
  try {
    content = await fs.readFile(filePath, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return {};
    throw new Error('Unable to read defaultConfig.json');
  }

  let raw: unknown;
  try {
    raw = JSON.parse(content);
  } catch {
    throw new Error('Invalid defaultConfig.json: expected valid JSON');
  }

  const schema = z.strictObject(
    Object.fromEntries(
      SYSTEM_INSTANCE_CONFIG_DOMAINS.map((domain) => [
        domain,
        systemInstanceConfigDomainOverrideSchemaMap[domain].optional()
      ])
    )
  );
  const overrides = readMigrationConfigValue({
    name: 'defaultConfig',
    schema,
    value: raw
  }) as DefaultConfigOverrides;
  for (const domain of SYSTEM_INSTANCE_CONFIG_DOMAINS) {
    if (overrides[domain] === undefined) continue;
    readMigrationDomainConfig({ domain, overrides: overrides[domain] });
  }
  return overrides;
};

/**
 * 仅在业务域为空时原子创建全部业务域；Pro ENV 独立发布，不参与初始化判断。
 * 事务中再次判空，确保并发启动只有一个初始化结果，失败不会留下半套域文档。
 * 已有任意业务域即跳过文件初始化，后续旧版本数据补齐仍由原迁移负责。
 */
export const initializeEmptyInstanceConfig = async ({
  overrides,
  explicitDefaultPaths
}: DefaultConfigInitialization): Promise<SystemInstanceConfigDomainKey[]> => {
  const now = new Date();
  const documents = SYSTEM_INSTANCE_CONFIG_DOMAINS.map((domain) => {
    const domainOverrides = overrides[domain] ?? {};
    readMigrationDomainConfig({ domain, overrides: domainOverrides });
    return {
      domain,
      schemaVersion: SYSTEM_INSTANCE_CONFIG_SCHEMA_VERSION,
      revision: 1,
      overrides: encryptDomainSecrets({ domain, data: domainOverrides }),
      explicitDefaultPaths: explicitDefaultPaths?.[domain] ?? [],
      updatedBy: { actor: 'migration' as const },
      createdAt: now,
      updatedAt: now
    };
  });

  try {
    return await mongoSessionRun(
      async (session) => {
        const count = await MongoSystemInstanceConfig.countDocuments({
          domain: { $in: SYSTEM_INSTANCE_CONFIG_DOMAINS }
        }).session(session);
        if (count > 0) return [];
        // 前面已执行前置 Schema 校验；跳过 Mongoose 终审 validator，避免在代理 backfill 前提前拒绝非 none 沙箱。
        await MongoSystemInstanceConfig.insertMany(documents, {
          session,
          ordered: true,
          lean: true
        });
        return [...SYSTEM_INSTANCE_CONFIG_DOMAINS];
      },
      { readPreference: 'primary' }
    );
  } catch (error) {
    // 不同启动事务可能争抢 domain 唯一键；仅在另一方已完整提交时接受其结果。
    if ((error as { code?: number })?.code === 11000) {
      const count = await MongoSystemInstanceConfig.countDocuments({
        domain: { $in: SYSTEM_INSTANCE_CONFIG_DOMAINS }
      }).read('primary');
      if (count === SYSTEM_INSTANCE_CONFIG_DOMAINS.length) return [];
    }
    throw error;
  }
};

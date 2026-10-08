import { SystemMigrationStatusEnum } from '@fastgpt/global/migration/constants';
import type { SystemMigrationContext } from '../../registry';
import { applyInstanceConfigMigration, inspectInstanceConfigMigration } from './service';

/**
 * 将旧 systemConfigs 集合与 DB 类环境变量迁移到 system_instance_configs。
 * 幂等：目标集合已有文档时跳过写入，重复执行不覆盖管理员后续修改。
 */
export const migrateInstanceConfigs = async (context: SystemMigrationContext) => {
  await context.reportProgress({
    key: 'inspect',
    status: SystemMigrationStatusEnum.running
  });

  const inspection = await inspectInstanceConfigMigration();

  // 已改由环境变量承载的历史字段无法自动搬运，提示部署者手动补充配置
  for (const warning of inspection.envRehomedWarnings) {
    context.logger.warn(`Instance config env re-home required: ${warning}`);
  }

  await context.reportProgress({
    key: 'inspect',
    status: SystemMigrationStatusEnum.succeeded,
    params: {
      existingDomainCount: inspection.existingDomainCount,
      hasLegacyConfig: inspection.hasLegacyConfig
    }
  });

  await context.assertActive();

  // 已初始化过：保留现状，避免覆盖管理员已保存的配置。
  if (inspection.existingDomainCount > 0) {
    context.logger.info('Instance config already initialized, migration skipped', {
      existingDomainCount: inspection.existingDomainCount
    });
    await context.reportProgress({
      key: 'migrate',
      status: SystemMigrationStatusEnum.succeeded,
      params: { migratedDomainCount: 0 }
    });
    // 跳过写入时也必须把声明的 validate 阶段置为 succeeded，
    // 否则 Runner 校验进度步骤会抛错，blockStartup 下持续阻塞节点启动。
    await context.reportProgress({
      key: 'validate',
      status: SystemMigrationStatusEnum.succeeded
    });
    return {
      migratedDomainCount: 0,
      skipped: true
    };
  }

  await context.reportProgress({
    key: 'migrate',
    status: SystemMigrationStatusEnum.running
  });

  const result = await applyInstanceConfigMigration({
    overrides: inspection.overrides,
    logger: context.logger
  });

  await context.reportProgress({
    key: 'migrate',
    status: SystemMigrationStatusEnum.succeeded,
    params: { migratedDomainCount: result.migratedCount },
    current: result.migratedCount,
    total: result.domains.length
  });

  await context.assertActive();
  await context.reportProgress({
    key: 'validate',
    status: SystemMigrationStatusEnum.running
  });
  await context.reportProgress({
    key: 'validate',
    status: SystemMigrationStatusEnum.succeeded
  });

  return {
    migratedDomainCount: result.migratedCount,
    skipped: false
  };
};

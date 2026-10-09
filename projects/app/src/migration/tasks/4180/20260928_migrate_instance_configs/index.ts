import { SystemMigrationStatusEnum } from '@fastgpt/global/migration/constants';
import type { SystemMigrationContext } from '../../../registry';
import { applyInstanceConfigMigration, inspectInstanceConfigMigration } from './service';

/**
 * 将旧 systemConfigs 集合与 DB 类环境变量迁移到 system_instance_configs。
 * 幂等：按域补写缺失的 Domain 文档，已存在的不覆盖管理员后续修改；
 * 目标 Domain 全部齐全时整体跳过。
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

  // 旧值不满足当前 Schema 收紧校验的项已被剔除，提示部署者按需重新配置
  for (const warning of inspection.schemaSanitizedWarnings) {
    context.logger.warn(`Instance config sanitized during migration: ${warning}`);
  }

  await context.reportProgress({
    key: 'inspect',
    status: SystemMigrationStatusEnum.succeeded,
    params: {
      existingDomainCount: inspection.existingDomainCount,
      missingDomainCount: inspection.missingDomainCount,
      hasLegacyConfig: inspection.hasLegacyConfig
    }
  });

  await context.assertActive();

  // 迁移目标 Domain 已全部存在：保留现状，避免覆盖管理员已保存的配置。
  // 按域判定（而非 count>0），部分写入失败后重跑仍会补齐缺失 Domain。
  if (inspection.missingDomainCount === 0) {
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

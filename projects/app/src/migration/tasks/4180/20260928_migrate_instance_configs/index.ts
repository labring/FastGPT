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
      pendingBackfillDomainCount: inspection.pendingBackfillDomainCount,
      hasLegacyConfig: inspection.hasLegacyConfig
    }
  });

  await context.assertActive();

  // 迁移目标已全部落库且域内无缺字段：保留现状，避免覆盖管理员已保存的配置。
  // 按域 + 按字段两级判定：部分写入失败后重跑仍会补齐缺失 Domain；
  // 曾被写入过的 Domain 也会补上客户已配置的环境变量，整域跳过会让这些值永久变成默认值。
  if (inspection.missingDomainCount === 0 && inspection.pendingBackfillDomainCount === 0) {
    context.logger.info('Instance config already initialized, migration skipped', {
      existingDomainCount: inspection.existingDomainCount
    });
    await context.reportProgress({
      key: 'migrate',
      status: SystemMigrationStatusEnum.succeeded,
      params: { migratedDomainCount: 0, backfilledDomainCount: 0 }
    });
    // 跳过写入时也必须把声明的 validate 阶段置为 succeeded，
    // 否则 Runner 校验进度步骤会抛错，blockStartup 下持续阻塞节点启动。
    await context.reportProgress({
      key: 'validate',
      status: SystemMigrationStatusEnum.succeeded
    });
    return {
      migratedDomainCount: 0,
      backfilledDomainCount: 0,
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

  // 补写的字段属客户既有配置，逐条落在日志里便于排查"某个值为什么变成了这个"
  if (result.backfilledPaths.length > 0) {
    context.logger.info('Instance config fields backfilled from env/legacy config', {
      backfilledPaths: result.backfilledPaths
    });
  }

  await context.reportProgress({
    key: 'migrate',
    status: SystemMigrationStatusEnum.succeeded,
    params: {
      migratedDomainCount: result.migratedCount,
      backfilledDomainCount: result.backfilledDomains.length
    },
    current: result.migratedCount,
    total: Object.keys(inspection.overrides).length
  });

  await context.assertActive();
  await context.reportProgress({
    key: 'validate',
    status: SystemMigrationStatusEnum.running
  });

  // 终验：重新跑一次 inspect。必须满足「全域落库且无未迁入缺口」，
  // 否则说明存在未消解的冲突或部分写入失败，明确抛错失败，不能用空 validate 冒充成功。
  const postInspection = await inspectInstanceConfigMigration();
  if (postInspection.missingDomainCount > 0 || postInspection.pendingBackfillDomainCount > 0) {
    const remaining = [
      ...postInspection.pendingBackfillPaths,
      ...(postInspection.missingDomainCount > 0
        ? [`${postInspection.missingDomainCount} domains missing`]
        : [])
    ];
    throw new Error(
      `Instance config migration incomplete: ${remaining.join(', ')} failed to migrate`
    );
  }

  await context.reportProgress({
    key: 'validate',
    status: SystemMigrationStatusEnum.succeeded
  });

  return {
    migratedDomainCount: result.migratedCount,
    backfilledDomainCount: result.backfilledDomains.length,
    skipped: false
  };
};

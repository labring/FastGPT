import { SystemMigrationStatusEnum } from '@fastgpt/global/migration/constants';
import type { SystemMigrationContext } from '../../registry';

/**
 * 将旧 system_models 及默认模型标记迁移到新的模型集合。
 * 旧模型数据量较小，因此采用幂等全量重跑且不保存 checkpoint；每次执行都在事务内
 * 按 model 更新同名模型并追加缺失模型，新表独有模型保留，重复执行不会产生重复数据。
 */
export const migrateLegacySystemModels = async (context: SystemMigrationContext) => {
  await context.reportProgress({
    key: 'loading_templates',
    status: SystemMigrationStatusEnum.running
  });

  const [{ loadInstalledModels }, migrationService] = await Promise.all([
    import('@fastgpt/service/core/ai/config/utils'),
    import('./service')
  ]);

  const migrationState = await migrationService.inspectLegacySystemModelMigration();
  const pluginDocuments = await (async () => {
    if (migrationState.sourceCount === 0) {
      return [];
    }

    const [{ preloadModelProviders }, { getPluginSystemModelDocuments }] = await Promise.all([
      // 动态导入避免 migration 基础设施加载时反向拉入整套 AI 模型初始化依赖。
      import('@fastgpt/service/core/app/provider/controller'),
      import('@fastgpt/service/core/ai/config/utils')
    ]);
    await preloadModelProviders();
    // Plugin 只参与损坏旧字段修复，不产生任何预装模型。
    return getPluginSystemModelDocuments();
  })();

  await context.reportProgress({
    key: 'loading_templates',
    status: SystemMigrationStatusEnum.succeeded
  });
  await context.assertActive();
  await context.reportProgress({
    key: 'migrating',
    status: SystemMigrationStatusEnum.running
  });

  const result = await migrationService.bootstrapAIModelsFromLegacy({ pluginDocuments });
  await context.reportProgress({
    key: 'migrating',
    status: SystemMigrationStatusEnum.succeeded
  });

  await context.assertActive();
  await context.reportProgress({
    key: 'reloading_models',
    status: SystemMigrationStatusEnum.running
  });

  await loadInstalledModels();
  await context.reportProgress({
    key: 'reloading_models',
    status: SystemMigrationStatusEnum.succeeded
  });

  context.logger.info('Legacy system model migration completed', result);
  return {
    sourceCount: result.sourceCount,
    targetCount: result.targetCount,
    migratedCount: result.migratedCount
  };
};

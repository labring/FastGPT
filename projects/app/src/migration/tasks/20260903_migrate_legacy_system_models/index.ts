import { SystemMigrationStatusEnum } from '@fastgpt/global/migration/constants';
import type { SystemMigrationContext } from '../../registry';

/**
 * 将旧 system_models 及默认模型标记迁移到新的模型集合。
 * 旧模型数据量较小，因此不保存 checkpoint；每次执行都在事务内按 model 追加缺失模型，
 * 同名模型保留新表 ID 但其余字段以旧表为准，并保留有效默认配置，重复执行不会重复新增数据。
 */
export const migrateLegacySystemModels = async (context: SystemMigrationContext) => {
  await context.reportProgress({
    key: 'loading_templates',
    status: SystemMigrationStatusEnum.running
  });

  const [
    { preloadModelProviders },
    { getPluginSystemModelDocuments, loadInstalledModels, syncPreinstalledSystemModels },
    { bootstrapAIModelsFromLegacy }
  ] = await Promise.all([
    // 动态导入避免 migration 基础设施加载时反向拉入整套 AI 模型初始化依赖。
    import('@fastgpt/service/core/app/provider/controller'),
    import('@fastgpt/service/core/ai/config/utils'),
    import('./service')
  ]);

  await preloadModelProviders();
  // 插件模型文档参与旧记录修复，必须在读取和重建目标集合前准备完成。
  // 即使启动阶段已经初始化过模型，这里仍重新读取一次，避免迁移结果隐式依赖外部缓存快照。
  const pluginDocuments = await getPluginSystemModelDocuments();
  await context.reportProgress({
    key: 'loading_templates',
    status: SystemMigrationStatusEnum.succeeded
  });
  await context.assertActive();
  await context.reportProgress({
    key: 'migrating',
    status: SystemMigrationStatusEnum.running
  });

  const result = await bootstrapAIModelsFromLegacy({ pluginDocuments });
  await context.reportProgress({
    key: 'migrating',
    status: SystemMigrationStatusEnum.succeeded
  });

  await context.assertActive();
  await context.reportProgress({
    key: 'reloading_models',
    status: SystemMigrationStatusEnum.running
  });

  // 迁移追加完成后恢复正常预装流程，并发布完整运行时缓存。
  await syncPreinstalledSystemModels({ pluginDocuments });
  await loadInstalledModels({ pluginDocuments });
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

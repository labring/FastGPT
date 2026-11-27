import { SystemMigrationStatusEnum } from '@fastgpt/global/migration/constants';
import type { SystemMigrationResultData } from '@fastgpt/global/migration/schema';
import type { SystemMigrationContext } from '@/migration/registry';
import { cleanupLegacyAgentEngineConfig, validateLegacyAgentEngineConfigCleaned } from './service';

/**
 * v4.18.0 独立后台清理历史 `feature.agentEngine` 实例配置任务。
 *
 * 恢复策略：采用「幂等全量重跑（不保存 checkpoint）」。
 * 原因：`system_instance_configs` 按配置域唯一存储，`domain: 'feature'` 至多一条文档，
 * 数据规模与耗时均有严格常数上界；字段级 `$unset` / `$pull` 天然幂等，已干净文档只读跳过不递增 `revision`，
 * 任意重试或租约接管均可安全全量复核。
 *
 * 调度模式：`independent: true`，在启动阻塞任务 `20261116_migrate_system_configs` 放行后独立后台执行，
 * 同时覆盖 4.17 首次升级环境与已执行过 `20261116` 的 4.18 灰度/测试环境。
 */
export const cleanupAgentEngineConfig = async (
  context: SystemMigrationContext
): Promise<SystemMigrationResultData> => {
  // 1. 清理阶段：查找并精准剥离 feature 域残留的 overrides.agentEngine 与 explicitDefaultPaths 标记。
  await context.reportProgress({
    key: 'cleanup',
    status: SystemMigrationStatusEnum.running
  });
  context.signal.throwIfAborted();
  await context.assertActive();

  const { cleanedDocumentCount, removedFieldCount } = await cleanupLegacyAgentEngineConfig({
    assertActive: () => context.assertActive(),
    signal: context.signal,
    logger: context.logger
  });

  await context.assertActive();
  await context.reportProgress({
    key: 'cleanup',
    status: SystemMigrationStatusEnum.succeeded,
    current: cleanedDocumentCount,
    total: cleanedDocumentCount
  });

  // 2. 校验阶段：复查主节点确认不再残留任何历史 agentEngine 字段或默认值标记。
  await context.reportProgress({
    key: 'validation',
    status: SystemMigrationStatusEnum.running
  });
  context.signal.throwIfAborted();
  await context.assertActive();

  const validationFailures = await validateLegacyAgentEngineConfigCleaned();
  if (validationFailures.length > 0) {
    await context.fail({
      message: 'Legacy feature.agentEngine configuration cleanup validation failed',
      failedRecords: validationFailures
    });
  }

  await context.assertActive();
  await context.reportProgress({
    key: 'validation',
    status: SystemMigrationStatusEnum.succeeded
  });

  return {
    cleanedDocumentCount,
    removedFieldCount
  };
};

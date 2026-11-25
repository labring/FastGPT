import { SystemMigrationStatusEnum } from '@fastgpt/global/migration/constants';
import type { SystemMigrationContext } from '@/migration/registry';
import {
  backfillModelReasoningEffortList,
  loadPluginReasoningEffortPresets,
  validateBackfilledModelReasoningEffortList
} from './service';

/**
 * 手动触发的模型可用思考等级回填迁移（幂等全量重跑，不使用 checkpoint）：
 * `ai_models` 数据量小且有界，每条回填写入带 CAS 条件不覆盖人工配置，重试或租约接管时直接重跑即可保证确定性与幂等。
 *
 * 阶段顺序：
 * 1. `loadPresets`：从 fastgpt-plugin 拉取最新 LLM 模板预设；未拉取到任何思考等级预设时明确失败（防止插件未升级前误标成功）。
 * 2. `backfill`：按模型名回填未配置 `reasoningEffortList` 的存量系统/团队 LLM，已手工配置的保留不动，并原子递增对应目录修订号。
 * 3. `validation`：全量复验命中预设的存量模型均已具备合法的 `reasoningEffortList`。
 */
export const backfillModelReasoningEffortListMigration = async (
  context: SystemMigrationContext
) => {
  // ==================== 阶段 1：加载插件思考等级预设 ====================
  await context.reportProgress({ key: 'loadPresets', status: SystemMigrationStatusEnum.running });
  await context.assertActive();

  const presetMap = await loadPluginReasoningEffortPresets();
  if (presetMap.size === 0) {
    await context.fail({
      message:
        'No plugin model presets with reasoningEffortList were returned; upgrade fastgpt-plugin before running this migration',
      failedRecords: []
    });
  }

  await context.reportProgress({
    key: 'loadPresets',
    status: SystemMigrationStatusEnum.succeeded,
    current: presetMap.size,
    total: presetMap.size
  });

  // ==================== 阶段 2：回填存量模型思考等级 ====================
  await context.reportProgress({ key: 'backfill', status: SystemMigrationStatusEnum.running });
  await context.assertActive();

  const backfillResult = await backfillModelReasoningEffortList({
    presetMap,
    signal: context.signal,
    assertActive: context.assertActive
  });
  if (backfillResult.failures.length > 0) {
    await context.fail({
      message: 'Some LLM models could not be backfilled; repair invalid records before retrying',
      failedRecords: backfillResult.failures
    });
  }

  await context.assertActive();
  await context.reportProgress({
    key: 'backfill',
    status: SystemMigrationStatusEnum.succeeded,
    current: backfillResult.scannedCount,
    total: backfillResult.scannedCount
  });

  // ==================== 阶段 3：校验回填结果 ====================
  await context.reportProgress({ key: 'validation', status: SystemMigrationStatusEnum.running });
  await context.assertActive();

  const validationFailures = await validateBackfilledModelReasoningEffortList({ presetMap });
  if (validationFailures.length > 0) {
    await context.fail({
      message: 'Model reasoningEffortList backfill validation failed',
      failedRecords: validationFailures
    });
  }

  await context.reportProgress({ key: 'validation', status: SystemMigrationStatusEnum.succeeded });

  return {
    presetCount: presetMap.size,
    scannedCount: backfillResult.scannedCount,
    backfilledCount: backfillResult.backfilledCount,
    skippedCount: backfillResult.skippedCount
  };
};

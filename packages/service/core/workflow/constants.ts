import { getSystemInstanceConfig } from '../../common/system/systemInstanceConfig/controller';
import { logInstanceConfigRead } from '../../common/system/migrationCoverageLog';
import { serviceEnv } from '../../env';

export const getWorkflowMaxRunTimes = (): number => {
  const configured = getSystemInstanceConfig().performance.workflow.maxRunTimes;
  const value = configured ?? serviceEnv.WORKFLOW_MAX_RUN_TIMES;
  logInstanceConfigRead({
    callsite: 'runtime.workflow.constants.getWorkflowMaxRunTimes',
    source: configured === undefined ? 'env-fallback' : 'instance-config',
    fields: [{ path: 'performance.workflow.maxRunTimes', value: configured ?? value }]
  });
  return value;
};

/**
 * @deprecated 模块加载期冻结 env 值，绕过实例配置。保留仅为 pro 子模块既有 import 兼容，
 * 新代码请使用 getWorkflowMaxRunTimes()；pro 侧迁移完成后删除。
 */
export const WORKFLOW_MAX_RUN_TIMES = serviceEnv.WORKFLOW_MAX_RUN_TIMES;

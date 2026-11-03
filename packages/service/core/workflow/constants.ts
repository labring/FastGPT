import { getSystemInstanceConfig } from '../../common/system/systemInstanceConfig/runtime';
import { logInstanceConfigRead } from '../../common/system/migrationCoverageLog';
import { serviceEnv } from '../../env';

/**
 * 工作流最大运行次数。
 * 实例配置是唯一运行时来源；ENV 只在启动迁移时一次性 seed 进 DB，运行期不再兜底。
 */
export const getWorkflowMaxRunTimes = (): number => {
  const value = getSystemInstanceConfig().performance.workflow.maxRunTimes;
  logInstanceConfigRead({
    callsite: 'runtime.workflow.constants.getWorkflowMaxRunTimes',
    fields: [{ path: 'performance.workflow.maxRunTimes', value }]
  });
  return value;
};

/** 循环/并行节点单轮最大执行次数，来源 performance.workflow.maxLoopTimes。 */
export const getWorkflowMaxLoopTimes = (): number => {
  const value = getSystemInstanceConfig().performance.workflow.maxLoopTimes;
  logInstanceConfigRead({
    callsite: 'runtime.workflow.constants.getWorkflowMaxLoopTimes',
    fields: [{ path: 'performance.workflow.maxLoopTimes', value }]
  });
  return value;
};

/** 并行分支最大并发数，来源 performance.workflow.parallelMaxConcurrency。 */
export const getWorkflowParallelMaxConcurrency = (): number => {
  const value = getSystemInstanceConfig().performance.workflow.parallelMaxConcurrency;
  logInstanceConfigRead({
    callsite: 'runtime.workflow.constants.getWorkflowParallelMaxConcurrency',
    fields: [{ path: 'performance.workflow.parallelMaxConcurrency', value }]
  });
  return value;
};

/**
 * @deprecated 模块加载期冻结 env 值，绕过实例配置。保留仅为 pro 子模块既有 import 兼容，
 * 新代码请使用 getWorkflowMaxRunTimes()；pro 侧迁移完成后删除。
 */
export const WORKFLOW_MAX_RUN_TIMES = serviceEnv.WORKFLOW_MAX_RUN_TIMES;

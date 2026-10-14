import { getSystemInstanceConfig } from '../../common/system/systemInstanceConfig/controller';
import { serviceEnv } from '../../env';

export const getWorkflowMaxRunTimes = (): number =>
  getSystemInstanceConfig().performance.workflow.maxRunTimes ?? serviceEnv.WORKFLOW_MAX_RUN_TIMES;

/**
 * @deprecated 模块加载期冻结 env 值，绕过实例配置。保留仅为 pro 子模块既有 import 兼容，
 * 新代码请使用 getWorkflowMaxRunTimes()；pro 侧迁移完成后删除。
 */
export const WORKFLOW_MAX_RUN_TIMES = serviceEnv.WORKFLOW_MAX_RUN_TIMES;

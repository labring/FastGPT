import { getSystemInstanceConfig } from '../../common/system/systemInstanceConfig/controller';
import { serviceEnv } from '../../env';

export const getWorkflowMaxRunTimes = (): number =>
  getSystemInstanceConfig().performance.workflow.maxRunTimes ?? serviceEnv.WORKFLOW_MAX_RUN_TIMES;

export const WORKFLOW_MAX_RUN_TIMES = serviceEnv.WORKFLOW_MAX_RUN_TIMES;

export const WORKFLOW_MAX_RUN_TIMES = process.env.WORKFLOW_MAX_RUN_TIMES
  ? parseInt(process.env.WORKFLOW_MAX_RUN_TIMES)
  : 500;

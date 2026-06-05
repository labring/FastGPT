export { applyPlanUpdate } from './state';
import { createUpdatePlanTool } from './updateTool';
export { shouldRequirePlanFromMessages } from './requirePlan';
export * from './reviser';
export * from './state';

export const updatePlanToolName = 'update_plan';

export const createUpdatePlanAgentTool = () => createUpdatePlanTool(updatePlanToolName);

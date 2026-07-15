export { applyPlanUpdate } from './state';
import { createUpdatePlanTool } from './updateTool';
export * from './reviser';
export * from './state';

export const updatePlanToolName = 'update_plan';

export const createUpdatePlanAgentTool = () => createUpdatePlanTool(updatePlanToolName);

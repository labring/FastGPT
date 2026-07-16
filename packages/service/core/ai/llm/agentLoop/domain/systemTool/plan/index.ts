export { applyPlanUpdate, applySetPlan } from './state';
import { createSetPlanTool, createUpdatePlanTool } from './updateTool';
export * from './reviser';
export * from './state';

export const setPlanToolName = 'set_plan';
export const updatePlanToolName = 'update_plan';

export const createSetPlanAgentTool = () => createSetPlanTool(setPlanToolName);
export const createUpdatePlanAgentTool = () => createUpdatePlanTool(updatePlanToolName);
export const createPlanAgentTools = () => [createSetPlanAgentTool(), createUpdatePlanAgentTool()];

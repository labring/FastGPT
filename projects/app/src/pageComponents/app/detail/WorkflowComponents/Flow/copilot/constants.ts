export const WORKFLOW_COPILOT_TASK_STORAGE_KEY = 'workflow_copilot_generation_task';

export type WorkflowCopilotGenerationTask = {
  appId: string;
  requirement: string;
  model: string;
  createdAt: number;
};

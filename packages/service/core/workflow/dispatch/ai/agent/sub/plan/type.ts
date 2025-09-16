export type AgentPlanStepType = {
  id: string;
  title: string;
  description: string;
};
export type AgentPlanType = {
  task: string;
  steps: AgentPlanStepType[];
};

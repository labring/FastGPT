export type AgentPlanStepType = {
  id: string;
  title: string;
  description: string;
  depends_on?: string[];
  response?: string;
  summary?: string;
};
export type AgentPlanType = {
  task: string;
  steps: AgentPlanStepType[];
  replan?: boolean;
};

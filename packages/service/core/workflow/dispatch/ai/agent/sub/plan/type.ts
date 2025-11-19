export type AgentPlanStepType = {
  id: string;
  title: string;
  description: string;
  depends_on?: string[];
  response?: string;
  summary?: string;
  status?: 'pending' | 'running' | 'completed';
  tools?: {
    id: string;
    name: string;
    avatar?: string;
  }[];
  log?: string;
};
export type AgentPlanType = {
  task: string;
  steps: AgentPlanStepType[];
  replan?: boolean;
};

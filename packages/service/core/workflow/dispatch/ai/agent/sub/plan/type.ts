export type AgentPlanStepType = {
  id: string;
  title: string;
  description: string;
  depends_on?: string[];
  response?: string;
  summary?: string;
};
export type AgentPlanType = {
  // toolId: string; // 标记这个 plan 是哪一个 tool 生成的
  task: string;
  steps: AgentPlanStepType[];
  replan?: boolean;
};

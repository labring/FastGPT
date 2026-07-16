import type { AgentPlanType } from './type';

/** 判断 plan 是否仍包含需要跨轮继续处理的步骤。 */
export const hasUnfinishedAgentPlan = (plan: AgentPlanType) =>
  plan.steps.some(({ status }) => status !== 'done' && status !== 'skipped');

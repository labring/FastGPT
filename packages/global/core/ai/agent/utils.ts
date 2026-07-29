import { AgentAskAnswerPayloadSchema, type AgentPlanType } from './type';

/** 判断 plan 是否仍包含需要跨轮继续处理的步骤。 */
export const hasUnfinishedAgentPlan = (plan: AgentPlanType) =>
  plan.steps.some(({ status }) => status !== 'done' && status !== 'skipped');

/** 解析 Composer 提交的 ask_user 回答；格式错误时回退为空答案。 */
export const parseAgentAskAnswers = (value: string) => {
  try {
    const parsed = AgentAskAnswerPayloadSchema.safeParse(JSON.parse(value));
    return parsed.success ? parsed.data.answers : [];
  } catch {
    return [];
  }
};

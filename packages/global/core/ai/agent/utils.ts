import { AgentAskAnswerPayloadSchema, type AgentAskQuestion, type AgentPlanType } from './type';

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

/** 将多题追问的结构化回答渲染为仅供模型消费的 Markdown tool response。 */
export const formatAgentAskAnswers = ({
  questions,
  answers
}: {
  questions: AgentAskQuestion[];
  answers: string[];
}) =>
  questions
    .map(({ question, options }, index) => {
      const answer = answers[index] ?? '';
      const option = options.find(({ value }) => value === answer);
      const renderedAnswer = (() => {
        if (!answer) return '未回答';
        if (!option) return answer;
        return option.summary === option.value
          ? option.value
          : `${option.summary} - ${option.value}`;
      })();

      return `## 问题 ${index + 1}\n${question}\n\n回答：${renderedAnswer}`;
    })
    .join('\n\n');

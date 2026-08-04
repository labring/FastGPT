import type {
  AgentAskInteractive,
  AgentPlanAskQueryInteractive
} from '@fastgpt/global/core/workflow/template/system/interactive/type';
import { eventBus, EventNameEnum } from '@/web/common/utils/eventbus';
import type { AgentPlanAskResponse } from '@fastgpt/global/core/workflow/template/system/interactive/type';

export const onSendPrompt = (text: string, agentPlanAskResponse?: AgentPlanAskResponse) =>
  eventBus.emit(EventNameEnum.sendQuestion, {
    text,
    agentPlanAskResponse,
    focus: true
  });

/**
 * 把历史单题 ask_user 记录适配成已提交的 Agent Ask，仅用于只读展示。
 * 历史交互不会恢复为可提交状态，也不会参与当前会话的交互流程。
 */
export const adaptLegacyAgentPlanAskToReadonlyAgentAsk = (
  interactive: AgentPlanAskQueryInteractive
): AgentAskInteractive => ({
  type: 'agentAsk',
  askId: interactive.askId,
  params: {
    description: interactive.params.reason ?? '',
    questions: [
      {
        question: interactive.params.content,
        options: interactive.params.options.map((option) => ({
          summary: option,
          value: option
        })),
        answer: interactive.params.answer ?? ''
      }
    ],
    submitted: true
  }
});

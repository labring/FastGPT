import type {
  AgentAskInteractive,
  AgentPlanAskQueryInteractive,
  WorkflowBuilderPreviewAction
} from '@fastgpt/global/core/workflow/template/system/interactive/type';
import { eventBus, EventNameEnum } from '@/web/common/utils/eventbus';
import type { AgentPlanAskResponse } from '@fastgpt/global/core/workflow/template/system/interactive/type';
import type { AgentAskAnswerDetail } from '../../ChatContainer/ChatBox/Input/AgentAskComposer';

export const onSendPrompt = (text: string, agentPlanAskResponse?: AgentPlanAskResponse) =>
  eventBus.emit(EventNameEnum.sendQuestion, {
    text,
    agentPlanAskResponse,
    focus: true
  });

/**
 * 将通用 Agent Ask Composer 的提交结果转换为 Workflow Builder 预览动作。
 *
 * Builder 预览复用了 Agent Ask 的完整导航 UI，其中右上角 X 会产出 `skip`；
 * 在 Builder 语义里它应等价于「取消本次搭建」，否则 Composer 会进入 submitting
 * 但不会真正提交任何 Builder action。
 */
export const resolveWorkflowBuilderPreviewAnswerAction = ({
  actions,
  customAction,
  answerDetail
}: {
  actions: WorkflowBuilderPreviewAction[];
  customAction?: WorkflowBuilderPreviewAction;
  answerDetail?: AgentAskAnswerDetail;
}):
  | {
      action: WorkflowBuilderPreviewAction;
      text?: string;
    }
  | undefined => {
  if (answerDetail?.kind === 'option') {
    const action = actions.find(
      (item) => item.inputMode !== 'text' && item.value === answerDetail.value
    );
    if (!action) return;

    return { action };
  }

  if (answerDetail?.kind === 'custom') {
    const text = answerDetail.value.trim();
    if (!text || !customAction) return;

    return {
      action: customAction,
      text
    };
  }

  if (answerDetail?.kind === 'skip') {
    const cancelAction = actions.find(
      (item) => item.inputMode !== 'text' && item.value === 'cancel'
    );
    if (!cancelAction) return;

    return { action: cancelAction };
  }
};

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
        // AgentPlanAskOption 同时支持纯字符串与带 label/inputMode 的对象形式
        options: interactive.params.options.map((option) => ({
          summary: typeof option === 'string' ? option : option.label,
          value: typeof option === 'string' ? option : option.value
        })),
        answer: interactive.params.answer ?? ''
      }
    ],
    submitted: true
  }
});

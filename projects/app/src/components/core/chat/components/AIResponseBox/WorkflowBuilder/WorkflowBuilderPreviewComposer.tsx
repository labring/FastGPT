import type { AgentAskQuestionInteractive } from '@fastgpt/global/core/workflow/template/system/interactive/type';
import type { WorkflowBuilderPreviewInteractive } from '@fastgpt/global/core/workflow/builder/type';
import React, { useCallback, useMemo, useState } from 'react';
import AgentAskComposer, {
  type AgentAskAnswerDetail
} from '../../../ChatContainer/ChatBox/Input/AgentAskComposer';
import { resolveWorkflowBuilderPreviewAnswerAction } from './utils';
import { useChatInstanceActions } from '../../../ChatContainer/context/chatInstanceActionsContext';

const getPreviewQuestion = (interactive: WorkflowBuilderPreviewInteractive) => {
  const { title, actions } = interactive.params;
  const customAction = actions.find((action) => action.inputMode === 'text');
  const optionActions = actions.filter((action) => action.inputMode !== 'text');
  const question: AgentAskQuestionInteractive = {
    question: title,
    options: optionActions.map((action) => ({
      value: action.value,
      summary: action.label
    })),
    answer: ''
  };

  return { question, customAction };
};

/** 在 ChatBox 底部渲染 Workflow Builder 的确认动作，复用 Agent Ask 的交互样式。 */
export const WorkflowBuilderPreviewComposer = React.memo(function WorkflowBuilderPreviewComposer({
  interactive
}: {
  interactive: WorkflowBuilderPreviewInteractive;
}) {
  const { continueInteractive } = useChatInstanceActions();
  const { answerValue, actions } = interactive.params;
  const [submittedValue, setSubmittedValue] = useState('');
  const effectiveValue = answerValue || submittedValue;
  const isSubmitted = !!effectiveValue;
  const { question, customAction } = useMemo(() => getPreviewQuestion(interactive), [interactive]);

  const onSubmit = useCallback(
    (_answers: string[], details: AgentAskAnswerDetail[]) => {
      const result = resolveWorkflowBuilderPreviewAnswerAction({
        actions,
        customAction,
        answerDetail: details[0]
      });
      if (!result) return;

      setSubmittedValue(result.action.value);
      continueInteractive({
        text: result.text ?? result.action.label,
        agentPlanAskResponse: {
          askId: interactive.previewId,
          optionValue: result.action.value,
          text: result.text
        }
      });
    },
    [actions, continueInteractive, customAction, interactive.previewId]
  );

  if (isSubmitted) {
    return null;
  }

  return (
    <AgentAskComposer
      key={`${interactive.previewId}-${answerValue ?? ''}`}
      questions={[question]}
      customOptionLabel={customAction?.label}
      customOptionPlaceholder={customAction?.inputPlaceholder}
      customAnswerRequired
      showOptionValue={false}
      onSubmit={onSubmit}
    />
  );
});

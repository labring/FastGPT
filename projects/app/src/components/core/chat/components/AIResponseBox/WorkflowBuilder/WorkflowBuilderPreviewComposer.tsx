import type { AgentAskQuestion } from '@fastgpt/global/core/ai/agent/type';
import type { WorkflowBuilderPreviewInteractive } from '@fastgpt/global/core/workflow/builder/type';
import React, { useCallback, useContext, useMemo, useState } from 'react';
import { WorkflowBuilderTrackingContext } from './TrackingContext';
import { webPushTrack } from '@/web/common/middle/tracks/utils';
import AgentAskComposer, {
  type AgentAskAnswerDetail
} from '../../../ChatContainer/ChatBox/Input/AgentAskComposer';
import { resolveWorkflowBuilderPreviewAnswerAction } from './utils';
import { useChatInstanceActions } from '../../../ChatContainer/context/chatInstanceActionsContext';

const getPreviewQuestion = (interactive: WorkflowBuilderPreviewInteractive) => {
  const { title, actions } = interactive.params;
  const customAction = actions.find((action) => action.inputMode === 'text');
  const optionActions = actions.filter((action) => action.inputMode !== 'text');
  const question: AgentAskQuestion = {
    question: title,
    options: optionActions.map((action) => ({
      value: action.value,
      summary: action.label
    }))
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
  const tracking = useContext(WorkflowBuilderTrackingContext);
  const { actions } = interactive.params;
  const [submittedValue, setSubmittedValue] = useState('');
  const isSubmitted = !!submittedValue;
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
        onSend: () => {
          if (!tracking) return;
          const action = {
            confirm: 'preview_confirm',
            revise: 'preview_revise',
            cancel: 'preview_cancel'
          } as const;
          void webPushTrack.workflowBuilder({
            appId: tracking.appId,
            action: action[result.action.value]
          });
        },
        select: {
          type: 'workflowBuilderPreview',
          questions: [
            {
              question: interactive.params.title,
              value: result.text ?? result.action.label
            }
          ]
        }
      });
    },
    [actions, continueInteractive, customAction, interactive.params.title, tracking]
  );

  if (isSubmitted) {
    return null;
  }

  return (
    <AgentAskComposer
      key={interactive.previewId}
      questions={[question]}
      customOptionLabel={customAction?.label}
      customOptionPlaceholder={customAction?.inputPlaceholder}
      customAnswerRequired
      showOptionValue={false}
      onSubmit={onSubmit}
    />
  );
});

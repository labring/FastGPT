import type { AgentAskQuestion } from '@fastgpt/global/core/ai/agent/type';
import type { WorkflowBuilderPreviewInteractive } from '@fastgpt/global/core/workflow/builder/type';
import { parseWorkflowBuilderPreviewArguments } from '@fastgpt/global/core/workflow/builder/utils';
import React, { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'next-i18next';
import AgentAskComposer, {
  type AgentAskAnswerDetail
} from '../../../ChatContainer/ChatBox/Input/AgentAskComposer';
import { resolveWorkflowBuilderPreviewAnswerAction } from './utils';
import { useChatInstanceActions } from '../../../ChatContainer/context/chatInstanceActionsContext';

/** 在 ChatBox 底部渲染 Workflow Builder 的确认动作，复用 Agent Ask 的交互样式。 */
export const WorkflowBuilderPreviewComposer = React.memo(function WorkflowBuilderPreviewComposer({
  interactive
}: {
  interactive: WorkflowBuilderPreviewInteractive;
}) {
  const { continueInteractive } = useChatInstanceActions();
  const { t } = useTranslation();
  const confirmLabel = t('workflow:workflow_builder_preview_confirm');
  const reviseLabel = t('workflow:workflow_builder_preview_revise');
  const cancelLabel = t('workflow:workflow_builder_preview_cancel');
  const [submittedValue, setSubmittedValue] = useState('');
  const isSubmitted = !!submittedValue;
  const payload = useMemo(
    () => parseWorkflowBuilderPreviewArguments(interactive.params.arguments),
    [interactive.params.arguments]
  );
  const question = useMemo<AgentAskQuestion>(
    () => ({
      question: payload?.title ?? '',
      options: [
        { value: 'confirm', summary: confirmLabel },
        { value: 'cancel', summary: cancelLabel }
      ]
    }),
    [payload?.title, confirmLabel, cancelLabel]
  );

  const onSubmit = useCallback(
    (_answers: string[], details: AgentAskAnswerDetail[]) => {
      const result = resolveWorkflowBuilderPreviewAnswerAction({
        answerDetail: details[0]
      });
      if (!result) return;

      setSubmittedValue(result.action);
      continueInteractive({
        select: result
      });
    },
    [continueInteractive]
  );

  if (isSubmitted || !payload) {
    return null;
  }

  return (
    <AgentAskComposer
      key={interactive.previewId}
      questions={[question]}
      customOptionLabel={reviseLabel}
      customOptionPlaceholder={t('workflow:workflow_builder_preview_revise_placeholder')}
      customAnswerRequired
      showOptionValue={false}
      onSubmit={onSubmit}
    />
  );
});

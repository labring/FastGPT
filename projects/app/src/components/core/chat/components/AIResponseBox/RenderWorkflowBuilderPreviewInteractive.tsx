import Markdown from '@/components/Markdown';
import { Box, Flex } from '@chakra-ui/react';
import type {
  AgentAskQuestionInteractive,
  WorkflowBuilderPreviewInteractive
} from '@fastgpt/global/core/workflow/template/system/interactive/type';
import { useTranslation } from 'next-i18next';
import React, { useCallback, useMemo, useState } from 'react';
import AgentAskComposer, {
  type AgentAskAnswerDetail
} from '../../ChatContainer/ChatBox/Input/AgentAskComposer';
import { ChatBoxContext } from '../../ChatContainer/ChatBox/Provider';
import { useContextSelector } from 'use-context-selector';
import { SelectedAnswerText } from '../Interactive/InteractiveChoiceCollapse';
import { onSendPrompt, resolveWorkflowBuilderPreviewAnswerAction } from './utils';

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
  const { answerValue, answerText, actions } = interactive.params;
  const [submittedValue, setSubmittedValue] = useState('');
  const [submittedText, setSubmittedText] = useState('');
  const effectiveValue = answerValue || submittedValue;
  const effectiveText = answerText || submittedText;
  const effectiveAnswer =
    effectiveText || actions.find((action) => action.value === effectiveValue)?.label;
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
      if (result.text) {
        setSubmittedText(result.text);
      }
      onSendPrompt(result.text ?? result.action.label, {
        askId: interactive.previewId,
        optionValue: result.action.value,
        text: result.text
      });
    },
    [actions, customAction, interactive.previewId]
  );

  if (isSubmitted) {
    return effectiveAnswer ? <SelectedAnswerText answer={effectiveAnswer} /> : null;
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

/**
 * Workflow Builder 预览正文（Mermaid + 说明）。待确认时只在消息中展示等待状态，
 * 确认动作统一由 ChatBox 底部的 WorkflowBuilderPreviewComposer 承载。
 */
const RenderWorkflowBuilderPreviewInteractive = React.memo(
  function RenderWorkflowBuilderPreviewInteractive({
    interactive,
    isLastChild
  }: {
    interactive: WorkflowBuilderPreviewInteractive;
    isLastChild: boolean;
  }) {
    const { mermaid, sections, answerValue, answerText, actions } = interactive.params;
    const { t } = useTranslation();
    const boxBodyProps = useContextSelector(ChatBoxContext, (v) => v.boxBodyProps);
    const isSubmitted = !!answerValue || !isLastChild;
    const effectiveAnswer = answerText || actions.find((a) => a.value === answerValue)?.label;

    return (
      <Flex flexDirection={'column'} gap={4} maxW={boxBodyProps?.maxW ?? '760px'}>
        <Markdown source={`\`\`\`mermaid\n${mermaid}\n\`\`\``} showAnimation={false} />
        {sections.map((section, index) => (
          <Box key={`${section.title}-${index}`}>
            <Box mb={1.5} fontWeight={'semibold'}>
              {section.title}
            </Box>
            <Markdown source={section.content} showAnimation={false} />
          </Box>
        ))}

        {isSubmitted ? (
          effectiveAnswer && <SelectedAnswerText answer={effectiveAnswer} />
        ) : (
          <Box color={'myGray.600'}>{t('chat:interactive.agent_ask.waiting')}</Box>
        )}
      </Flex>
    );
  }
);

export default RenderWorkflowBuilderPreviewInteractive;

import Markdown from '@/components/Markdown';
import { Box, Button, Flex, Textarea } from '@chakra-ui/react';
import type { WorkflowBuilderPreviewInteractive } from '@fastgpt/global/core/workflow/template/system/interactive/type';
import LeftRadio from '@fastgpt/web/components/common/Radio/LeftRadio';
import { useTranslation } from 'next-i18next';
import React, { useCallback, useMemo, useState } from 'react';
import { onSendPrompt } from './utils';
import {
  ChoiceCollapseToggleButton,
  SelectedAnswerText,
  useInteractiveChoiceCollapse
} from '../Interactive/InteractiveChoiceCollapse';

const RenderWorkflowBuilderPreviewInteractive = React.memo(
  function RenderWorkflowBuilderPreviewInteractive({
    interactive,
    isLastChild
  }: {
    interactive: WorkflowBuilderPreviewInteractive;
    isLastChild: boolean;
  }) {
    const { t } = useTranslation();
    const { title, mermaid, sections, actions, answerValue, answerText } = interactive.params;
    const [selectedAction, setSelectedAction] = useState('');
    const [feedback, setFeedback] = useState('');
    const [submittedValue, setSubmittedValue] = useState('');
    const [submittedText, setSubmittedText] = useState('');
    const effectiveValue = answerValue || submittedValue;
    const effectiveText = answerText || submittedText;
    const selectedOption = actions.find(
      (action) => action.value === (effectiveValue || selectedAction)
    );
    const effectiveAnswer = effectiveText || selectedOption?.label || '';
    const isDisabled = !!effectiveValue || !isLastChild;
    const {
      isOptionsExpanded,
      selectedAnswerPlacement,
      shouldShowOptions,
      collapseOptions,
      toggleOptionsExpanded
    } = useInteractiveChoiceCollapse(effectiveAnswer);
    const radioOptions = useMemo(
      () =>
        actions.map((action) => ({
          title: (
            <Box fontSize={'sm'} whiteSpace={'pre-wrap'} wordBreak={'break-word'}>
              {action.label}
            </Box>
          ),
          value: action.value
        })),
      [actions]
    );

    const submitRevision = useCallback(() => {
      const text = feedback.trim();
      if (!text || isDisabled) return;

      setSubmittedValue('revise');
      setSubmittedText(text);
      collapseOptions();
      onSendPrompt(text, {
        askId: interactive.previewId,
        optionValue: 'revise',
        text
      });
    }, [collapseOptions, feedback, interactive.previewId, isDisabled]);

    return (
      <Flex flexDirection={'column'} gap={4} maxW={'760px'}>
        <Box fontSize={'lg'} fontWeight={'semibold'}>
          {title}
        </Box>
        <Markdown source={`\`\`\`mermaid\n${mermaid}\n\`\`\``} showAnimation={false} />
        {sections.map((section, index) => (
          <Box key={`${section.title}-${index}`}>
            <Box mb={1.5} fontWeight={'semibold'}>
              {section.title}
            </Box>
            <Markdown source={section.content} showAnimation={false} />
          </Box>
        ))}

        <Box>
          {selectedAnswerPlacement === 'above' && (
            <Box mb={3}>
              <SelectedAnswerText answer={effectiveAnswer} />
            </Box>
          )}
          {shouldShowOptions && (
            <Flex w={'420px'} maxW={'100%'} flexDirection={'column'} gap={3} p={'3px'} mx={'-3px'}>
              <LeftRadio<string>
                px={4}
                py={4}
                gridGap={2}
                align={'center'}
                list={radioOptions}
                value={effectiveValue || selectedAction}
                defaultBg={'white'}
                activeBg={'white'}
                isDisabled={isDisabled}
                onChange={(value) => {
                  if (!value || isDisabled) return;
                  const action = actions.find((item) => item.value === value);
                  if (!action) return;

                  setSelectedAction(action.value);
                  if (action.inputMode === 'text') return;

                  setSubmittedValue(action.value);
                  collapseOptions();
                  onSendPrompt(action.label, {
                    askId: interactive.previewId,
                    optionValue: action.value
                  });
                }}
              />
              {selectedOption?.inputMode === 'text' && (
                <Flex flexDirection={'column'} gap={2}>
                  <Textarea
                    autoFocus={!isDisabled}
                    bg={'white'}
                    rows={3}
                    resize={'vertical'}
                    value={effectiveText || feedback}
                    placeholder={selectedOption.inputPlaceholder}
                    isDisabled={isDisabled}
                    onChange={(event) => setFeedback(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
                        submitRevision();
                      }
                    }}
                  />
                  {!isDisabled && (
                    <Flex justifyContent={'flex-end'}>
                      <Button isDisabled={!feedback.trim()} onClick={submitRevision}>
                        {t('common:Submit')}
                      </Button>
                    </Flex>
                  )}
                </Flex>
              )}
            </Flex>
          )}
          {selectedAnswerPlacement === 'below' && (
            <Box mt={3}>
              <SelectedAnswerText answer={effectiveAnswer} />
            </Box>
          )}
          <ChoiceCollapseToggleButton
            answer={effectiveAnswer}
            isOptionsExpanded={isOptionsExpanded}
            onToggle={toggleOptionsExpanded}
            mt={selectedAnswerPlacement === 'above' && !shouldShowOptions ? 0 : 3}
          />
        </Box>
      </Flex>
    );
  }
);

export default RenderWorkflowBuilderPreviewInteractive;

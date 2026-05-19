import { Box, Button, Flex, Textarea } from '@chakra-ui/react';
import type { AgentPlanAskQueryInteractive } from '@fastgpt/global/core/workflow/template/system/interactive/type';
import LeftRadio from '@fastgpt/web/components/common/Radio/LeftRadio';
import { useTranslation } from 'next-i18next';
import React, { useCallback, useMemo } from 'react';
import { AGENT_PLAN_ASK_OTHER_OPTION_VALUE } from './constants';
import { onSendPrompt } from './utils';

const RenderAgentPlanAskInteractive = React.memo(function RenderAgentPlanAskInteractive({
  interactive,
  isLastChild
}: {
  interactive: AgentPlanAskQueryInteractive;
  isLastChild: boolean;
}) {
  const { t } = useTranslation();
  const { content, reason, options = [], answer } = interactive.params;
  const [otherAnswer, setOtherAnswer] = React.useState('');
  const [isOtherSelected, setIsOtherSelected] = React.useState(false);
  const [submittedAnswer, setSubmittedAnswer] = React.useState('');
  const normalizedOptions = useMemo(
    () => Array.from(new Set(options.map((option) => option.trim()).filter(Boolean))).slice(0, 5),
    [options]
  );
  const effectiveAnswer = answer || submittedAnswer;
  const isDisabled = !!effectiveAnswer || !isLastChild;
  const selectedOption =
    effectiveAnswer && normalizedOptions.includes(effectiveAnswer) ? effectiveAnswer : '';
  const answeredOther =
    effectiveAnswer && !normalizedOptions.includes(effectiveAnswer) ? effectiveAnswer : '';
  const showOtherInput = !!answeredOther || isOtherSelected;
  const radioValue =
    answeredOther || isOtherSelected ? AGENT_PLAN_ASK_OTHER_OPTION_VALUE : selectedOption;
  const currentOtherAnswer = answeredOther || otherAnswer;
  const submitOtherAnswer = useCallback(() => {
    const value = otherAnswer.trim();
    if (!value || isDisabled) return;

    setSubmittedAnswer(value);
    onSendPrompt(value);
  }, [isDisabled, otherAnswer]);
  const radioOptions = useMemo(
    () => [
      ...normalizedOptions.map((option) => ({
        title: (
          <Box fontSize={'sm'} whiteSpace={'pre-wrap'} wordBreak={'break-word'}>
            {option}
          </Box>
        ),
        value: option
      })),
      {
        title: (
          <Box fontSize={'sm'} whiteSpace={'pre-wrap'} wordBreak={'break-word'}>
            {t('common:Other')}
          </Box>
        ),
        value: AGENT_PLAN_ASK_OTHER_OPTION_VALUE
      }
    ],
    [normalizedOptions, t]
  );

  return (
    <Flex flexDirection={'column'} gap={3} maxW={'520px'}>
      <Box fontWeight={'medium'} whiteSpace={'pre-wrap'}>
        {content}
      </Box>
      {reason && (
        <Box fontSize={'sm'} color={'myGray.600'} whiteSpace={'pre-wrap'}>
          {reason}
        </Box>
      )}
      {normalizedOptions.length > 0 && (
        <Flex flexDirection={'column'} gap={3}>
          <LeftRadio<string>
            py={3}
            gridGap={2}
            align={'center'}
            list={radioOptions}
            value={radioValue}
            defaultBg={'white'}
            activeBg={'white'}
            onChange={(value) => {
              if (!value || isDisabled) return;
              if (value === AGENT_PLAN_ASK_OTHER_OPTION_VALUE) {
                setIsOtherSelected(true);
                return;
              }
              setIsOtherSelected(false);
              setSubmittedAnswer(value);
              onSendPrompt(value);
            }}
            isDisabled={isDisabled}
          />
          {showOtherInput && (
            <Flex flexDirection={'column'} gap={2}>
              <Textarea
                autoFocus={!isDisabled}
                bg={'white'}
                rows={3}
                resize={'vertical'}
                value={currentOtherAnswer}
                placeholder={t('common:Other')}
                isDisabled={isDisabled}
                onChange={(e) => setOtherAnswer(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                    submitOtherAnswer();
                  }
                }}
              />
              <Flex justifyContent={'flex-end'}>
                {!isDisabled && (
                  <Button
                    flexShrink={0}
                    isDisabled={!otherAnswer.trim()}
                    onClick={submitOtherAnswer}
                  >
                    {t('common:Submit')}
                  </Button>
                )}
              </Flex>
            </Flex>
          )}
        </Flex>
      )}
    </Flex>
  );
});

export default RenderAgentPlanAskInteractive;

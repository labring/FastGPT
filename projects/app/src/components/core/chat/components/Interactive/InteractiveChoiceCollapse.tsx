import React from 'react';
import { Box, Button } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';

type SelectedAnswerPlacement = 'above' | 'below';

/**
 * 管理交互选项在提交答案后的展示状态。
 * 选中后先保留选项 1 秒用于反馈，再折叠为答案摘要；刷新后如果已有答案则默认折叠。
 */
export const useInteractiveChoiceCollapse = (selectedAnswer?: string) => {
  const [isOptionsExpanded, setIsOptionsExpanded] = React.useState(!selectedAnswer);
  const [selectedAnswerPlacement, setSelectedAnswerPlacement] =
    React.useState<SelectedAnswerPlacement>(selectedAnswer ? 'above' : 'below');
  const collapseTimerRef = React.useRef<ReturnType<typeof setTimeout>>();

  const clearCollapseTimer = React.useCallback(() => {
    if (collapseTimerRef.current) {
      clearTimeout(collapseTimerRef.current);
      collapseTimerRef.current = undefined;
    }
  }, []);

  React.useEffect(() => {
    if (!selectedAnswer) {
      clearCollapseTimer();
      setIsOptionsExpanded(true);
      setSelectedAnswerPlacement('below');
    }
  }, [clearCollapseTimer, selectedAnswer]);

  React.useEffect(() => {
    return () => {
      clearCollapseTimer();
    };
  }, [clearCollapseTimer]);

  const scheduleCollapse = React.useCallback(() => {
    clearCollapseTimer();
    setSelectedAnswerPlacement('below');
    setIsOptionsExpanded(true);
    collapseTimerRef.current = setTimeout(() => {
      setIsOptionsExpanded(false);
      setSelectedAnswerPlacement('above');
      collapseTimerRef.current = undefined;
    }, 1000);
  }, [clearCollapseTimer]);

  const toggleOptionsExpanded = React.useCallback(() => {
    clearCollapseTimer();
    setSelectedAnswerPlacement('above');
    setIsOptionsExpanded((state) => !state);
  }, [clearCollapseTimer]);

  return {
    isOptionsExpanded,
    selectedAnswerPlacement,
    shouldShowOptions: !selectedAnswer || isOptionsExpanded,
    scheduleCollapse,
    toggleOptionsExpanded
  };
};

export const SelectedAnswerText = React.memo(function SelectedAnswerText({
  answer
}: {
  answer?: string;
}) {
  const { t } = useTranslation();

  if (!answer) return null;

  return (
    <Box color={'myGray.500'} fontSize={'sm'} lineHeight={'20px'}>
      {t('chat:interactive.user_select.selected', { answer })}
    </Box>
  );
});

export const ChoiceCollapseToggleButton = React.memo(function ChoiceCollapseToggleButton({
  answer,
  isOptionsExpanded,
  onToggle
}: {
  answer?: string;
  isOptionsExpanded: boolean;
  onToggle: () => void;
}) {
  const { t } = useTranslation();

  if (!answer) return null;

  return (
    <Box mt={3}>
      <Button
        mx={'8px'}
        px={0}
        h={'22px'}
        minW={0}
        variant={'unstyled'}
        color={'primary.600'}
        fontSize={'11px'}
        fontWeight={500}
        lineHeight={'20px'}
        onClick={onToggle}
      >
        {isOptionsExpanded
          ? t('chat:interactive.user_select.collapse_options')
          : t('chat:interactive.user_select.expand_options')}
      </Button>
    </Box>
  );
});

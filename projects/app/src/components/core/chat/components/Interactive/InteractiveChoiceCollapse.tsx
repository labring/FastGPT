import React from 'react';
import { Box, type BoxProps } from '@chakra-ui/react';
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
  const placementTimerRef = React.useRef<ReturnType<typeof setTimeout>>();

  const clearCollapseTimers = React.useCallback(() => {
    if (collapseTimerRef.current) {
      clearTimeout(collapseTimerRef.current);
      collapseTimerRef.current = undefined;
    }
    if (placementTimerRef.current) {
      clearTimeout(placementTimerRef.current);
      placementTimerRef.current = undefined;
    }
  }, []);

  React.useEffect(() => {
    if (!selectedAnswer) {
      clearCollapseTimers();
      setIsOptionsExpanded(true);
      setSelectedAnswerPlacement('below');
    }
  }, [clearCollapseTimers, selectedAnswer]);

  React.useEffect(() => {
    return () => {
      clearCollapseTimers();
    };
  }, [clearCollapseTimers]);

  const scheduleCollapse = React.useCallback(() => {
    clearCollapseTimers();
    setSelectedAnswerPlacement('below');
    setIsOptionsExpanded(true);
    collapseTimerRef.current = setTimeout(() => {
      setIsOptionsExpanded(false);
      collapseTimerRef.current = undefined;
      placementTimerRef.current = setTimeout(() => {
        setSelectedAnswerPlacement('above');
        placementTimerRef.current = undefined;
      }, 240);
    }, 1000);
  }, [clearCollapseTimers]);

  const toggleOptionsExpanded = React.useCallback(() => {
    clearCollapseTimers();
    setSelectedAnswerPlacement('above');
    setIsOptionsExpanded((state) => !state);
  }, [clearCollapseTimers]);

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
  onToggle,
  mt = 3
}: {
  answer?: string;
  isOptionsExpanded: boolean;
  onToggle: () => void;
  mt?: BoxProps['mt'];
}) {
  const { t } = useTranslation();

  if (!answer) return null;

  return (
    <Box
      as="button"
      type="button"
      display={'inline-flex'}
      alignItems={'center'}
      alignSelf={'flex-start'}
      position={'relative'}
      mt={mt}
      mx={'8px'}
      px={0}
      h={'16px'}
      minW={0}
      border={0}
      bg={'transparent'}
      color={'primary.600'}
      cursor={'pointer'}
      fontSize={'11px'}
      fontWeight={500}
      lineHeight={'16px'}
      _before={{
        content: '""',
        position: 'absolute',
        inset: '-6px -8px',
        borderRadius: '6px',
        bg: 'transparent',
        transition: 'background-color 150ms ease'
      }}
      _hover={{
        _before: {
          bg: 'myGray.100'
        }
      }}
      onClick={onToggle}
    >
      <Box as="span" position={'relative'} zIndex={1}>
        {isOptionsExpanded
          ? t('chat:interactive.user_select.collapse_options')
          : t('chat:interactive.user_select.expand_options')}
      </Box>
    </Box>
  );
});

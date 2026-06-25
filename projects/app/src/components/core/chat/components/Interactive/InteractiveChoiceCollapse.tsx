import React from 'react';
import { Box, type BoxProps } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';

type SelectedAnswerPlacement = 'above' | 'below';

/**
 * 管理交互选项在提交答案后的展示状态。
 * 选中后先保留选项 1 秒用于反馈，再折叠为答案摘要；刷新后如果已有答案则默认折叠。
 */
export const useInteractiveChoiceCollapse = (selectedAnswer?: string) => {
  const collapseTimerRef = React.useRef<ReturnType<typeof setTimeout>>();
  const [internalExpanded, setInternalExpanded] = React.useState(() => !selectedAnswer);
  const [internalPlacement, setInternalPlacement] = React.useState<SelectedAnswerPlacement>(() =>
    selectedAnswer ? 'above' : 'below'
  );
  // 无答案时直接派生默认展示，避免在 effect 里同步 setState 触发额外渲染。
  const isOptionsExpanded = selectedAnswer ? internalExpanded : true;
  const selectedAnswerPlacement = selectedAnswer ? internalPlacement : 'below';

  const clearCollapseTimers = React.useCallback(() => {
    if (collapseTimerRef.current) {
      clearTimeout(collapseTimerRef.current);
      collapseTimerRef.current = undefined;
    }
  }, []);

  React.useEffect(() => {
    if (!selectedAnswer) {
      clearCollapseTimers();
    }
  }, [clearCollapseTimers, selectedAnswer]);

  React.useEffect(() => {
    return () => {
      clearCollapseTimers();
    };
  }, [clearCollapseTimers]);

  const scheduleCollapse = React.useCallback(() => {
    clearCollapseTimers();
    setInternalPlacement('below');
    setInternalExpanded(true);
    collapseTimerRef.current = setTimeout(() => {
      setInternalExpanded(false);
      collapseTimerRef.current = undefined;
    }, 1000);
  }, [clearCollapseTimers]);

  const toggleOptionsExpanded = React.useCallback(() => {
    clearCollapseTimers();
    setInternalPlacement('above');
    setInternalExpanded((state) => !state);
  }, [clearCollapseTimers]);

  /** 选项区域收起动画结束后，将答案摘要移到选项上方，避免与硬编码动画时长不同步。 */
  const handleOptionsCollapseExited = React.useCallback(() => {
    if (selectedAnswer) {
      setInternalPlacement('above');
    }
  }, [selectedAnswer]);

  return {
    isOptionsExpanded,
    selectedAnswerPlacement,
    shouldShowOptions: !selectedAnswer || isOptionsExpanded,
    scheduleCollapse,
    toggleOptionsExpanded,
    handleOptionsCollapseExited
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

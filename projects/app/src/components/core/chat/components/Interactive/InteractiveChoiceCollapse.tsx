import React from 'react';
import { Box, type BoxProps } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';

type SelectedAnswerPlacement = 'above' | 'below';

/**
 * 管理交互选项在提交答案后的展示状态。
 * 选中后立即隐藏选项并展示答案摘要；刷新后如果已有答案则默认隐藏选项。
 */
export const useInteractiveChoiceCollapse = (selectedAnswer?: string) => {
  const [internalExpanded, setInternalExpanded] = React.useState(() => !selectedAnswer);
  const [internalPlacement, setInternalPlacement] = React.useState<SelectedAnswerPlacement>(() =>
    selectedAnswer ? 'above' : 'below'
  );
  // 无答案时直接派生默认展示，避免在 effect 里同步 setState 触发额外渲染。
  const isOptionsExpanded = selectedAnswer ? internalExpanded : true;
  const selectedAnswerPlacement = selectedAnswer ? internalPlacement : 'below';

  const collapseOptions = React.useCallback(() => {
    setInternalPlacement('above');
    setInternalExpanded(false);
  }, []);

  const toggleOptionsExpanded = React.useCallback(() => {
    setInternalPlacement('above');
    setInternalExpanded((state) => !state);
  }, []);

  return {
    isOptionsExpanded,
    selectedAnswerPlacement,
    shouldShowOptions: !selectedAnswer || isOptionsExpanded,
    collapseOptions,
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
      mt={mt}
      p={0}
      minW={0}
      border={0}
      bg={'transparent'}
      color={'primary.600'}
      fontSize={'11px'}
      fontWeight={500}
      lineHeight={'16px'}
      _hover={{
        cursor: 'pointer'
      }}
      onClick={onToggle}
    >
      <Box as="span">
        {isOptionsExpanded
          ? t('chat:interactive.user_select.collapse_options')
          : t('chat:interactive.user_select.expand_options')}
      </Box>
    </Box>
  );
});

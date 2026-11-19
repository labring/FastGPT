import React from 'react';
import { Box, type BoxProps, type SystemStyleObject } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import MyIcon from '../Icon';

/** 控制日期框在悬停、聚焦、展开或触屏时切换日历和清空图标。 */
export const datePickerClearStyles: SystemStyleObject = {
  '&[data-picker-open], &:hover, &:focus-within': { paddingRight: '4px' },
  '&[data-picker-open] [data-clear-button], &:hover [data-clear-button], &:focus-within [data-clear-button]':
    {
      opacity: 1,
      pointerEvents: 'auto',
      position: 'static'
    },
  '&[data-picker-open] [data-date-calendar], &:hover [data-date-calendar], &:focus-within [data-date-calendar]':
    {
      display: 'none'
    },
  '@media (hover: none)': {
    paddingRight: '4px',
    '[data-clear-button]': { opacity: 1, pointerEvents: 'auto', position: 'static' },
    '[data-date-calendar]': { display: 'none' }
  }
};

/** 清空日期并阻止事件触发外层选择器。 */
export const DatePickerClearButton = ({
  onClear,
  isDisabled,
  color,
  ml
}: {
  onClear: () => void;
  isDisabled?: boolean;
  color: string;
  ml?: BoxProps['ml'];
}) => {
  const { t } = useTranslation();
  return (
    <Box
      as={'button'}
      type={'button'}
      aria-label={t('common:Clear')}
      data-clear-button
      position={'absolute'}
      right={'4px'}
      opacity={0}
      pointerEvents={'none'}
      flexShrink={0}
      w={'1.75rem'}
      h={'1.75rem'}
      borderRadius={'full'}
      _hover={{ bg: 'rgba(17, 24, 36, 0.05)' }}
      display={'flex'}
      alignItems={'center'}
      justifyContent={'center'}
      disabled={isDisabled}
      onKeyDown={(event: React.KeyboardEvent<HTMLButtonElement>) => event.stopPropagation()}
      ml={ml}
      onClick={(event: React.MouseEvent<HTMLButtonElement>) => {
        event.stopPropagation();
        onClear();
      }}
    >
      <MyIcon name={'common/closeLight'} w={'16px'} h={'16px'} color={color} />
    </Box>
  );
};

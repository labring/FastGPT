import React from 'react';
import { Box } from '@chakra-ui/react';
import MyTooltip from '.';
import MyIcon from '../Icon';

interface Props {
  label?: string | React.ReactNode;
  maxW?: string | number;
  /** 默认 'none'，防止 SVG 子元素拦截事件导致 Tooltip 闪烁/误触发。需要 onClick 等事件时手动传 'auto' */
  pointerEvents?: 'none' | 'auto';
  [key: string]: any;
}

const QuestionTip = ({ label, maxW, pointerEvents = 'none', ...props }: Props) => {
  return (
    <MyTooltip
      label={label}
      maxW={maxW}
      shouldWrapChildren={false}
    >
      <Box display={'inline-flex'} alignItems={'center'} tabIndex={-1} lineHeight={0}>
        <MyIcon
          name={'help' as any}
          w={'16px'}
          color={'myGray.500'}
          display={'block'}
          pointerEvents={pointerEvents}
          {...(props as any)}
        />
      </Box>
    </MyTooltip>
  );
};

export default React.memo(QuestionTip);

import React from 'react';
import MyTooltip from '.';
import { type IconProps } from '@chakra-ui/icons';
import MyIcon from '../Icon';

type Props = IconProps & {
  label?: string | React.ReactNode;
};

const QuestionTip = ({ label, maxW, ...props }: Props) => {
  return (
    <MyTooltip label={label} maxW={maxW}>
      {/* 保留行内基线并居中对齐文字，避免 block 图标的底边被当成 Tooltip 触发元素的基线。 */}
      <MyIcon
        name={'help'}
        w={'16px'}
        color={'myGray.500'}
        display={'inline-block'}
        verticalAlign={'middle'}
        {...props}
      />
    </MyTooltip>
  );
};

export default React.memo(QuestionTip);

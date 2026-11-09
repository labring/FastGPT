import React from 'react';
import MyTooltip from '.';
import { type IconProps } from '@chakra-ui/icons';
import MyIcon from '../Icon';

// 问号图标固定为 help，排除原生 name 属性，避免透传 string 覆盖 MyIcon 的图标名类型。
type Props = Omit<IconProps, 'name'> & {
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

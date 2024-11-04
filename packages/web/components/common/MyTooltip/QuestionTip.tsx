import React from 'react';
import MyTooltip from '.';
import { IconProps } from '@chakra-ui/icons';
import MyIcon from '../Icon';

type Props = IconProps & {
  label?: string | React.ReactNode;
};

const QuestionTip = ({ label, maxW, ...props }: Props) => {
  return (
    <MyTooltip label={label} maxW={maxW}>
      <MyIcon name={'help' as any} w={'16px'} color={'myGray.500'} {...props} />
    </MyTooltip>
  );
};

export default QuestionTip;

import React from 'react';
import MyTooltip from '.';
import { IconProps, QuestionOutlineIcon } from '@chakra-ui/icons';

type Props = IconProps & {
  label?: string | React.ReactNode;
};

const QuestionTip = ({ label, maxW, ...props }: Props) => {
  return (
    <MyTooltip label={label} maxW={maxW}>
      <QuestionOutlineIcon w={'0.9rem'} {...props} />
    </MyTooltip>
  );
};

export default QuestionTip;

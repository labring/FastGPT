import React from 'react';
import MyTooltip from '.';
import { IconProps, QuestionOutlineIcon } from '@chakra-ui/icons';

type Props = IconProps & {
  label?: string | React.ReactNode;
};

const QuestionTip = ({ label, maxW, ...props }: Props) => {
  return (
    <MyTooltip label={label} maxW={maxW}>
      <QuestionOutlineIcon {...props} />
    </MyTooltip>
  );
};

export default QuestionTip;

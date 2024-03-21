import React from 'react';
import MyTooltip from '.';
import { IconProps, QuestionOutlineIcon } from '@chakra-ui/icons';

type Props = IconProps & {
  label?: string;
};

const QuestionTip = ({ label, ...props }: Props) => {
  return (
    <MyTooltip label={label}>
      <QuestionOutlineIcon {...props} />
    </MyTooltip>
  );
};

export default QuestionTip;

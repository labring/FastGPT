import React from 'react';
import MyTooltip from '.';
import MyIcon from '../Icon';

interface Props {
  label?: string | React.ReactNode;
  maxW?: string | number;
  [key: string]: any;
}

const QuestionTip = ({ label, maxW, ...props }: Props) => {
  return (
    <MyTooltip label={label} maxW={maxW}>
      <MyIcon
        name={'help' as any}
        w={'16px'}
        color={'myGray.500'}
        display={'block'}
        {...(props as any)}
      />
    </MyTooltip>
  );
};

export default React.memo(QuestionTip);

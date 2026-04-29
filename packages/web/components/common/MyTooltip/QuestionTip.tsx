import React from 'react';
import { Box } from '@chakra-ui/react';
import MyTooltip from '.';
import MyIcon from '../Icon';

interface Props {
  label?: string | React.ReactNode;
  maxW?: string | number;
  [key: string]: any;
}

const QuestionTip = ({ label, maxW, ...props }: Props) => {
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
          pointerEvents={'none'}
          {...(props as any)}
        />
      </Box>
    </MyTooltip>
  );
};

export default React.memo(QuestionTip);

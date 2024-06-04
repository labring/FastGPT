import React, { forwardRef } from 'react';
import { Box, BoxProps, SpinnerProps } from '@chakra-ui/react';
import Loading from '../MyLoading';

type Props = BoxProps & {
  isLoading?: boolean;
  text?: string;
  size?: SpinnerProps['size'];
};

const MyBox = ({ text, isLoading, children, size, ...props }: Props, ref: any) => {
  return (
    <Box ref={ref} position={isLoading ? 'relative' : 'unset'} {...props}>
      {isLoading && <Loading fixed={false} text={text} size={size} />}
      {children}
    </Box>
  );
};

export default forwardRef(MyBox);

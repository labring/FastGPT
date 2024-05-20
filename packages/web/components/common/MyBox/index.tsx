import React, { forwardRef } from 'react';
import { Box, BoxProps } from '@chakra-ui/react';
import Loading from '../MyLoading';

type Props = BoxProps & {
  isLoading?: boolean;
  text?: string;
};

const MyBox = ({ text, isLoading, children, ...props }: Props, ref: any) => {
  return (
    <Box ref={ref} position={isLoading ? 'relative' : 'unset'} {...props}>
      {isLoading && <Loading fixed={false} text={text} />}
      {children}
    </Box>
  );
};

export default forwardRef(MyBox);

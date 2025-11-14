import React, { forwardRef } from 'react';
import { Box, type BoxProps, type SpinnerProps } from '@chakra-ui/react';
import Loading from '../MyLoading';

type Props = BoxProps & {
  isLoading?: boolean;
  text?: string;
  size?: SpinnerProps['size'];
};

const MyBox = ({ text, isLoading, children, size, ...props }: Props, ref: any) => {
  return (
    <Box ref={ref} position={isLoading ? 'relative' : 'unset'} {...props}>
      {children}
      {isLoading && <Loading fixed={false} text={text} size={size} />}
    </Box>
  );
};

export default React.memo(forwardRef(MyBox));

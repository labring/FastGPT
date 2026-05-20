import React, { forwardRef } from 'react';
import { Box, type BoxProps, type SpinnerProps } from '@chakra-ui/react';
import Loading, { type LoadingVariant } from '../MyLoading';

type Props = BoxProps & {
  isLoading?: boolean;
  text?: string;
  size?: SpinnerProps['size'];
  loadingVariant?: LoadingVariant;
};

const MyBox = ({ text, isLoading, children, size, loadingVariant, ...props }: Props, ref: any) => {
  return (
    <Box ref={ref} position={isLoading ? 'relative' : 'unset'} {...props}>
      {children}
      {isLoading && <Loading fixed={false} text={text} size={size} variant={loadingVariant} />}
    </Box>
  );
};

export default React.memo(forwardRef(MyBox));

import React from 'react';
import { Box, BoxProps } from '@chakra-ui/react';
import Loading from '@/components/Loading';

type Props = BoxProps & {
  isLoading?: boolean;
  text?: string;
};

const MyBox = ({ text, isLoading, children, ...props }: Props) => {
  return (
    <Box position={'relative'} {...props}>
      {children}
      {isLoading && <Loading fixed={false} text={text} />}
    </Box>
  );
};

export default MyBox;

import React from 'react';
import { Box } from '@chakra-ui/react';
import { BoxProps } from '@chakra-ui/react';

const Container = ({ children, ...props }: BoxProps) => {
  return (
    <Box px={4} py={3} position={'relative'} {...props}>
      {children}
    </Box>
  );
};

export default React.memo(Container);

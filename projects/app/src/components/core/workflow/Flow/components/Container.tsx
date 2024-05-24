import React from 'react';
import { Box } from '@chakra-ui/react';
import { BoxProps } from '@chakra-ui/react';

const Container = ({ children, ...props }: BoxProps) => {
  return (
    <Box
      px={4}
      mx={2}
      mb={2}
      py={'10px'}
      position={'relative'}
      bg={'myGray.50'}
      border={'1px solid #F0F1F6'}
      borderRadius={'md'}
      {...props}
    >
      {children}
    </Box>
  );
};

export default React.memo(Container);

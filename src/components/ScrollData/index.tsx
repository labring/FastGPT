import React from 'react';
import type { BoxProps } from '@chakra-ui/react';
import { Box } from '@chakra-ui/react';

interface Props extends BoxProps {
  nextPage: () => void;
  children: React.ReactNode;
}

const ScrollData = ({ children, nextPage, ...props }: Props) => {
  return (
    <Box {...props} overflow={'auto'}>
      {children}
    </Box>
  );
};

export default ScrollData;

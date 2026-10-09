import React from 'react';
import { Box, type BoxProps } from '@chakra-ui/react';

export const Mark = ({ children, ...props }: BoxProps) => (
  <Box as="mark" bg="yellow.100" color="inherit" px={1} py={0.5} borderRadius="sm" {...props}>
    {children}
  </Box>
);

export default React.memo(Mark);

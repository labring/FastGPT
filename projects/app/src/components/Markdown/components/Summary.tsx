import React from 'react';
import { Box, type BoxProps } from '@chakra-ui/react';

export const Summary = ({ children, ...props }: BoxProps) => (
  <Box
    as="summary"
    cursor="pointer"
    fontWeight="medium"
    userSelect="none"
    outline="none"
    {...props}
  >
    {children}
  </Box>
);

export default React.memo(Summary);

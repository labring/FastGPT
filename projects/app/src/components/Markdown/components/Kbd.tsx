import React from 'react';
import { Box, type BoxProps } from '@chakra-ui/react';

export const Kbd = ({ children, ...props }: BoxProps) => (
  <Box
    as="kbd"
    bg="myGray.100"
    border="1px solid"
    borderColor="myGray.300"
    borderRadius="sm"
    boxShadow="0 1px 1px rgba(0, 0, 0, .15)"
    fontSize="xs"
    fontFamily="monospace"
    px={1.5}
    py={0.5}
    mx={0.5}
    {...props}
  >
    {children}
  </Box>
);

export default React.memo(Kbd);

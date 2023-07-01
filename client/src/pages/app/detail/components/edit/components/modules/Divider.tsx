import React from 'react';
import { Box, useTheme } from '@chakra-ui/react';

const Divider = ({ text }: { text: 'Body' | 'Input' | 'Output' | string }) => {
  const theme = useTheme();
  return (
    <Box
      textAlign={'center'}
      bg={'#f8f8f8'}
      py={2}
      borderTop={theme.borders.base}
      borderBottom={theme.borders.base}
      fontSize={'lg'}
    >
      {text}
    </Box>
  );
};

export default Divider;

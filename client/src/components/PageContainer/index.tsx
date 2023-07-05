import React from 'react';
import { Box, useTheme, type BoxProps } from '@chakra-ui/react';

const PageContainer = ({ children, ...props }: BoxProps) => {
  const theme = useTheme();
  return (
    <Box bg={'myGray.100'} h={'100%'} p={[0, 5]} {...props}>
      <Box
        flex={1}
        h={'100%'}
        bg={'white'}
        borderRadius={['', '2xl']}
        border={['', theme.borders.lg]}
        overflowY={'auto'}
      >
        {children}
      </Box>
    </Box>
  );
};

export default PageContainer;

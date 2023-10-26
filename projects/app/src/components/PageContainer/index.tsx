import React from 'react';
import { Box, useTheme, type BoxProps } from '@chakra-ui/react';
import MyBox from '../common/MyBox';

const PageContainer = ({ children, ...props }: BoxProps & { isLoading?: boolean }) => {
  const theme = useTheme();
  return (
    <MyBox bg={'myGray.100'} h={'100%'} p={[0, 5]} px={[0, 6]} {...props}>
      <Box
        h={'100%'}
        bg={'white'}
        borderRadius={props?.borderRadius || [0, '2xl']}
        border={['none', theme.borders.lg]}
        overflow={'overlay'}
      >
        {children}
      </Box>
    </MyBox>
  );
};

export default PageContainer;

import { Box } from '@chakra-ui/react';
import React from 'react';

const TestModeBetaTag = () => {
  return (
    <Box
      display={'inline-flex'}
      alignItems={'center'}
      justifyContent={'center'}
      flexShrink={0}
      minW={'23px'}
      minH={'14px'}
      px={'8px'}
      py={'4px'}
      borderRadius={'6px'}
      bg={'#FFFAEB'}
      color={'#DC6803'}
      fontSize={'10px'}
      lineHeight={'10px'}
      fontWeight={'500'}
      boxSizing={'border-box'}
      whiteSpace={'nowrap'}
    >
      Beta
    </Box>
  );
};

export default React.memo(TestModeBetaTag);

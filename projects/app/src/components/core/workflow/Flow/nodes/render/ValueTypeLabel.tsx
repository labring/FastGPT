import { Box } from '@chakra-ui/react';
import React from 'react';

const ValueTypeLabel = ({ children }: { children: React.ReactNode }) => {
  return (
    <Box
      bg={'myGray.100'}
      color={'myGray.500'}
      border={'base'}
      borderRadius={'sm'}
      ml={2}
      px={1}
      h={6}
      display={'flex'}
      alignItems={'center'}
      fontSize={'11px'}
    >
      {children}
    </Box>
  );
};

export default React.memo(ValueTypeLabel);

import React, { memo } from 'react';
import { Box } from '@chakra-ui/react';

const Loading = ({ text }: { text?: string }) => {
  return (
    <Box>
      <Box
        minW={'100px'}
        w={'100%'}
        h={'80px'}
        backgroundImage={'url("/imgs/loading.gif")'}
        backgroundSize={'contain'}
        backgroundRepeat={'no-repeat'}
        backgroundPosition={'center'}
      />
      {text && (
        <Box mt={1} textAlign={'center'} fontSize={'sm'} color={'myGray.600'}>
          {text}
        </Box>
      )}
    </Box>
  );
};

export default memo(Loading);

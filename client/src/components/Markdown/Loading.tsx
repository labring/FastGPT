import React, { memo } from 'react';
import { Box } from '@chakra-ui/react';

const Loading = () => {
  return (
    <Box
      minW={'100px'}
      w={'100%'}
      h={'80px'}
      backgroundImage={'url("/imgs/loading.gif")'}
      backgroundSize={'contain'}
      backgroundRepeat={'no-repeat'}
      backgroundPosition={'center'}
    />
  );
};

export default memo(Loading);

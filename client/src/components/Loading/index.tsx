import React from 'react';
import { Spinner, Flex } from '@chakra-ui/react';

const Loading = ({ fixed = true }: { fixed?: boolean }) => {
  return (
    <Flex
      position={fixed ? 'fixed' : 'absolute'}
      zIndex={1000}
      backgroundColor={'rgba(255,255,255,0.5)'}
      top={0}
      left={0}
      right={0}
      bottom={0}
      alignItems={'center'}
      justifyContent={'center'}
    >
      <Spinner thickness="4px" speed="0.65s" emptyColor="myGray.100" color="myBlue.600" size="xl" />
    </Flex>
  );
};

export default Loading;

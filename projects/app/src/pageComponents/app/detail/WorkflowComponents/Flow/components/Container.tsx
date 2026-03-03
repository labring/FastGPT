import React from 'react';
import { Flex } from '@chakra-ui/react';
import { type BoxProps } from '@chakra-ui/react';

const Container = ({ children, ...props }: BoxProps) => {
  return (
    <Flex
      flexDirection={'column'}
      mx={3}
      p={4}
      position={'relative'}
      bg={'myGray.25'}
      border={'1px solid #F0F1F6'}
      borderRadius={'md'}
      {...props}
    >
      {children}
    </Flex>
  );
};

export default React.memo(Container);

import React from 'react';
import { Flex, type FlexProps } from '@chakra-ui/react';
import MyIcon from './index';

const CloseIcon = (props: FlexProps) => {
  return (
    <Flex
      cursor={'pointer'}
      w={'1.5rem'}
      h={'1.5rem'}
      alignItems={'center'}
      justifyContent={'center'}
      borderRadius={'50%'}
      _hover={{ bg: 'myGray.200' }}
      {...props}
    >
      <MyIcon name={'common/closeLight'} w={'80%'} h={'80%'} color={'myGray.500'} />
    </Flex>
  );
};

export default CloseIcon;

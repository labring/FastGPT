import React from 'react';
import { Flex, type FlexProps } from '@chakra-ui/react';
import MyIcon from '@/components/Icon';

const CloseIcon = (props: FlexProps) => {
  return (
    <Flex
      cursor={'pointer'}
      w={'22px'}
      h={'22px'}
      alignItems={'center'}
      justifyContent={'center'}
      borderRadius={'50%'}
      _hover={{ bg: 'myGray.200' }}
      {...props}
    >
      <MyIcon name={'closeLight'} w={'12px'} color={'myGray.500'} />
    </Flex>
  );
};

export default CloseIcon;

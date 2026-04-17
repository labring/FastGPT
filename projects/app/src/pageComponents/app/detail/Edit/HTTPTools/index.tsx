import { Flex } from '@chakra-ui/react';
import React from 'react';
import Header from './Header';
import Edit from './Edit';

const HTTPTools = () => {
  return (
    <Flex h={'100%'} flexDirection={'column'} px={[3, 0]} pr={[3, 3]} bg={'myGray.25'}>
      <Header />
      <Edit />
    </Flex>
  );
};

export default React.memo(HTTPTools);

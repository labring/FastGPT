import React from 'react';
import { InputGroup, Input, InputProps, Flex } from '@chakra-ui/react';
import MyIcon from '../../Icon';

const SearchInput = (props: InputProps) => {
  return (
    <Flex alignItems={'center'} position={'relative'}>
      <Input {...props} />
      <MyIcon name={'common/searchLight'} w={'1rem'} position={'absolute'} left={2} zIndex={10} />
    </Flex>
  );
};

export default SearchInput;

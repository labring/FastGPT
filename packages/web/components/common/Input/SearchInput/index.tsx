import React from 'react';
import { Input, InputProps, InputGroup, InputLeftElement } from '@chakra-ui/react';
import MyIcon from '../../Icon';

const SearchInput = (props: InputProps) => {
  return (
    <InputGroup alignItems="center" size={'sm'}>
      <InputLeftElement>
        <MyIcon name="common/searchLight" w="16px" color={'myGray.500'} />
      </InputLeftElement>
      <Input fontSize="sm" bg={'myGray.50'} {...props} />
    </InputGroup>
  );
};

export default SearchInput;

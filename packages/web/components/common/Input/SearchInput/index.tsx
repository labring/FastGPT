import React, { useState } from 'react';
import { Input, type InputProps, InputGroup, InputLeftElement } from '@chakra-ui/react';
import MyIcon from '../../Icon';

const SearchInput = (props: InputProps) => {
  return (
    <InputGroup position={'relative'} maxW={props.maxW}>
      <MyIcon
        position={'absolute'}
        zIndex={10}
        left={2.5}
        name={'common/searchLight'}
        w={4}
        top={'50%'}
        transform={'translateY(-50%)'}
        color={'myGray.600'}
      />
      <Input fontSize="sm" bg={'myGray.25'} pl={8} {...props} />
    </InputGroup>
  );
};

export default React.memo(SearchInput);

import React from 'react';
import { Divider, type DividerProps } from '@chakra-ui/react';

const MyDivider = (props: DividerProps) => {
  const { h } = props;
  return <Divider my={4} borderBottomWidth={h || '1x'} {...props}></Divider>;
};

export default MyDivider;

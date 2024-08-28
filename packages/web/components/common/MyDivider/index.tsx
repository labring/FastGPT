import React from 'react';
import { Divider, type DividerProps } from '@chakra-ui/react';

const MyDivider = (props: DividerProps) => {
  const { h } = props;
  return (
    <Divider
      my={4}
      borderBottomWidth={h || '2px'}
      borderColor={props.color || 'myGray.200'}
      {...props}
    ></Divider>
  );
};

export default MyDivider;

import React from 'react';
import MyIcon from './index';
import { IconProps } from '@chakra-ui/react';

const DeleteIcon = (props: IconProps) => {
  return (
    <MyIcon
      className="delete"
      name={'delete' as any}
      w={'14px'}
      _hover={{ color: 'red.600' }}
      display={['block', 'none']}
      cursor={'pointer'}
      {...props}
    />
  );
};

export default DeleteIcon;

export const hoverDeleteStyles = {
  '& .delete': {
    display: 'block'
  }
};

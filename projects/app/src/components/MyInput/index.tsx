import React from 'react';
import { Flex, Input, InputProps } from '@chakra-ui/react';

interface Props extends InputProps {
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

const MyInput = ({ leftIcon, rightIcon, ...props }: Props) => {
  return (
    <Flex h={'100%'} position={'relative'} alignItems={'center'}>
      <Input
        w={'100%'}
        pl={leftIcon ? '34px !important' : 3}
        pr={rightIcon ? '34px !important' : 3}
        {...props}
      />
      {leftIcon && (
        <Flex alignItems={'center'} position={'absolute'} left={3} w={'20px'} zIndex={10}>
          {leftIcon}
        </Flex>
      )}
      {rightIcon && (
        <Flex alignItems={'center'} position={'absolute'} right={3} w={'20px'} zIndex={10}>
          {rightIcon}
        </Flex>
      )}
    </Flex>
  );
};

export default MyInput;

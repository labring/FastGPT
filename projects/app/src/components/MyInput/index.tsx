import React, { forwardRef } from 'react';
import { Flex, Input, type InputProps } from '@chakra-ui/react';

interface Props extends InputProps {
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

const MyInput = forwardRef<HTMLInputElement, Props>(({ leftIcon, rightIcon, ...props }, ref) => {
  return (
    <Flex h={'100%'} position={'relative'} alignItems={'center'}>
      <Input
        ref={ref}
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
});

MyInput.displayName = 'MyInput';

export default MyInput;

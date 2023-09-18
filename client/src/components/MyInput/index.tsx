import React from 'react';
import { Flex, Input, InputProps } from '@chakra-ui/react';

interface Props extends InputProps {
  leftIcon?: React.ReactNode;
}

const MyInput = ({ leftIcon, ...props }: Props) => {
  return (
    <Flex position={'relative'} alignItems={'center'}>
      <Input w={'100%'} pl={leftIcon ? '30px !important' : 3} {...props} />
      {leftIcon && (
        <Flex
          alignItems={'center'}
          position={'absolute'}
          left={3}
          w={'20px'}
          zIndex={10}
          transform={'translateY(1.5px)'}
        >
          {leftIcon}
        </Flex>
      )}
    </Flex>
  );
};

export default MyInput;

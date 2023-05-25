import React from 'react';
import { Image } from '@chakra-ui/react';
import type { ImageProps } from '@chakra-ui/react';

const Avatar = ({ w = '30px', ...props }: ImageProps) => {
  return (
    <Image
      fallbackSrc="/icon/logo.png"
      borderRadius={'50%'}
      objectFit={'cover'}
      alt=""
      w={w}
      h={w}
      {...props}
    />
  );
};

export default Avatar;
